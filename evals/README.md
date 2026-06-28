# Hexpert Evals

Real-LLM evals for the agent backend. **On-demand, local, your keys, your
tokens.** Not part of `npm test` and never run in CI.

> Scope note (2026-06-27): This is the real-LLM eval layer only. The offline
> commit-gate layer (run real graph plumbing with a mocked LLM, no keys, in CI
> on every push) and frontend tests are **deferred** — tracked in PRD §5 for
> future reference. The existing mocked flow test
> (`apps/agent/test/flow/qna.test.ts`) already covers the plumbing-regression
> role ad hoc; promoting it into a proper CI job is the deferred work.

## What's here

| File | Intent graded | How it grades |
| --- | --- | --- |
| `router.eval.ts` | Intent classifier (hybrid pre-pass + always-on LLM tie-breaker, ADR-005) | meta frame `intent === expected` |
| `audit.eval.ts` | Audit subgraph structured output (zod-validated findings) | report frame findings by severity |
| `qna.eval.ts` | QnA answer quality (prose) | deterministic scorers **+ LLM-as-judge** scores token text vs. a rubric |
| `wallet.eval.ts` | Wallet subgraph HITL round-trip + deep-dive fan-out | structural frames: `intent`, `hitl` suspend, non-empty streamed answer |
| `lib/run.ts` | — | shared runner: env bootstrap, checkpointer init, `runDataset` + JSON trace dump |

## Prerequisites

1. **Redis** — `REDIS_URL` must be set in `.env`. `buildMainGraph` calls
   `getCheckpointer()` unconditionally, which throws if the checkpointer isn't
   initialized. So *every* eval turn needs it, not just HITL-resume cases.
   (Local Redis or Upstash both work — the agent already uses Upstash.)
2. **BYOK keys** in `.env` (see `.env.example` → "Real-LLM evals"):
   - `EVAL_PROVIDER` — one of `openai | anthropic | openrouter | ollama`
   - `EVAL_MODEL` — a model name valid for that provider
   - `EVAL_API_KEY` — provider API key
   - `EVAL_SEARCH_KEY` — Tavily key starting with `tvly-` (the middleware
     requires it on every request, even router turns that never search)
3. **QnA judge (optional)** — `EVAL_JUDGE_PROVIDER` / `EVAL_JUDGE_MODEL` /
   `EVAL_JUDGE_API_KEY` override the judge model for `qna.eval.ts`. Unset → the
   judge reuses `EVAL_*` (one key, one model). Set a stronger model for more
   reliable answer-quality grading. See `docs/infra/risks.md` R7.
4. **Wallet eval** — `ETHERSCAN_API_KEY` is required: `wallet.eval.ts` drives
   the real wallet subgraph (fetchTransactions / fetchTokenHoldings against
   Etherscan + ENS resolution over `ETH_RPC_URL`). The agent dev vars in
   `.env.example` already cover this.

## Run

```bash
npm run eval          # router → audit → qna → wallet (all four)
npm run eval:router   # router only
npm run eval:audit    # audit only
npm run eval:qna      # qna only
npm run eval:wallet   # wallet only
```

Each run prints one line per case (`✓`/`✗`, latency, messages) and a
`name: passed/total` summary, then dumps a full JSON trace to
`evals/.runs/<name>-<timestamp>.json` (gitignored). The trace contains every
case's parsed SSE frames so a failure can be inspected — the LLM's actual
tokens, tool calls, the report frame, error frames — not just pass/fail.

Exit code is `0` if all cases pass, `1` if any fail.

## Cost

Every case is a real LLM call. Pick a cheap `EVAL_MODEL` (e.g. `gpt-4o-mini`)
for routine runs; use a stronger model when you want to know if a model change
regresses quality.

- **Router** — 7 cases, 1 classifier call each (~7 LLM calls).
- **Audit** — 2 cases × 2 turns; turn 1 is the `analyseContract` structured-output
  call, turn 2 resumes with "Full report only" → `finalReport` (deterministic,
  no LLM).
- **QnA** — 5 cases, single-turn; each runs the router classifier + a bounded
  ReAct loop (1+ LLM calls), **plus** one judge call per case.
- **Wallet** — 3 cases × 2 turns; turn 1 = fetchParallel (Etherscan network) +
  one `record_wallet_profile` synthesis call; turn 2 = finalSynthesis (deep-dive
  cases also run a fan-out node each). Heaviest eval — real Etherscan calls and
  the largest inputs. Watch Etherscan free-tier rate limits across rapid runs.

## Design choices

- **Live under `evals/`, not `apps/agent/test/`.** Vitest globs the agent test
  tree for `npm test`; keeping real-LLM evals outside it guarantees they can
  never be picked up by the commit-gate suite and accidentally spend tokens.
  This is why PRD §5.1's separate `evals/package.json` was dropped — running
  via the root `tsx` (already a root devDep) is enough and simpler.
- **Drive the real Express app in-process via supertest** (same harness the
  mocked flow test uses), just without mocking the LLM or checkpointer. This
  exercises the real `/api/chat` path end-to-end, including SSE parsing and the
  real Redis-backed HITL resume for audit.
- **Grade on structured frames where they exist, judge where they don't.**
  Router uses the meta `intent`; audit uses the `report` frame's
  `AuditFinding[]`; wallet uses `intent` + `hitl` suspend + streamed-answer
  presence — all already-validated structure, no judge. QnA's output is prose,
  so `qna.eval.ts` grades it with an LLM-as-judge (configurable model, R7).
  Judge failures always surface in the case message — a weak judge is never
  allowed to mask a regression silently.
- **Wallet grades structure, not tool-event frames.** The wallet fetch tools
  are invoked programmatically inside `fetchParallel` (not via LLM
  tool-calling), so `on_tool_start` behaviour isn't a contract we assert on;
  we grade on `intent` + `hitl` + answer text instead.
- **Inspect failures.** The JSON trace per run is the point of Hamel's
  "inspect your eval failures" — read what the agent actually did when a case
  fails, then decide whether the case, the model, or the graph is wrong.