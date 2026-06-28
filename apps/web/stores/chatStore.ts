// PRD §3 frontend store. Per CLAUDE.md §5: all business logic lives here as
// actions; components are UI-only; a single `updateAppState(partial)` performs
// all state updates; actions read state via `get()` and never take state as a
// parameter. Threads persist to IndexedDB (R10 F3); API keys stay in
// sessionStorage and are never unified with threads.
//
// Request contract (PRD §3.2/§3.3, corrected 2026-06-28): POST /api/chat with
// body { message, sessionId, fileContent?, fileName? } + BYOK headers. The
// client sends NO checkpoint — HITL state is server-side in Redis keyed by
// sessionId (ADR-008); resume reuses the same sessionId + the chosen option
// text as `message`.

import { create } from "zustand";
import type { AuditReport, Intent, MessageMeta, Provider, WalletProfile } from "@hexpert/shared";
import { readSseStream, type SseFrame } from "../lib/sse";
import { isMultiSelectHITL } from "../lib/hitl";
import { loadAllSessions, saveSession, deleteSession } from "../lib/idb";

// --- sessionStorage keys (tab-scoped; cleared on tab close) -----------------
const SS_SESSION = "hexpert_session_id";
const SS_PROVIDER = "hexpert_provider";
const SS_API_KEY = "hexpert_api_key";
const SS_MODEL = "hexpert_model";
const SS_SEARCH_KEY = "hexpert_search_key";

// --- UI message + thread model ---------------------------------------------

export type UiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  /** User message: attached .sol file name. */
  fileName?: string;
  /** Assistant: which subgraph handled this turn (from the `meta` frame). */
  intent?: Intent;
  /** Assistant: early client-side intent hint shown immediately, replaced by
   *  `intent` when the `meta` frame arrives at turn-end (R10 F4). */
  intentHint?: Intent;
  /** Assistant: still receiving tokens. */
  streaming?: boolean;
  /** Assistant: surfaced error for this turn. */
  error?: string;
  /** Assistant: HITL prompt awaiting a user reply. */
  hitl?: { question: string; options: string[]; multi: boolean };
  /** Assistant: structured audit report (deterministic, not streamed). */
  auditReport?: AuditReport;
  /** Assistant: structured wallet profile (R10 F1). */
  walletProfile?: WalletProfile;
  /** Assistant: tool calls observed during the turn, in order (R10 F5). */
  toolCalls?: string[];
  /** Assistant: web_search runs observed during the turn, in order
   *  (query, surfed URLs, bytes retrieved). */
  webSearches?: WebSearchRun[];
  /** Assistant: per-turn metadata from the `meta` frame. */
  meta?: MessageMeta;
};

/** One web_search invocation's surfaced detail (from the `webSearch` frame). */
export type WebSearchRun = {
  query: string;
  urls: string[];
  bytes: number;
};

export type Thread = {
  sessionId: string;
  title: string;
  messages: UiMessage[];
  createdAt: number;
  lastActivity: number;
};

type Settings = {
  provider: Provider;
  apiKey: string;
  model: string;
  searchKey: string;
};

type ChatState = Settings & {
  threads: Thread[];
  activeSessionId: string;
  configured: boolean;
  settingsOpen: boolean;
  designSystemOpen: boolean;
  streaming: boolean;

  // Single updater for all state changes (CLAUDE.md §5).
  updateAppState: (partial: Partial<ChatState>) => void;

  // Lifecycle
  init: () => void;

  // Threads
  newChat: () => void;
  selectThread: (sessionId: string) => void;
  deleteThread: (sessionId: string) => void;

  // Settings
  saveSettings: (partial: Partial<Settings>) => void;
  openSettings: (open: boolean) => void;
  openDesignSystem: (open: boolean) => void;

  // Streaming (acquire/release pair: sendMessage / stopStream)
  sendMessage: (text: string, file?: { name: string; content: string } | null) => Promise<void>;
  stopStream: () => void;
};

// Abort controller held outside render-affecting state.
let activeAbort: AbortController | null = null;

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;

function ssGet(key: string): string {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(key) ?? "";
}
function ssSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(key, value);
}
function ssDel(key: string): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(key);
}

function isConfigured(s: Settings): boolean {
  return Boolean(s.provider && s.apiKey && s.model && s.searchKey);
}

function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t ? (t.length > 40 ? t.slice(0, 40) + "…" : t) : "New chat";
}

// Early client-side intent hint (R10 F4). Mirrors the agent's deterministic
// pre-pass (apps/agent/src/graphs/mainGraph.ts): file → audit; 0x…40-hex or ENS
// → wallet; else qna. Shown immediately, replaced by `meta.intent` at turn-end.
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const ENS_RE = /\b[a-z0-9-]+\.eth\b/i;
function hintIntent(text: string, hasFile: boolean): Intent {
  if (hasFile) return "audit";
  if (ADDRESS_RE.test(text) || ENS_RE.test(text)) return "wallet";
  return "qna";
}

export const useChatStore = create<ChatState>()((set, get) => {
  // Patch the last assistant message in the active thread.
  const patchAssistant = (patch: Partial<UiMessage> | ((m: UiMessage) => Partial<UiMessage>)) => {
    const { threads, activeSessionId } = get();
    const updated = threads.map((t) => {
      if (t.sessionId !== activeSessionId) return t;
      const msgs = [...t.messages];
      const i = msgs.length - 1;
      if (i < 0 || msgs[i].role !== "assistant") return t;
      const cur = msgs[i];
      const p = typeof patch === "function" ? patch(cur) : patch;
      msgs[i] = { ...cur, ...p };
      return { ...t, messages: msgs, lastActivity: Date.now() };
    });
    get().updateAppState({ threads: updated });
  };

  return {
    provider: "openai",
    apiKey: "",
    model: "",
    searchKey: "",
    threads: [],
    activeSessionId: "",
    configured: false,
    settingsOpen: false,
    designSystemOpen: false,
    streaming: false,

    updateAppState: (partial) => set(partial),

    init: () => {
      const settings: Settings = {
        provider: (ssGet(SS_PROVIDER) || "openai") as Provider,
        apiKey: ssGet(SS_API_KEY),
        model: ssGet(SS_MODEL),
        searchKey: ssGet(SS_SEARCH_KEY),
      };
      // Restore or create the active session id (sessionStorage).
      let sessionId = ssGet(SS_SESSION);
      if (!sessionId) {
        sessionId = uid();
        ssSet(SS_SESSION, sessionId);
      }
      // Settings + active session apply immediately (sync); threads hydrate
      // from IndexedDB after the async load resolves (R10 F3).
      get().updateAppState({
        ...settings,
        configured: isConfigured(settings),
        activeSessionId: sessionId,
      });
      void (async () => {
        const fresh = (): Thread => ({
          sessionId: sessionId!,
          title: "New chat",
          messages: [],
          createdAt: Date.now(),
          lastActivity: Date.now(),
        });
        try {
          const sessions = await loadAllSessions();
          if (sessions.length > 0) {
            let active = sessionId!;
            if (!sessions.some((t) => t.sessionId === active)) {
              active = sessions[0].sessionId;
              ssSet(SS_SESSION, active);
            }
            get().updateAppState({ threads: sessions, activeSessionId: active });
          } else {
            const thread = fresh();
            await saveSession(thread);
            get().updateAppState({ threads: [thread] });
          }
        } catch {
          // IndexedDB unavailable (private mode / blocked) — in-memory only.
          if (!get().threads.length) get().updateAppState({ threads: [fresh()] });
        }
      })();
    },

    newChat: () => {
      const sessionId = uid();
      ssSet(SS_SESSION, sessionId);
      const exists = get().threads.some((t) => t.sessionId === sessionId);
      const thread: Thread = {
        sessionId,
        title: "New chat",
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      const threads = exists ? get().threads : [thread, ...get().threads];
      get().updateAppState({ activeSessionId: sessionId, threads, designSystemOpen: false });
      if (!exists) void saveSession(thread);
    },

    selectThread: (sessionId) => {
      ssSet(SS_SESSION, sessionId);
      get().updateAppState({ activeSessionId: sessionId, designSystemOpen: false });
    },

    deleteThread: (sessionId) => {
      void deleteSession(sessionId); // best-effort
      const threads = get().threads.filter((t) => t.sessionId !== sessionId);
      const wasActive = get().activeSessionId === sessionId;
      if (wasActive) {
        const next = threads[0];
        if (next) {
          ssSet(SS_SESSION, next.sessionId);
          get().updateAppState({ threads, activeSessionId: next.sessionId });
        } else {
          // Fall back to a fresh empty thread.
          const freshSessionId = uid();
          ssSet(SS_SESSION, freshSessionId);
          const fresh: Thread = {
            sessionId: freshSessionId,
            title: "New chat",
            messages: [],
            createdAt: Date.now(),
            lastActivity: Date.now(),
          };
          void saveSession(fresh);
          get().updateAppState({ threads: [fresh], activeSessionId: freshSessionId });
        }
      } else {
        get().updateAppState({ threads });
      }
    },

    saveSettings: (partial) => {
      const next: Settings = {
        provider: partial.provider ?? get().provider,
        apiKey: partial.apiKey ?? get().apiKey,
        model: partial.model ?? get().model,
        searchKey: partial.searchKey ?? get().searchKey,
      };
      ssSet(SS_PROVIDER, next.provider);
      ssSet(SS_API_KEY, next.apiKey);
      ssSet(SS_MODEL, next.model);
      ssSet(SS_SEARCH_KEY, next.searchKey);
      get().updateAppState({ ...next, configured: isConfigured(next), settingsOpen: false });
    },

    openSettings: (open) => get().updateAppState({ settingsOpen: open }),
    openDesignSystem: (open) => get().updateAppState({ designSystemOpen: open }),

    stopStream: () => {
      activeAbort?.abort();
      activeAbort = null;
      patchAssistant({ streaming: false });
      get().updateAppState({ streaming: false });
    },

    sendMessage: async (text, file) => {
      const trimmed = text.trim();
      if (!trimmed && !file) return;
      if (get().streaming) return;
      if (!get().configured) {
        get().openSettings(true);
        return;
      }

      const sessionId = get().activeSessionId;
      // Ensure an active thread exists.
      let threads = get().threads;
      if (!threads.some((t) => t.sessionId === sessionId)) {
        threads = [
          { sessionId, title: "New chat", messages: [], createdAt: Date.now(), lastActivity: Date.now() },
          ...threads,
        ];
      }
      const now = Date.now();
      const userMsg: UiMessage = {
        id: uid(),
        role: "user",
        content: trimmed,
        timestamp: now,
        ...(file ? { fileName: file.name } : {}),
      };
      const assistantMsg: UiMessage = {
        id: uid(),
        role: "assistant",
        content: "",
        timestamp: now,
        streaming: true,
        intentHint: hintIntent(trimmed, !!file),
      };
      threads = threads.map((t) => {
        if (t.sessionId !== sessionId) return t;
        const messages = [...t.messages, userMsg, assistantMsg];
        const title =
          t.messages.length === 0 && trimmed ? titleFrom(trimmed) : t.title;
        return { ...t, messages, title, lastActivity: now };
      });
      get().updateAppState({ threads, streaming: true });

      const abort = new AbortController();
      activeAbort = abort;

      const req = {
        message: trimmed || (file ? `Audit ${file.name}` : ""),
        sessionId,
        ...(file ? { fileContent: file.content, fileName: file.name } : {}),
      };
      const { provider, apiKey, model, searchKey } = get();
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Provider": provider,
            "X-Model": model,
            "X-Api-Key": apiKey,
            "X-Search-Key": searchKey,
          },
          body: JSON.stringify(req),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          let errorText = `Request failed (${res.status})`;
          try {
            const data = (await res.json()) as { error?: string };
            if (data?.error) errorText = data.error;
          } catch {
            /* keep default */
          }
          if (res.status === 401) {
            errorText += " — check your API keys in Settings.";
            get().openSettings(true);
          }
          patchAssistant({ streaming: false, error: errorText });
          return;
        }
        await readSseStream(
          res.body,
          (frame: SseFrame) => {
            switch (frame.type) {
              case "token":
                patchAssistant((m) => ({ content: m.content + frame.text }));
                break;
              case "hitl":
                patchAssistant({
                  hitl: {
                    question: frame.question,
                    options: frame.options,
                    multi: isMultiSelectHITL(frame.options),
                  },
                });
                break;
              case "report":
                patchAssistant({ auditReport: frame.auditReport });
                break;
              case "walletProfile":
                patchAssistant({ walletProfile: frame.walletProfile });
                break;
              case "meta":
                patchAssistant({
                  meta: frame.meta,
                  intent: frame.meta.intent,
                  streaming: false,
                });
                break;
              case "error":
                patchAssistant({ error: frame.error, streaming: false });
                break;
              case "done":
                patchAssistant({ streaming: false });
                break;
              case "tool":
                patchAssistant((m) => ({
                  toolCalls: [...(m.toolCalls ?? []), frame.name],
                }));
                break;
              case "webSearch":
                patchAssistant((m) => ({
                  webSearches: [
                    ...(m.webSearches ?? []),
                    { query: frame.query, urls: frame.urls, bytes: frame.bytes },
                  ],
                }));
                break;
              default:
                break;
            }
          },
          abort.signal,
        );
      } catch (err) {
        if (abort.signal.aborted) {
          // User-initiated stop — already handled by stopStream.
          patchAssistant({ streaming: false });
        } else {
          patchAssistant({
            streaming: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        if (activeAbort === abort) activeAbort = null;
        // Guarantee the per-message cursor stops even if the stream closed
        // without a [DONE]/meta/error frame (e.g. dropped connection). The
        // global flag below unlocks the input; this clears the bubble's
        // streaming affordance so it doesn't blink forever.
        patchAssistant({ streaming: false });
        get().updateAppState({ streaming: false });
        // Persist the active thread (R10 F3) — captures the final assistant
        // message incl. meta / auditReport / walletProfile / hitl / toolCalls.
        const active = get().threads.find((t) => t.sessionId === get().activeSessionId);
        if (active) void saveSession(active);
      }
    },
  };
});

// Convenience selector hook for the active thread.
export function selectActiveThread(state: ChatState): Thread | undefined {
  return state.threads.find((t) => t.sessionId === state.activeSessionId);
}

// Re-export for components that need to clear keys (e.g. on explicit logout).
export { ssDel as clearSessionKey };