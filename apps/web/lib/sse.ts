// Client-side SSE frame parsing for /api/chat. Mirrors the canonical frame
// shapes from apps/agent (chat.ts SseFrame + test/eval/harness.ts parseSse),
// adapted to the incremental stream-reader path used by the chat store.

import type { AuditReport, MessageMeta, WalletProfile } from "@hexpert/shared";

export type SseFrame =
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "webSearch"; query: string; urls: string[]; bytes: number }
  | { type: "hitl"; question: string; options: string[] }
  | { type: "report"; auditReport: AuditReport }
  | { type: "walletProfile"; walletProfile: WalletProfile }
  | { type: "meta"; meta: MessageMeta }
  | { type: "error"; error: string }
  | { type: "done" };

/**
 * Drive a fetch Response's SSE body, invoking `onFrame` for each parsed frame.
 * Frames are `data: <json>\n\n` lines plus a terminal `data: [DONE]`. Non-JSON
 * and empty lines are ignored. Resolves when the stream closes.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SseFrame) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by a blank line. Process complete chunks.
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (!payload) continue;
        if (payload === "[DONE]") {
          onFrame({ type: "done" });
          continue;
        }
        try {
          const obj = JSON.parse(payload) as unknown;
          if (obj && typeof obj === "object" && "type" in obj) {
            onFrame(obj as SseFrame);
          }
        } catch {
          // Ignore non-JSON keepalives / comments.
        }
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* noop */
    }
  }
}