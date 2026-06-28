// PRD §4.10 — POST /api/chat handler.
// Streams the assistant response as SSE (text/event-stream) with a final meta
// frame. Resume vs. new turn is decided by the Redis checkpointer state for
// thread_id = sessionId (ADR-008).

import { Router } from "express";
import { Command, type StateSnapshot } from "@langchain/langgraph";
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import type { AuditReport, ChatRequest, Message, MessageMeta, WalletProfile } from "@hexpert/shared";
import type { ChatLocals } from "../middleware/extractHeaders.js";
import { buildMainGraph } from "../graphs/mainGraph.js";

export const chatRouter = Router();

type SseFrame =
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "webSearch"; query: string; urls: string[]; bytes: number }
  | { type: "hitl"; question: string; options: string[] }
  | { type: "report"; auditReport: AuditReport }
  | { type: "walletProfile"; walletProfile: WalletProfile }
  | { type: "meta"; meta: MessageMeta }
  | { type: "error"; error: string };

function sse(res: { write: (chunk: string) => void }, frame: SseFrame): void {
  res.write(`data: ${JSON.stringify(frame)}\n\n`);
}

/**
 * If the graph suspended at a HITL interrupt, extract the { question, options }
 * value passed to interrupt(). Returns null if not suspended or no matching
 * interrupt shape. Generic enough for the audit subgraph now and the wallet
 * subgraph later.
 */
function extractInterrupt(
  snap: StateSnapshot,
): { question: string; options: string[] } | null {
  for (const task of snap.tasks ?? []) {
    const interrupts = (task as { interrupts?: Array<{ value?: unknown }> }).interrupts ?? [];
    for (const intr of interrupts) {
      const v = intr.value;
      if (v && typeof v === "object" && "question" in v && "options" in v) {
        const question = (v as { question: unknown }).question;
        const options = (v as { options: unknown }).options;
        if (typeof question === "string" && Array.isArray(options)) {
          return { question, options: options.map(String) };
        }
      }
    }
  }
  return null;
}

chatRouter.post("/", async (req, res) => {
  // SSE headers. Disable proxy buffering (best-effort across runtimes).
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const locals = res.locals as ChatLocals;
  const body = req.body as ChatRequest;
  const sessionId = body.sessionId;
  const config = { configurable: { thread_id: sessionId } };

  const start = Date.now();
  let toolCallCount = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  // Capture web_search query at on_tool_start (where ev.data.input is reliably
  // populated) keyed by run_id, then consume it at on_tool_end.
  const webSearchQueries = new Map<string, string>();
  const abort = new AbortController();
  // Abort the upstream LLM stream only if the client disconnects mid-response.
  // (req 'close' fires as soon as the body is read — not a disconnect signal.)
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  try {
    const graph = buildMainGraph({
      provider: locals.provider,
      apiKey: locals.apiKey,
      model: locals.model,
      searchKey: locals.searchKey,
    });

    // Resume if a suspended checkpoint exists for this thread; else new turn.
    const snap = await graph.getState(config);
    const isResume = snap.next.length > 0;

    // streamEvents accepts either a state update (new turn) or a Command (resume).
    const input = isResume
      ? new Command({ resume: body.message })
      : ({
          sessionId,
          // Last-write-wins fields: refresh every turn so a stale fileContent
          // from a prior audit turn doesn't misroute the router.
          fileContent: body.fileContent ?? "",
          fileName: body.fileName ?? "",
          messages: [
            { role: "user", content: body.message, timestamp: Date.now() },
          ] as Message[],
        });

    const stream = graph.streamEvents(input as any, {
      configurable: { thread_id: sessionId },
      version: "v2",
      signal: abort.signal,
    });

    for await (const ev of stream) {
      switch (ev.event) {
        case "on_chat_model_stream": {
          // Drop the router's intent-classifier tokens — it emits a single
          // intent word ("qna"/"wallet"/"audit") that is not answer text and
          // would otherwise prepend to the streamed reply. See mainGraph.ts
          // llmTieBreak for the matching tag.
          if (ev.tags?.includes("intent-classifier")) break;
          const text = (ev.data as { chunk?: { content?: unknown } })?.chunk?.content;
          if (typeof text === "string" && text.length > 0) {
            sse(res, { type: "token", text });
          }
          break;
        }
        case "on_tool_start": {
          toolCallCount++;
          sse(res, { type: "tool", name: ev.name });
          if (ev.name === "web_search") {
            const inp = ev.data?.input as { query?: unknown } | undefined;
            if (typeof inp?.query === "string") webSearchQueries.set(ev.run_id, inp.query);
          }
          break;
        }
        case "on_tool_end": {
          // Surface web_search detail (queries, URLs surfed, bytes retrieved).
          // Query is captured at on_tool_start (ev.data.input is reliable there).
          // on_tool_end carries data.output — a ToolMessage whose .content is the
          // markdown the tool returned. The result URLs are on their own lines in
          // that markdown, so a line-anchored URL regex picks just the surfed pages.
          if (ev.name !== "web_search") break;
          const query = webSearchQueries.get(ev.run_id) ?? "";
          webSearchQueries.delete(ev.run_id);
          const out = (ev.data as { output?: unknown } | undefined)?.output;
          const text =
            typeof out === "string"
              ? out
              : out && typeof out === "object" && typeof (out as { content?: unknown }).content === "string"
                ? (out as { content: string }).content
                : "";
          const urls = (text.match(/^https?:\/\/\S+$/gm) ?? []).map((s) => s.trim());
          const bytes = Buffer.byteLength(text, "utf8");
          sse(res, { type: "webSearch", query, urls, bytes });
          break;
        }
        case "on_chat_model_end": {
          const usage = ev.data?.output?.usage_metadata;
          if (usage) {
            tokensIn += usage.input_tokens ?? 0;
            tokensOut += usage.output_tokens ?? 0;
          }
          break;
        }
        default:
          break;
      }
    }

    const final = await graph.getState(config);
    const intent = final.values.intent ?? "qna";

    // Surface the HITL prompt + options when the graph suspended at an interrupt
    // (R8). Emitted only on suspend turns; the client should show the options and
    // send the chosen option text back as the next `message` (same sessionId).
    if (final.next.length > 0) {
      const intr = extractInterrupt(final);
      if (intr) sse(res, { type: "hitl", question: intr.question, options: intr.options });
    }
    // Surface the audit report. finalReport assembles it deterministically (no
    // LLM call), so it is never streamed as tokens — emit it as a structured
    // frame the client can render.
    const auditReport = (final.values as { auditReport?: AuditReport }).auditReport;
    if (auditReport) sse(res, { type: "report", auditReport });
    // Surface the wallet profile (R10 F1). initialSynthesis produces it as a
    // structured WalletProfile before the HITL suspend, so it is emitted on the
    // wallet turn (including the suspend turn) for the client to render the card.
    const walletProfile = (final.values as { walletProfile?: WalletProfile }).walletProfile;
    if (walletProfile) sse(res, { type: "walletProfile", walletProfile });

    const meta: MessageMeta = {
      sessionId,
      messageId: crypto.randomUUID(),
      intent,
      tokensUsed: { input: tokensIn, output: tokensOut },
      // Cost formula deferred per PRD §6 design discussion.
      estimatedCostUsd: 0,
      latencyMs: Date.now() - start,
      toolCallCount,
      subgraphRan: intent,
    };
    sse(res, { type: "meta", meta });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    sse(res, { type: "error", error: err instanceof Error ? err.message : String(err) });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});