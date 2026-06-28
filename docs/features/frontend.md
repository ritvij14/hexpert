# Feature: Web Frontend (`@hexpert/web`)

> **Module doc for `apps/web/`.** Read this before working on anything in `apps/web/`.
> Part of: Hexpert — see CLAUDE.md for full project context.
> Status: Stable (localhost-demo baseline + R10 F1/F3/F4/F5 implemented 2026-06-28)
> Last updated: 2026-06-28
>
> **Promotion threshold:** When this file exceeds ~400 lines, promote to `docs/features/frontend/` directory.

---

## What This Feature Does

The Next.js 16 (App Router) frontend for Hexpert — a single chat interface at `/`
that talks to the local agent on `:3001` (via a same-origin Next.js API gateway)
for Ethereum Q&A, wallet analysis, and `.sol` contract auditing. Streams assistant
responses progressively, renders HITL option chips, renders the audit report
grouped by severity, and renders the wallet-profile card from a structured
frame. Spec: PRD §3. Design source of truth: `docs/design/` (`DESIGN.md` +
`generated-page.html`). State is Zustand, persisted to IndexedDB (R10 F3).

---

## Files & Ownership

```
apps/web/
├── app/
│   ├── layout.tsx            # Root layout — next/font Inter + Geist Mono CSS vars
│   ├── globals.css           # Tailwind v4 @theme (fonts), scrollbar, stream-cursor, .hljs theme
│   ├── page.tsx              # "use client" — composes Sidebar/Header/ChatStream/ChatInput/Settings/DesignSystem; one boundary useEffect → store.init()
│   └── api/chat/route.ts      # Gateway: proxy /api/chat → LAMBDA_URL (no SigV4 locally), per-field caps, stream SSE through
├── stores/chatStore.ts        # Single Zustand store — ALL business logic lives here as actions (CLAUDE.md §5); threads persist to IndexedDB
├── lib/
│   ├── sse.ts                 # Incremental SSE stream reader + SseFrame union (mirrors agent chat.ts/harness)
│   ├── idb.ts                 # IndexedDB persistence: `sessions` store keyed by sessionId (R10 F3)
│   ├── hitl.ts                # Wallet/audit HITL option-set detection + multi/single + "Full summary" exclusivity
│   └── file.ts               # .sol attachment validation (≤64KB, .sol only)
└── components/                # UI-only — no logic, no useEffect for side effects
    ├── Sidebar.tsx            # Thread list, New chat, Design System button
    ├── Header.tsx             # HEXPERT logo, Settings button
    ├── ChatStream.tsx         # Active thread messages + empty/onboarding state; auto-scroll (boundary effect)
    ├── MessageBubble.tsx      # User bubble / assistant (intent tag [hint→meta], tool pills, markdown, wallet card, audit report, HITL, meta, error)
    ├── Markdown.tsx           # react-markdown + remark-gfm + rehype-highlight; pre passthrough, code → CodeBlock
    ├── CodeBlock.tsx          # Dark code chrome: filename + copy + line numbers + highlighted code
    ├── HITLChips.tsx          # Chips + Send; multi vs single; Full-summary exclusivity
    ├── AuditReportView.tsx   # Findings grouped high/medium/low/info; severity cards + overall badge
    ├── WalletProfileView.tsx # Wallet-profile card (R10 F1): header + 3-stat grid + summary
    ├── WebSearchActivity.tsx # web_search detail card: query count, surfed URLs (links), bytes retrieved
    ├── ChatInput.tsx          # Auto-expanding textarea, .sol attach, send/stop (acquire/release)
    ├── SettingsDrawer.tsx     # 4-provider selector, model, API key + Tavily key (show/hide); syncs from store on open
    └── DesignSystem.tsx       # The Design System & Docs view (port of generated-page.html)
```

**What lives where (non-negotiable, CLAUDE.md §5):**
- All business logic → `stores/chatStore.ts` actions. Components are UI-only.
- Single `updateAppState(partial)` for every state change; actions read state via `get()`, never take state as a param.
- `useEffect` only at the React/browser boundary (init, auto-scroll). Derived state → `useMemo`/const; "do X when Y" → event handler/store action.
- Acquire/release pairs for resources: `sendMessage` acquires an `AbortController`; `stopStream` releases it.
- `constants/` (if ever added) is pure data only.

---

## Data Model

**Store state (`chatStore.ts`):** `threads: Thread[]`, `activeSessionId`, BYOK
settings (`provider/apiKey/model/searchKey` + derived `configured`), UI flags
(`settingsOpen`, `designSystemOpen`), `streaming`. Single updater
`updateAppState(partial)`.

```typescript
type UiMessage = {
  id: string; role: "user" | "assistant"; content: string; timestamp: number;
  fileName?: string;          // user: attached .sol name
  intent?: Intent;            // assistant: from meta frame (turn-end)
  intentHint?: Intent;        // assistant: early client-side hint (R10 F4), replaced by intent
  streaming?: boolean; error?: string;
  hitl?: { question: string; options: string[]; multi: boolean };
  auditReport?: AuditReport;  // from the `report` frame
  walletProfile?: WalletProfile; // from the `walletProfile` frame (R10 F1)
  toolCalls?: string[];       // tool-call names observed this turn (R10 F5)
  webSearches?: WebSearchRun[]; // web_search runs this turn: { query, urls, bytes } from `webSearch` frame
  meta?: MessageMeta;
};
type Thread = { sessionId: string; title: string; messages: UiMessage[]; createdAt: number; lastActivity: number };
```

**Persistence:** IndexedDB (`apps/web/lib/idb.ts`, R10 F3) — a `sessions` object
store keyed by `sessionId` holds the **full `Thread`** (`UiMessage[]`, incl.
meta / auditReport / walletProfile / hitl / toolCalls) so a reload reproduces the
rich views, not just the minimal `StoredMessage`. `init` hydrates settings +
active session from sessionStorage synchronously, then loads threads from IDB;
`newChat`/`deleteThread` persist/delete; `sendMessage` persists the active
thread in its `finally`. IDB failure (private mode) falls back to in-memory.
API keys stay in `sessionStorage` (`hexpert_*`), never unified with threads.

**Related entities (read, not owned):** `ChatRequest`, `Message`, `MessageMeta`,
`Intent`, `AuditReport`, `AuditFinding`, `WalletProfile`, `Provider` from `@hexpert/shared`.

---

## API / SSE Contract

The browser only ever calls same-origin `POST /api/chat`. The gateway
(`app/api/chat/route.ts`) forwards to `LAMBDA_URL/api/chat` (no SigV4 on the
local path — ADR-012). BYOK headers (`X-Provider`, `X-Model`, `X-Api-Key`,
`X-Search-Key`) are read from `sessionStorage`, never `localStorage`.

```
POST /api/chat
Headers: X-Provider, X-Model, X-Api-Key, X-Search-Key
Body (ChatRequest): { message, sessionId, fileContent?, fileName? }
Response: text/event-stream — frames below + a terminal `data: [DONE]`
```

**SSE frames** (canonical shape in `apps/agent/src/routes/chat.ts` `SseFrame` +
`apps/agent/test/eval/harness.ts` `parseSse`; frontend mirror in `lib/sse.ts`):

| Frame | Shape | Frontend handling |
|---|---|---|
| `token` | `{type:"token", text}` | append to live assistant message content |
| `tool` | `{type:"tool", name}` | append to `toolCalls`; render muted tool-call pills above the stream (R10 F5) |
| `webSearch` | `{type:"webSearch", query, urls[], bytes}` | append to `webSearches`; render `WebSearchActivity` (query count, surfed-URL links, bytes retrieved) above the stream |
| `hitl` | `{type:"hitl", question, options[]}` | set `hitl` on message; render chips (multi=wallet / single=audit, auto-detected) |
| `report` | `{type:"report", auditReport}` | set `auditReport`; render `AuditReportView` (deterministic, never streamed as tokens) |
| `walletProfile` | `{type:"walletProfile", walletProfile}` | set `walletProfile`; render `WalletProfileView` (R10 F1) |
| `meta` | `{type:"meta", meta:MessageMeta}` | set `meta` + `intent` (replaces `intentHint`), mark done |
| `error` | `{type:"error", error}` | surface error |
| `[DONE]` | `data: [DONE]` | finalize (streaming=false) |

**HITL resume:** resend the same `sessionId` + the chosen option text as `message`
(no checkpoint sent — it's server-side in Redis, ADR-008). Wallet = multi-select
(joined text, backend substring-matches "defi"/"nft"/"governance"); audit =
single-select. Exact option strings are the contract — see `lib/hitl.ts`.

**Gateway validation:** per-field caps (message ≤8KB, fileName ≤256B,
fileContent ≤64KB, 3MB Content-Length pre-check). Forwards upstream status
verbatim (401 → client prompts to check keys). 55s timeout → 504; upstream
unavailable → 502.

---

## Key Flows

### Send a message (streaming)
1. `ChatInput.submit()` → `store.sendMessage(text, file)`
2. Store guards `configured` (else opens settings), appends user + assistant-streaming messages, sets `streaming=true`, creates `AbortController`
3. `fetch("/api/chat", {body: ChatRequest, BYOK headers, signal})` → gateway → agent
4. `readSseStream()` drives `response.body`; each frame `patchAssistant()`-es the active thread's last assistant message via `updateAppState({threads})`
5. `meta`/`done`/`error` set `streaming=false`; `finally` clears the abort + `streaming`

### HITL suspend → resume
1. Agent suspends at `interrupt()` → `hitl` frame → message shows question + chips (`HITLChips`)
2. User selects chip(s) → Send → `sendMessage(joinSelection(selected))` with the **same sessionId**
3. Agent resumes via `Command({resume})` keyed by sessionId; streams turn 2

### Audit (attach + report)
1. `ChatInput` validates `.sol` (≤64KB) → sends `fileContent`+`fileName` → router sees file → audit subgraph
2. `hitl` frame (Generate a fix / Show an exploit / Full report only) → user picks "Full report only"
3. `report` frame carries `AuditReport` → `AuditReportView` renders findings by severity

---

## Dependencies

**Depends on:**
- `@hexpert/shared` (types; source-only via `transpilePackages` in `next.config.mjs`)
- The agent on `:3001` (`apps/agent`, `tsx` + `REDIS_URL`); keys in the UI or `LOCAL_DEV_*` for curl
- Runtime libs: `zustand@5`, `react-markdown` + `remark-gfm` + `rehype-highlight`, `@iconify/react` (on-demand solar icons)

**Infra docs to read when working here:**
- `docs/prds/prd.md` §3 (spec) and §6 (deferred storage/analytics)
- `docs/infra/risks.md` R10 (the 5 gap decisions — F1/F3/F4/F5 are the open tasks)
- `docs/design/` (visual source of truth)

---

## Known Issues & Tech Debt

R10 (the five frontend gap decisions) is now **resolved** — see
`docs/infra/risks.md` R10 for the implementation notes. Remaining:
- **F2** Icons use on-demand fetch (`@iconify/react`), not bundled offline — fine for the online localhost demo.
- No frontend tests yet (PRD §5 defers the frontend test layer).
- `estimatedCostUsd` is always 0 (PRD §6 cost formula deferred); `meta` footer shows tokens/latency/tool-call count instead.
- Brief empty-state flash on reload before IndexedDB hydrates threads (acceptable for the demo).

---

## Testing

No automated frontend tests yet (PRD §5 defers the frontend test layer). Manual
verification done 2026-06-28: `tsc --noEmit` clean; `next build` green; dev server
serves `/` (HTTP 200); gateway returns clean 502 (agent down) / 504 (timeout);
per-field caps return 413/400 as expected. After the R10 F1/F3/F4/F5 follow-up,
agent `tsc` + web `next build` re-verified green. Live token streaming + HITL +
report + wallet-card + tool-pill rendering still need the agent + Redis + BYOK
keys to exercise end-to-end.

---

## Recent Changes

- **2026-06-28 (follow-up):** Implemented R10 F1/F3/F4/F5. F1: `walletProfile` SSE frame in `chat.ts` + `lib/sse.ts`, `WalletProfileView.tsx`, wired into `MessageBubble`. F3: `lib/idb.ts` IndexedDB persistence, `chatStore` hydrates/persists threads. F4: client-side `intentHint` shown immediately, replaced by `meta.intent`. F5: `tool` frames rendered as muted tool-call pills. tsc + `next build` green.
- **2026-06-28:** Initial build of the `apps/web` slice in one session — store, gateway, all components, design system view, fonts/markdown/icons. tsc + build green; gateway smoke-tested. 5 gap decisions recorded in R10 for a follow-up thread.