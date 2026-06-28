// Eval/flow harness for @hexpert/agent (see docs/infra/testing.md).
//
// Drives the Express app in-process via supertest and parses the SSE stream
// from POST /api/chat into structured frames, so flow/eval tests can assert on
// tokens / tool / hitl / report / meta / [DONE] without touching the network or
// a real LLM. The LLM and Redis boundaries are mocked at the test boundary.
import request from "supertest";
import type { Application } from "express";

export type SseFrame =
  | { type: "token"; text: string }
  | { type: "tool"; name: string }
  | { type: "hitl"; question: string; options: string[] }
  | { type: "report"; auditReport: unknown }
  | {
      type: "meta";
      meta: {
        sessionId: string;
        intent: string;
        messageId: string;
        tokensUsed: { input: number; output: number };
        estimatedCostUsd: number;
        latencyMs: number;
        toolCallCount: number;
        subgraphRan: string;
      };
    }
  | { type: "error"; error: string }
  | { type: "done" };

/**
 * Parse an SSE response body (`data: <json>\n\n` frames + `data: [DONE]`) into
 * structured frames. Non-JSON payloads and comment lines are ignored.
 */
export function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (payload === "[DONE]") {
      frames.push({ type: "done" });
      continue;
    }
    if (!payload) continue;
    try {
      const obj = JSON.parse(payload) as unknown;
      if (obj && typeof obj === "object" && "type" in obj) {
        frames.push(obj as SseFrame);
      }
    } catch {
      // Ignore non-JSON keepalives / comments.
    }
  }
  return frames;
}

export type TurnInput = {
  sessionId: string;
  message: string;
  fileContent?: string;
  fileName?: string;
  headers?: Record<string, string>;
};

/** Run one /api/chat turn against the in-process app; returns parsed SSE frames. */
export async function runTurn(app: Application, input: TurnInput): Promise<SseFrame[]> {
  const req = request(app).post("/api/chat");
  for (const [k, v] of Object.entries(input.headers ?? {})) req.set(k, v);
  const res = await req.send({
    message: input.message,
    sessionId: input.sessionId,
    ...(input.fileContent !== undefined ? { fileContent: input.fileContent } : {}),
    ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
  });
  return parseSse(res.text ?? "");
}

/** Run a multi-turn flow (e.g. HITL suspend→resume) reusing the same sessionId. */
export async function runFlow(app: Application, turns: TurnInput[]): Promise<SseFrame[][]> {
  const out: SseFrame[][] = [];
  for (const t of turns) out.push(await runTurn(app, t));
  return out;
}

// --- scorers -----------------------------------------------------------------

export type ScorerResult = { pass: boolean; message: string };
export type Scorer = (frames: SseFrame[]) => ScorerResult;

export const hasDone: Scorer = (f) => ({
  pass: f.some((x) => x.type === "done"),
  message: "expected a [DONE] frame",
});

export const noError: Scorer = (f) => {
  const err = f.find((x) => x.type === "error") as { error: string } | undefined;
  return err
    ? { pass: false, message: `unexpected error frame: ${err.error}` }
    : { pass: true, message: "no error frame" };
};

export function intentIs(intent: string): Scorer {
  return (f) => {
    const meta = f.find((x) => x.type === "meta") as { meta: { intent: string } } | undefined;
    if (!meta) return { pass: false, message: "no meta frame" };
    return meta.meta.intent === intent
      ? { pass: true, message: `intent=${intent}` }
      : { pass: false, message: `expected intent=${intent}, got intent=${meta.meta.intent}` };
  };
}

/** Join all `token` frames into the streamed assistant answer text. */
export function tokenText(f: SseFrame[]): string {
  return f
    .filter((x): x is { type: "token"; text: string } => x.type === "token")
    .map((x) => x.text)
    .join("");
}

export function tokensContain(substr: string): Scorer {
  return (f) => {
    const text = tokenText(f);
    return text.includes(substr)
      ? { pass: true, message: `tokens contain "${substr}"` }
      : { pass: false, message: `tokens do not contain "${substr}"; got: ${text.slice(0, 120)}` };
  };
}

export function toolCalled(name: string): Scorer {
  return (f) => {
    const hit = f.some((x) => x.type === "tool" && (x as { name: string }).name === name);
    return { pass: hit, message: hit ? `tool ${name} called` : `tool ${name} not called` };
  };
}

export const hitlSuspended: Scorer = (f) => ({
  pass: f.some((x) => x.type === "hitl"),
  message: "expected a hitl frame (graph suspended at an interrupt)",
});