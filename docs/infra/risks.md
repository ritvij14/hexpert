# Hexpert — Open Risks & Demo-Day Landmines

> Source of truth for unresolved pushbacks against the PRD/architecture.
> **Auto-printed at every session start** via the `SessionStart` hook
> (`scripts/on-session-start.sh`) as long as any `STATUS: OPEN` line remains.
> Resolve an item by marking it `STATUS: RESOLVED` (with the fix) or by
> deleting it. The reminder fades as the list empties — strong incentive
> to close things rather than tolerate the nag.

Last reviewed: 2026-06-28

---

## R1 — Ollama-through-Lambda is broken by design [ARCHITECTURAL]
**Why it bites:** `ChatOllama` connects to an Ollama server URL (default
`http://localhost:11434`). On AWS Lambda, `localhost` is the *Lambda container*
— not the user's machine. The deployed path (Browser → Vercel → Lambda)
cannot reach the user's local Ollama. PRD §4.3 accepts `provider: 'ollama'`
and §4.5b maps it to `ChatOllama`, but that call cannot work in the deployed
path.
**Options:**
- (a) Ollama is a "run `apps/agent` locally" mode, disabled in the deployed demo
- (b) Drop Ollama from the 4-provider list for the talk
- (c) Require user to publicly expose Ollama — **REJECT** (security risk)
**STATUS: RESOLVED (2026-06-25)** — Use Ollama Cloud remote API (`https://ollama.com`) with `Authorization: Bearer <apiKey>` via `ChatOllama`. The deployed Lambda path can now reach Ollama; provider remains in the demo list. Provider-specific note added to PRD §4.5b.

## R2 — HITL resume-from-serialized-state is not a LangGraph one-liner
**Why it bites:** LangGraph's idiomatic HITL resume uses a *checkpointer*
(MemorySaver/persistent). Rehydrating a subgraph from a client-supplied JSON
blob and resuming requires `graph.setState()` + a re-invoke dance the docs
don't spotlight. The PRD (§4.7/§4.8/§4.10) treats it as solved.
**Mitigation:** Spike the round-trip on **one** subgraph (audit is simplest)
end-to-end — suspend → serialize → return → deserialize → resume — *before*
building all three. If painful, fall back to in-memory MemorySaver keyed by
`sessionId` (ephemeral per warm instance) and relax "stateless" to
"ephemeral per warm instance." Still demo-able, less risky.
**STATUS: RESOLVED (2026-06-25)** — Spike (`apps/agent/src/spikes/audit-hitl-spike.ts`, `@langchain/langgraph@1.4.6`) confirmed the fear empirically: single-process `MemorySaver` resume works, but **both** cross-process mechanisms fail — `updateState(clientValues)` creates a fresh checkpoint with no pending interrupt (graph re-runs and re-interrupts), and `Command({update,resume})` with no prior checkpoint does nothing. The browser's IndexedDB can hold state *values* but not the runtime-internal checkpoint *tuple*, and there is no public API to rehydrate a checkpoint from values. Per ADR-008, Hexpert keeps the checkpoint **server-side in TTL-evicted Redis** (`@langchain/langgraph-checkpoint-redis` `RedisSaver`, `defaultTTL` in minutes + `refreshOnRead: true`), keyed by `thread_id = sessionId`. Lambda stays stateless; Redis bridges the two requests and self-cleans. The client no longer sends `checkpointState` — resume is keyed by `sessionId` (PRD §2/§3.3/§3.5/§4.7/§4.8/§4.10 amended). **CONFIRMED 2026-06-25** against a live Upstash Redis: EXP R PASS (cold-start resume across two separate `RedisSaver` instances by `thread_id`); EXP T PASS (TTL set on all checkpoint keys, `refreshOnRead` holds/refreshes, and a `defaultTTL:1` checkpoint actually expires after ~61s → later `getState()` empty → fresh turn). RediSearch is NOT required for HITL (only RedisJSON); the saver's `FT.CREATE` warnings are best-effort and ignorable.

## R3 — Streaming must be a hard requirement, not aspirational
**Why it bites:** PRD §3.3 says "support streaming *if* the API route supports
it." For a live talk, 10–30s of a blank screen per turn is death.
**Action:** Promote streaming (SSE/chunked through Vercel → Lambda) from
aspirational to in-scope for v1. It's also a credibility/teaching point.
**STATUS: RESOLVED (2026-06-25)** — Promoted streaming (SSE/chunked through Vercel → Lambda) to a v1 hard requirement in PRD §3.3. UI must render partial assistant content progressively; the Next.js route streams from Lambda.

## R4 — The router should be hybrid, not pure-LLM
**Why it bites:** A single LLM intent classifier (§4.9) is a fragile
foundation — misclassify once live and the whole demo looks broken. Ambiguous
cases abound ("what's in vitalik.eth's wallet?" → qna or wallet; "check this
contract for reentrancy: <code>" → audit).
**Action:** Deterministic pre-pass — `fileContent` present → audit;
`0x…`/ENS token → wallet; else qna — with the LLM only as tie-breaker. *Both*
more reliable *and* a better teaching point ("you don't need an LLM for
everything; use rules where certainty is free").
**STATUS: RESOLVED (2026-06-25)** — Router is now hybrid: deterministic pre-pass (`fileContent` → audit; `0x…`/ENS → wallet; else qna) with a lightweight LLM tie-breaker only for ambiguity. Updated PRD §4.9.

## R5 — The 50KB body cap vs growing checkpointState is a latent bug
**Why it bites:** §3.4 returned 413 if the body exceeded 50KB, but
`checkpointState` rides *inside* the body. An audit subgraph holding contract
source + the `findings` array can plausibly exceed 50KB on the resume turn
→ the resume 413s mid-demo. Review also surfaced a second contradiction: §3.3
allowed a 50KB `.sol` file but §3.4 413'd any payload over 50KB — a max contract
would 413 the *first* audit turn before `checkpointState` was even in play.
**Action:** Either exempt `checkpointState` from the 50KB limit and cap it
separately (generously), or compress it. Needs a conscious decision, not
silence.
**STATUS: RESOLVED (2026-06-25)** — Per ADR-007, the single 50KB total cap is replaced with per-field caps: `message` ≤ 8KB, `fileName` ≤ 256B, `fileContent` ≤ 64KB, `checkpointState` ≤ 2MB, with a 3MB `Content-Length` pre-check. Client file cap bumped 50KB → 64KB so a max contract survives the first turn. PRD §3.3 and §3.4 updated.

## R6 — Five parallel audit nodes vs Lambda's 30s timeout + Ollama concurrency
**Why it bites:** §7.1 sets Lambda timeout to 30s, but §3.4's route timeout is
55s — Lambda cuts off first. Five concurrent LLM calls per audit (× cost on
the user's key; × queueing on a single local Ollama model) is a real timing
risk.
**Reconsider:** The *better* parallel showcase is the wallet subgraph's
`deepDiveDispatch` (conditional fan-out) — not five static LLM checks. Move
audit toward *one* structured-output call producing all findings. Cheaper,
faster, often higher-quality; wallet still carries the parallel-nodes lesson.
**STATUS: RESOLVED (2026-06-25)** — Audit subgraph collapsed to a single `analyseContract` node using structured output to produce all five finding categories in one LLM call. Wallet subgraph still demonstrates parallel node execution. Updated PRD §4.8.

## R7 — Rehearse the questions (QnA restricted-search silently fails) + QnA eval needs an LLM judge
**Why it bites:** QnA binds web search to a Tavily allowlist (~8 Ethereum doc
domains). Niche audience prompts will silently return poor results. A live
audience asks unpredictable things. Separately, QnA's output is **prose**, not
structured — unlike router (`meta.intent`) and audit (`report` frame), there is
no zod-validated field to assert on. Grading QnA answer quality therefore
requires an **LLM-as-judge** (a second LLM call that scores the agent's streamed
answer against the question + expected qualities), which the existing two evals
deliberately avoid. This adds a new failure surface of its own: the judge can be
wrong, and a weak judge can mask real regressions.
**Action:**
- Curate a set of guaranteed-good demo questions and steer toward them; have
  recovery lines for off-script asks.
- The QnA eval's fixture set **is** the curated demo-question set — building the
  eval satisfies the rehearsal requirement, so the two are designed together,
  not separately.
- **Open decision (parked):** judge model — same `EVAL_MODEL` (one key, simple)
  vs. a separate stronger `EVAL_JUDGE_MODEL` + key (more reliable grading).
  Build the judge configurable (`EVAL_JUDGE_*` env, default = `EVAL_MODEL`) so
  the choice can flip without rewriting the eval.
- **Judge-model decision RESOLVED (2026-06-28):** the only provider available
  for the demo is Ollama (`EVAL_PROVIDER=ollama`, `EVAL_MODEL=glm-5.2:cloud`,
  Ollama Cloud per R1), so the judge defaults to the agent's own model —
  `EVAL_JUDGE_*` left unset. The judge is still configurable for a future
  stronger model; no rewrite needed. The harness is built (`evals/qna.eval.ts`
  `gradeWithJudge`).
**STATUS: RESOLVED (2026-06-28)** — judge-model sub-decision closed (Ollama
only; judge defaults to `EVAL_MODEL`, `EVAL_JUDGE_*` unset). The
guaranteed-good demo questions + off-script recovery lines are curated in
`docs/demo-runbook.md` (§1 QnA — 5 eval-confirmed prompts; §4 recovery lines);
the qna eval's case set doubles as the curated set (qna eval 5/5 passed
2026-06-28).

## R8 — chat.ts does not surface the HITL prompt or auditReport to the client
**Why it bites:** The audit subgraph suspends at its `interrupt()` and resumes
correctly through Redis (HITL mechanism confirmed), but `chat.ts` only emits
SSE `token`/`tool`/`meta`/`error` frames — and `meta` (`MessageMeta`) carries
neither the `hitlPrompt` nor the `auditReport`. So on the first audit turn the
client sees no surfaced follow-up options, and on the "report only" path no
report text streams (finalReport is deterministic, not an LLM call). The
frontend cannot render the HITL choice or the report from what the backend
currently sends.
**Action:** When building the web/frontend slice (after evals, per build
order), extend `chat.ts` to surface the HITL prompt + options and the
`auditReport` — either a new SSE frame type (e.g. `hitl`) or an extension of
`meta`. Do NOT do this now (the approved audit plan deliberately left
`chat.ts` unchanged); track it here so it is not forgotten.
**STATUS: RESOLVED (2026-06-26)** — `chat.ts` now emits two new SSE frames: a `hitl` frame (question + options, extracted from `getState().tasks[].interrupts[].value`) when the graph suspends at an interrupt, and a `report` frame (the structured `AuditReport`) when `finalReport` produced one (it is deterministic, so it was never streamed as tokens). `MessageMeta` / `packages/shared` unchanged. The web/frontend slice will consume these two frames.

## R9 — serverless-http on a Lambda Function URL breaks SSE streaming (contradicts ADR-004)
**Why it bites:** PRD §7 deploys `apps/agent` on AWS Lambda via `serverless-http`, and `chat.ts` is an SSE (`text/event-stream`) handler that flushes `token`/`tool`/`hitl`/`report`/`meta` frames as the graph runs (ADR-004 made streaming a v1 hard requirement precisely to avoid a 10–40s blank screen). But `serverless-http` buffers the entire Express response into one body and only returns it to Lambda on `res.end()` — it uses the standard request/response invoke, NOT Lambda response streaming. So in the deployed path every SSE frame would arrive at the browser at once *after* the turn completes, giving exactly the blank screen ADR-004 was written to prevent. The local :3001 path streams fine (real Express server); the bug only appears on Lambda. This is a PRD §7 vs ADR-004 contradiction.
**Options:**
- (a) Use AWS Lambda **response streaming** (Function URL `InvokeWithResponseStream` / `awslambda.streamifyResponse`) — requires replacing/augmenting `serverless-http` with a streaming-aware adapter; `index.ts` would export a streamed handler instead of (or alongside) the buffered `handler`.
- (b) Deploy the agent on a runtime that streams natively (Vercel function, Cloudflare Worker, or a container on Fly/Railway) and drop Lambda — changes §7 and the "Lambda" teaching point.
- (c) Keep Lambda + `serverless-http` and accept buffered (non-streamed) responses for the demo — directly violates ADR-004; **REJECT** for the live talk.
**STATUS: RESOLVED (2026-06-26)** — Chose option (a) via the **AWS Lambda Web Adapter** (ADR-011) rather than native `streamifyResponse`. The Web Adapter fronts the unchanged Express app (`app.listen(PORT)`) and, with `AWS_LWA_INVOKE_MODE=response_stream` + a Function URL `InvokeMode: RESPONSE_STREAM`, pipes `res.write` chunks to the client using Lambda response streaming — SSE frames arrive progressively, ADR-004 honoured, no `serverless-http`. Verified against the official Web Adapter response-streaming docs and the `expressjs-zip` example (zip + `LambdaAdapterLayerX86` layer, `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, handler `run.sh`). Deploy artifacts: `infrastructure/template.yaml`, `apps/agent/run.sh`, `apps/agent/scripts/pack-lambda.sh`, `build:lambda` script. A live end-to-end curl test against the deployed Function URL is the remaining manual-verification step (see `infrastructure/README.md`). Related: ADR-004, ADR-011.

## R10 — Frontend slice: five gap decisions (2026-06-28)
**Context:** The web frontend (`apps/web`) was built in one session for the
localhost demo (event 2026-06-28) against the local agent on :3001. Baseline is
working: `tsc --noEmit` + `next build` green; dev server serves `/`; the
`/api/chat` gateway returns a clean 502 (agent down) / 504 (timeout) and enforces
per-field caps (message ≤8KB, fileName ≤256B, fileContent ≤64KB, 3MB total).
Five gaps were identified; the user decided how to close each. **Implementation
is deferred to a NEW chat thread** (not the one that built the frontend). All
five are user-decided; the actions below are the work for the next thread.

- **F1 — No `WalletProfile` frame.** The backend streams wallet answers as
  `token` text only (same shape noted in the wallet-eval deviation), so the
  design's rich wallet-profile card can't be filled from real data.
  **DECIDED:** Add a structured `walletProfile` SSE frame to
  `apps/agent/src/routes/chat.ts` — mirror the R8 pattern that added
  `hitl`/`report` frames, carrying the `WalletProfile` type from
  `@hexpert/shared` (emit when `final.values.walletProfile` is present on a
  wallet turn). Add `walletProfile` to the `SseFrame` union in BOTH `chat.ts`
  and `apps/web/lib/sse.ts`. Render the design card in a new
  `apps/web/components/WalletProfileView.tsx` wired into `MessageBubble.tsx`.
  This touches the "complete" backend — **user-approved**.
- **F2 — Icons offline vs on-demand.** The full `@iconify-json/solar` set is
  6.2 MB / 7404 icons; bundling it all is a non-starter, so the frontend uses
  `@iconify/react`'s cached on-demand fetch. **DECIDED: keep on-demand fetch.
  No change.** (Fine for the online localhost demo.)
- **F3 — Threads in-memory only.** IndexedDB was deferred (PRD §3.3 note), so
  threads live in the Zustand store and are lost on reload (the `sessionId` is
  restored from sessionStorage, so a live Redis checkpoint can still resume,
  but message history is gone). **DECIDED: build IndexedDB persistence now** —
  the PRD §3.3/§3.5 target state: a `sessions` object store keyed by
  `sessionId`, write the full `StoredMessage` (incl. `meta`) on every assistant
  response, load a thread's messages on init/switch. Replace the in-memory
  `threads` array in `apps/web/stores/chatStore.ts` with an IndexedDB-backed
  store. API keys stay in sessionStorage (never unified with threads).
- **F4 — Intent tag shows only at turn-end.** `meta` (carrying `intent`) is
  emitted just before `[DONE]`, so the Wallet/Audit/Q&A tag appears at the end
  of the stream. **DECIDED: add an early intent hint** — a client-side router
  heuristic (fileContent present → audit; message contains `0x…`/ENS → wallet;
  else qna) shown immediately, replaced by the real `meta.intent` at turn-end.
  (Duplicated router logic is acceptable here.)
- **F5 — `tool` frames ignored.** The design has no affordance for `tool`
  frames, so the store currently drops them. **DECIDED: render them as muted
  "tool-call pills"** above the streaming text (e.g. `running: fetchTransactions`).
  The user explicitly granted UI-invention latitude within the design system
  (`docs/design/`) — keep the pills consistent with the Dark-as-Night palette
  (zinc-800/50 chip, zinc-400 mono label, tracking-widest).

**STATUS: RESOLVED (2026-06-28)** — F1, F3, F4, F5 implemented in a follow-up
thread; F2 unchanged (no-op). `tsc` (agent) + `next build` (web) green.
- **F1:** `walletProfile` added to the `SseFrame` union in both
  `apps/agent/src/routes/chat.ts` and `apps/web/lib/sse.ts`; `chat.ts` emits it
  when `final.values.walletProfile` is present (mirror of the `report` pattern).
  `chatStore` handles the frame; new `apps/web/components/WalletProfileView.tsx`
  renders the design card (3-stat grid shows Tx Count / Top Contracts / Tokens
  Held — the `WalletProfile` type carries `topContracts`/`tokenHoldings`, not the
  design's ETH Balance / ERC20 Value; the LLM `summary` renders below the grid);
  wired into `MessageBubble.tsx`. The card emits on the wallet turn, including
  the HITL suspend turn (card + chips match the design).
- **F3:** `apps/web/lib/idb.ts` (`hexpert` DB v1, `sessions` store keyed by
  `sessionId`). `chatStore.init` hydrates settings sync then loads threads from
  IDB; `newChat`/`deleteThread` persist/delete; `sendMessage` persists the active
  thread in `finally`. **Persists the full `Thread` (`UiMessage[]`) — not the
  minimal `StoredMessage` — so a reload reproduces the rich views
  (auditReport / walletProfile / hitl / toolCalls), avoiding a demo regression.**
  Keys stay in sessionStorage. IDB failure (private mode) falls back to in-memory.
- **F4:** `intentHint` computed client-side at send time (mirrors the agent
  `deterministicClassify` regexes: file→audit; `0x…40`/ENS→wallet; else qna) and
  set on the assistant message; `MessageBubble` renders the tag from
  `intent ?? intentHint`, replaced by `meta.intent` at turn-end.
- **F5:** `toolCalls: string[]` on `UiMessage`; the `tool` SSE frame appends the
  name; `MessageBubble` renders muted tool-call pills (zinc-800/50 chip,
  zinc-400 mono, tracking-widest) above the streaming text, prefixed
  `running: ` while streaming.
