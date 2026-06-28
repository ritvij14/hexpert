// Shared runner for Hexpert's real-LLM evals. See evals/README.md.
//
// Drives the in-process Express app via supertest with the REAL LLM (no mock),
// so every run spends tokens and needs BYOK keys + REDIS_URL. This is the
// on-demand, local-keys eval layer — it is NOT part of `npm test` (which runs
// the offline Vitest suite) and never runs in CI.
//
// Why a separate runner and not a Vitest file: real-LLM evals must be opt-in
// (cost, keys). Living under evals/ (outside apps/agent/test, which Vitest
// globs) guarantees `npm test` can never pick them up and accidentally spend.
import { config } from "dotenv";
import { resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { Application } from "express";

// Import the harness bits into this module's scope (we call runFlow below) and
// re-export them so eval files have a single import path. The harness is pure
// (supertest + SSE parsing); importing it statically is safe.
import {
  runFlow,
  intentIs,
  hasDone,
  noError,
  tokenText,
  hitlSuspended,
  type SseFrame,
  type TurnInput,
} from "../../apps/agent/test/eval/harness.ts";
export { runFlow, intentIs, hasDone, noError, tokenText, hitlSuspended };
export type { SseFrame, TurnInput };

// --- 1. Env bootstrap -------------------------------------------------------
// MUST run before the app is imported: app.ts captures ALLOWED_ORIGIN at module
// load. Mirrors apps/agent/test/setup.ts for the eval context.
config({ path: ".env" });
config({ path: resolve("apps/agent/.env"), override: false });
delete process.env.AWS_LAMBDA_FUNCTION_NAME; // evals always run "off-Lambda"
process.env.ALLOWED_ORIGIN ??= "http://localhost:3000";

function mustEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`✗ evals: missing required env var ${key}. Set it in .env (see .env.example).`);
    process.exit(2);
  }
  return v;
}

/** BYOK headers sent on every eval turn. Provider/model/key come from EVAL_*. */
export const evalHeaders: Record<string, string> = {
  "X-Provider": mustEnv("EVAL_PROVIDER"),
  "X-Model": mustEnv("EVAL_MODEL"),
  "X-Api-Key": mustEnv("EVAL_API_KEY"),
  "X-Search-Key": mustEnv("EVAL_SEARCH_KEY"),
};

// --- 2. Lazy app + checkpointer init --------------------------------------
// buildMainGraph calls getCheckpointer() unconditionally, which throws if
// initCheckpointer() has not run — so even a single-turn router eval needs
// REDIS_URL set and the checkpointer initialized. app.ts does not call init
// (index.ts does on the server path), so we do it here before first use.
let _app: Application | null = null;
async function getApp(): Promise<Application> {
  if (_app) return _app;
  const { initCheckpointer } = await import("../../apps/agent/src/checkpointer.ts");
  await initCheckpointer();
  _app = (await import("../../apps/agent/src/app.ts")).app;
  return _app;
}

// --- 3. Dataset runner + report -------------------------------------------
export type Case<T = unknown> = {
  id: string;
  /** One or more turns sharing a sessionId; turn 1 sends content, later turns resume HITL. */
  turns: TurnInput[];
  expected: T;
};

export type GradeResult = { pass: boolean; messages: string[] };
export type Grader<T = unknown> = (c: Case<T>, frames: SseFrame[][]) => GradeResult | Promise<GradeResult>;

/**
 * Run each case through the app, grade it, print a one-line result, and dump a
 * JSON trace (every case's parsed frames) to evals/.runs/ for failure
 * inspection. Returns true only if every case passed. Exits the process with
 * 0 (all pass) or 1 (any fail) — callers should propagate this.
 */
export async function runDataset<T>(
  name: string,
  cases: Case<T>[],
  grade: Grader<T>,
): Promise<boolean> {
  const app = await getApp();
  const results = [] as {
    id: string;
    pass: boolean;
    messages: string[];
    frames: SseFrame[][];
    latencyMs: number;
  }[];

  for (const c of cases) {
    const t0 = Date.now();
    let frames: SseFrame[][] = [];
    let runError: string | null = null;
    try {
      frames = await runFlow(app, c.turns.map((t) => ({ ...t, headers: evalHeaders })));
    } catch (e) {
      runError = e instanceof Error ? e.message : String(e);
    }
    const latencyMs = Date.now() - t0;

    const result: GradeResult = runError
      ? { pass: false, messages: [`runner threw: ${runError}`] }
      : await grade(c, frames);

    results.push({ id: c.id, pass: result.pass, messages: result.messages, frames, latencyMs });
    console.log(`${result.pass ? "✓" : "✗"} ${c.id} (${latencyMs}ms) — ${result.messages.join("; ")}`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${name}: ${passed}/${results.length} passed`);

  const outDir = resolve("evals/.runs");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = resolve(outDir, `${name}-${stamp}.json`);
  await writeFile(
    outPath,
    JSON.stringify(
      {
        name,
        provider: evalHeaders["X-Provider"],
        model: evalHeaders["X-Model"],
        ranAt: new Date().toISOString(),
        results,
      },
      null,
      2,
    ),
  );
  console.log(`trace: ${outPath}\n`);

  return passed === results.length;
}