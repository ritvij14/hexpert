# Architecture Decisions (ADR)

> Concise record of cross-cutting decisions: technology choice, new patterns,
> structural changes. Not for implementation details. Newest on top.

## ADR-012 — Function URL uses `AuthType: AWS_IAM` (not public `NONE`); Vercel signs each call with a dedicated IAM user

**Date:** 2026-06-27 · **Status:** Accepted

**Context.** ADR-011 deployed the Function URL with `AuthType: NONE` + a resource-based policy granting `lambda:InvokeFunctionUrl` to `Principal: "*"` — i.e. publicly invocable by anyone with the URL. The live security audit (`docs/infra/aws-security-audit.md`) flagged this as S1 (public + unauthenticated) and S2 (no rate limit → cost abuse). The user wanted the Lambda locked to specific trusted sources rather than wide open. Tailscale-IP allow-listing was rejected: the Lambda is not on the tailnet (AWS sees the device's public egress IP, not the `100.x` address), Function URLs don't support source-IP rules natively (no WAF attach — that needs API Gateway/CloudFront, contradicting ADR-011's Function-URL choice), and production calls come from Vercel, not user devices (PRD §4.2: Browser → Vercel → Lambda).

**Decision.** Switch the Function URL to `AuthType: AWS_IAM` and **delete** the `Principal: "*"` resource-based policy (`AWS::Lambda::Permission`). Only an AWS principal with `lambda:InvokeFunctionUrl` on the function may invoke. In production the Vercel Next.js API route SigV4-signs each request with a dedicated `hexpert-vercel` IAM user's keys (stored as Vercel env vars `LAMBDA_IAM_ACCESS_KEY_ID` / `LAMBDA_IAM_SECRET_ACCESS_KEY`). For backend testing now, signed curl (`curl --aws-sigv4` with the user's creds) invokes directly.

**Why IAM auth over a shared-secret header or IP filter.** IAM rejects anonymous at the AWS layer *before* the Lambda runs — so it also closes the S2 cost-abuse vector (no anonymous invocations to flood), which a shared-secret header does not (the URL stays invocable, just 401s, still burning invocations). It is AWS-native, rotatable, scoped to one principal, and needs no extra infra (no API Gateway/WAF/CloudFront). IP filtering is infeasible on a bare Function URL (above). The cost is SigV4 signing on the Vercel side — a one-time helper in the Next.js API route (frontend phase).

**Scope / phasing.** Lambda-side change (`AuthType: AWS_IAM`, drop public permission, `AllowedOrigin` default → `https://hexpert.ritvij.dev`) is done now (template + redeploy). Vercel-side (the `hexpert-vercel` IAM user + Next.js SigV4 signing) is **frontend-phase** — captured in PRD §3.4 / §7.1 / §8 so it is not lost. Until then, backend testing uses signed curl with the user's own AWS creds.

**Consequences.**
- Pros: closes S1, S2, S10 of the audit; no public endpoint; anonymous can't invoke (no cost abuse); AWS-native auth; no new infra.
- Cons: Vercel must SigV4-sign (frontend-phase work); the `/deploy` skill can't redeploy non-interactively until the NoEcho secrets (`EtherscanApiKey`, `RedisUrl`) are resolvable — SAM omits NoEcho params from `samconfig.toml`, so a guided redeploy (or putting them in gitignored samconfig) is needed for now.
- PRD §3.4, §7.1, §8, §9 amended; `infrastructure/template.yaml` updated; audit S1/S2/S10 marked fix-committed (pending redeploy).

**Refs:** PRD §3.4, §4.2, §7.1, §8, §9; ADR-011; `docs/infra/aws-security-audit.md` S1/S2/S4/S10; `infrastructure/template.yaml`.

---

## ADR-011 — Lambda deploy uses the AWS Lambda Web Adapter with response streaming (drops `serverless-http`)

**Date:** 2026-06-26 · **Status:** Accepted

**Context.** PRD §7 originally deployed `apps/agent` on AWS Lambda via `serverless-http`, and ADR-004 made SSE streaming a v1 hard requirement (no 10–40s blank screen). R9 surfaced the contradiction: `serverless-http` buffers the entire Express response and returns it to Lambda only on `res.end()` (standard request/response invoke), so every SSE frame would arrive at the browser at once *after* the turn — exactly the failure ADR-004 forbids. The local :3001 path streams fine; the bug is invisible until deploy.

**Decision.** Replace `serverless-http` with the [AWS Lambda Web Adapter](https://github.com/aws/aws-lambda-web-adapter) in **response-streaming** mode. The Express app runs unchanged as a plain HTTP server (`app.listen(PORT)`); the Web Adapter (a Lambda layer) fronts it and, with `AWS_LWA_INVOKE_MODE=response_stream` + a Function URL `InvokeMode: RESPONSE_STREAM`, pipes `res.write(...)` chunks to the client via Lambda response streaming (HTTP/1.1 chunked). SSE frames from `/api/chat` therefore stream progressively.

**Packaging (zip + layer, not container):**
- `apps/agent/src/index.ts` — drops the `serverless-http` handler; `app.listen` runs under the existing `require.main === module` guard (the adapter boots the app via `node dist/index.js` through `run.sh`, so the module is `main` on Lambda too).
- `apps/agent/run.sh` — the Lambda handler (`node dist/index.js`).
- `apps/agent/scripts/pack-lambda.sh` — stages `run.sh + dist/ + package.json + production node_modules/` into `apps/agent/lambda-pkg/` (SAM zips this) and writes `dist-lambda.zip` for direct `aws lambda update-function-code`.
- `infrastructure/template.yaml` (SAM) — `AWS::Serverless::Function` (nodejs20.x, handler `run.sh`, 512MB, timeout 60s) with `LambdaAdapterLayerX86` (`arn:aws:lambda:${Region}:753240598075:layer:LambdaAdapterLayerX86:28`), `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, `AWS_LWA_INVOKE_MODE=response_stream`, `PORT=8000`; plus `AWS::Lambda::Url` (`InvokeMode: RESPONSE_STREAM`, `AuthType: NONE`) + `AWS::Lambda::Permission` for public invoke.
- `build:lambda` npm script (`tsc` + `pack-lambda.sh`); `serverless-http` dependency removed.

**Why the Web Adapter over native `awslambda.streamifyResponse`.** The adapter keeps the Express app and its SSE handler (`chat.ts`) byte-for-byte unchanged — the same code that streams on local :3001 streams on Lambda. `streamifyResponse` would require a custom bridge from Express's `res` to the Lambda stream object. The adapter is the lowest-friction path and preserves the "deploy the Express app as-is" teaching narrative. Chosen after verifying against the official Web Adapter response-streaming docs and the `expressjs-zip` example.

**Streaming limits accepted (all fine for Hexpert).** No compression with streaming (auto-disabled); Function URLs / API Gateway only (not ALB); Function URL streaming not supported inside a VPC (Upstash Redis is REST, so no VPC is needed — ADR-008); 20MB soft per-response cap; ≥6MB capped at 2MB/s. SSE turns are KB-scale. Timeout bumped 30s → 60s because wallet turn-2 on a whale runs ~40s.

**Cost / free tier.** Streaming invokes are normal Lambda invocations — billed against the Always-Free 1M requests/month and 400,000 GB-s/month (duration measured to stream close). A 40s turn at 512MB = 20 GB-s; the free tier covers ~20k such turns/month. Egress (~100GB/month free for the first 12 months) is trivial for KB-scale SSE.

**Consequences.**
- Pros: ADR-004 honoured on the deployed path; Express app unchanged; no `serverless-http`; SSE is the same code locally and in production; free tier intact.
- Cons: one extra moving part (the adapter layer + a Function URL with `InvokeMode: RESPONSE_STREAM`); a live end-to-end curl test against the deployed URL is still required to confirm streaming empirically (manual-verification step in the build order).
- PRD §4.1, §4.2, §7.1, §7.2, §8 amended to reflect the Web Adapter; AGENTS.md, README, and the agent-architecture feature doc synced. `serverless-http` removed from `apps/agent/package.json`.

**Refs:** PRD §4.1, §4.2, §7, §8; ADR-004; `docs/infra/risks.md` R9; `infrastructure/template.yaml`, `infrastructure/README.md`, `apps/agent/src/index.ts`, `apps/agent/run.sh`, `apps/agent/scripts/pack-lambda.sh`; [Web Adapter response-streaming docs](https://aws.github.io/aws-lambda-web-adapter/configuration/response-streaming.html), [expressjs-zip example](https://github.com/aws/aws-lambda-web-adapter/tree/main/examples/expressjs-zip).

---

## ADR-010 — Subgraphs are nested + factory: compiled without their own checkpointer, added as main-graph nodes

**Date:** 2026-06-26 · **Status:** Accepted

**Context.** Each subgraph (audit and wallet) must integrate with the single `mainGraph` so that (a) the router dispatches to it, (b) its `interrupt()` suspends in the same Redis checkpoint as the parent (so `chat.ts`'s `getState`/`Command({resume})` path works unchanged), and (c) the subgraph can still be run standalone for evals.

**Decision.** Each subgraph exposes a factory `build<Name>Graph({ params, checkpointer? })` that compiles **without its own checkpointer** and is added directly as a node in `mainGraph` (`.addNode(name, compiledSubgraph)`). Its `interrupt()` bubbles up to mainGraph's `RedisSaver` (ADR-008); `chat.ts` is unchanged. The optional `checkpointer` param, when passed, lets an eval harness run the subgraph standalone with its own saver.

**Why nested + factory over alternatives.** Keeping the subgraph checkpointer-less and nesting it as a node means a single checkpoint (keyed by `thread_id = sessionId`) covers both the parent and the subgraph — exactly the one-checkpointer HITL model ADR-008 confirmed empirically. A sibling/invoked-graph style would need a second checkpoint or a manual serialization bridge, which R2's spike proved fragile. The factory preserves standalone-runnability for evals without coupling production to a saver per subgraph.

**Consequences.**
- Pros: one `RedisSaver`, one `thread_id`, one resume path — `chat.ts` untouched; subgraphs are independently testable; the teaching narrative ("main graph orchestrates; subgraphs are nested") stays clean.
- Cons: parent state must be a subset of each subgraph's state annotation (subgraph-only fields carry defaults so the base state seeds cleanly); TS variance at `addNode(compiledSubgraph)` may need a cast (the audit spike already casts via `as`).
- The audit subgraph was the first instance (`buildAuditGraph`); the wallet subgraph (`buildWalletGraph`) followed the same pattern and is live-confirmed (2026-06-26) — its `interrupt()` bubbles up to mainGraph's `RedisSaver` and `chat.ts` is unchanged.

**Refs:** PRD §4.7, §4.8, §4.9, §4.10; ADR-008; `apps/agent/src/graphs/auditGraph.ts`, `apps/agent/src/graphs/walletGraph.ts`, `apps/agent/src/graphs/mainGraph.ts`.

---

## ADR-009 — Structured output via tool-calling + zod, uniform across all providers

**Date:** 2026-06-26 · **Status:** Accepted

**Context.** The audit subgraph's `analyseContract` node (§4.8 / ADR-006) must return structured findings. LangChain offers two paths: native structured output (Ollama `format`, OpenAI `response_format`/json_schema, Anthropic tool-calling) — which is provider-specific and not universally available — or tool calling, which all four Hexpert providers support. The deciding constraint: **Ollama Cloud has no structured-output mode** but **does support tool calling** (confirmed via Ollama docs — it is how Claude Code runs on Ollama Cloud). A provider-branched implementation would gate audit off Ollama Cloud or maintain two code paths.

**Decision.** Implement structured output uniformly as **tool-calling + zod validation**: define the findings shape as a zod schema exposed via a `record_audit_findings` tool; force the model to call it; the node intercepts the call from `ai.tool_calls`, runs `safeParse`, and on failure appends a corrective nudge and retries once. The tool is never actually executed — it is a structured-return vehicle only. One path, no provider branching, works on openai/anthropic/openrouter/ollama.

**Why this is better.** Uniformity (one code path, one mental model, one teaching point — "this is how Claude Code gets structured data from any model"); portability (works where native structured output doesn't); and the zod layer gives an explicit validation + retry boundary that native modes don't provide for free.

**Consequences.**
- Pros: audit runs on all four providers incl. Ollama Cloud; no provider feature matrix to maintain; explicit zod validation surfaces schema drift loudly; the retry absorbs transient truncation.
- Cons: the model can occasionally fail to emit the tool call or emit malformed args (mitigated by the bounded retry and a terse-finding prompt); one extra round-trip on the retry path.
- Mitigations: the analyst prompt says "call `record_audit_findings` exactly once" and caps each finding's description length (≤200 chars) to avoid large-args truncation (Ollama Cloud issue #16066).

**Refs:** PRD §4.8; ADR-006; `apps/agent/src/graphs/auditSchema.ts`, `apps/agent/src/graphs/auditGraph.ts`; Ollama structured-outputs docs (https://docs.ollama.com/capabilities/structured-outputs).

---

## ADR-008 — HITL state lives in TTL-evicted Redis, keyed by sessionId

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** R2 warned that LangGraph's `interrupt()`/`Command({resume})` requires a **checkpointer holding the real checkpoint tuple** (with the pending interrupt task) between turn 1 (suspend) and turn 2 (resume). A 2026-06-25 spike (`apps/agent/src/spikes/audit-hitl-spike.ts`, `@langchain/langgraph@1.4.6`) confirmed this empirically:

- **Single-process `MemorySaver`** — interrupt → resume works (state held in process memory). ✅
- **Cross-process `updateState(clientValues)` + `Command({resume})`** — FAIL. `updateState` creates a fresh checkpoint with no pending interrupt; graph re-runs from the start and re-interrupts. ❌
- **Cross-process `Command({update, resume})` one-shot** — FAIL. With no prior checkpoint, `resume` has nothing to match; no nodes execute. ❌

Conclusion: stateless interrupt-resume from a client-supplied blob is impossible in v1.4.6 — the browser's IndexedDB can hold state *values* but not the runtime-internal checkpoint *tuple*, and there is no public API to rehydrate a checkpoint from values. The PRD's "client stores `checkpointState` and re-submits it to resume" model cannot work as written.

**Decision.** Keep the checkpoint **server-side** in a **TTL-evicted Redis** store, keyed by `thread_id = sessionId`. Lambda stays genuinely stateless; Redis bridges the two requests and self-cleans.

- Package: `@langchain/langgraph-checkpoint-redis` (`RedisSaver`).
- TTL via the package's built-in `TTLConfig`: `defaultTTL` (minutes) + `refreshOnRead: true` so an active HITL back-and-forth keeps the checkpoint alive while an abandoned one expires. Best-effort (failures warn, not throw) — good enough for a demo.
- `thread_id = sessionId` (the PRD's `X-Session-Id` header already provides this; no new identifier needed).
- Hosting: **Upstash Redis** for the deployed demo (serverless, REST API so Lambda needs no VPC, free tier, native per-key TTL); local Redis for dev. Requires the **RedisJSON** module. **RediSearch is NOT required for HITL** — the saver's `FT.CREATE` index creation is best-effort (it logs warnings and continues); Hexpert only uses get/put/resume-by-`thread_id`, never `list()`/search, so RediSearch can be absent. (Confirmed empirically 2026-06-25 against an Upstash instance with RedisJSON but no RediSearch — Exp R and Exp T both PASS despite the `FT.CREATE` warnings.)
- Optional memory optimization: `ShallowRedisSaver` (keeps only the latest checkpoint per thread — ideal for HITL, which never needs history).

**How the flow changes.** Turn 1: Lambda invokes the graph with `{ configurable: { thread_id: sessionId } }`; the graph runs to an `interrupt()`; the `RedisSaver` writes the checkpoint (with TTL) and Lambda returns the HITL prompt to the client — Lambda terminates, nothing held warm. Turn 2 (fresh, cold Lambda): the client sends the user's selection as the message (plus `X-Session-Id`); Lambda invokes the graph with `Command({ resume: message })` and the same `thread_id`; the `RedisSaver` loads the checkpoint from Redis, the `interrupt()` returns the resume value, the graph continues to completion.

**Consequence — the client no longer sends `checkpointState`.** Resume is keyed by `sessionId`, not by a client-supplied blob. This removes the client-side "read `checkpointState` from IndexedDB and include it in the request body" flow (PRD §3.3/§3.5) and the `checkpointState` field on `StoredMessage` (PRD §2). Net simplification: smaller request bodies, simpler client. `R5`'s `checkpointState ≤ 2MB` per-field cap (ADR-007) becomes moot for the resume path — the cap on `fileContent` (≤ 64KB) still matters and stays.

**Consequences.**
- Pros: robust across Lambda cold starts; Lambda genuinely stateless; automatic cleanup via TTL (no cleanup code, no unbounded growth); `thread_id=sessionId` reuses an existing identifier; off-the-shelf package, no custom checkpointer; preserves the PRD's `interrupt()` model and the "one graph suspends and resumes" teaching narrative.
- Cons: one external dependency (Redis/Upstash) + a teaching caveat for a demo; requires a Redis endpoint with the RedisJSON module; the live talk now depends on Redis being reachable.
- PRD §2, §3.3, §3.5, §4.7, §4.8, §4.10 are amended by this ADR (client no longer sends `checkpointState`; HITL state lives in Redis keyed by `thread_id=sessionId`).
- **Empirically confirmed 2026-06-25** against a live Upstash Redis (`apps/agent/src/spikes/audit-hitl-spike.ts` with `REDIS_URL` set): EXP R PASS (two separate `RedisSaver` instances — simulating two cold Lambdas — resume off the same Redis by `thread_id`); EXP T PASS (TTL set on every checkpoint key at `defaultTTL`, `refreshOnRead` holds/refreshes it, and a checkpoint with `defaultTTL:1` actually expires after ~61s → a later `getState()` returns empty, so an abandoned HITL auto-cleans and a following message is treated as a fresh turn).

**Refs:** PRD §2, §3.3, §3.5, §4.7, §4.8, §4.10; `docs/infra/risks.md` R2, R5; `apps/agent/src/spikes/audit-hitl-spike.ts`; `@langchain/langgraph-checkpoint-redis@1.0.10` (https://reference.langchain.com/javascript/langchain-langgraph-checkpoint-redis/index/RedisSaver).

---

## ADR-007 — Per-field body caps instead of a single 50KB total cap

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** R5 flagged that `checkpointState` rides inside the request body, so the resume turn of an audit (contract source + multiple findings arrays) could plausibly exceed the single 50KB cap and 413 mid-demo. Reviewing the spec surfaced a second, related contradiction: §3.3 allows a `.sol` file up to 50KB but §3.4 returns 413 whenever the *payload* exceeds 50KB — so a max-size contract would already 413 on the **first** audit turn, before `checkpointState` is even in play. The single total cap is too tight in two places.

**Decision.** Replace the single 50KB total cap with a two-stage gate in the Next.js gateway (`app/api/chat/route.ts`):

1. **Content-Length pre-check** — reject with 413 if `Content-Length` exceeds **3MB**. Cheap guard so we never parse an obviously-huge payload.
2. **Per-field caps** — parse the JSON body and 413 (with a field-specific message) if any field exceeds:
   - `message` ≤ 8 KB
   - `fileName` ≤ 256 B
   - `fileContent` ≤ **64 KB** (bumped from the §3.3 client-side 50KB; the client must align)
   - `checkpointState` ≤ **2 MB** (generous — covers contract source + accumulated findings arrays for the resume turn)
   - `meta`, `sessionId`, `intent`, `fileName` envelope fields are bounded by the above; no separate cap needed.

**Why per-field over a single big cap.** A single 3MB total cap is simpler but teaches nothing and lets one bad field be huge. Per-field caps bound each field to its domain — a tighter, more honest contract and a better teaching point ("bound what you actually know about"). It also fixes the §3.3/§3.4 contradiction explicitly: the client file cap moves to 64KB so a max contract + JSON envelope + message fits the first turn.

**Why not exempt `checkpointState` only.** That option (keep 50KB elsewhere, cap `checkpointState` at 2MB) leaves the first-turn large-contract contradiction in place. Per-field caps resolve both.

**Consequences.**
- Pros: first-turn audit with a large contract no longer 413s; resume turn with `checkpointState` fits; explicit, field-specific 413 messages aid debugging; no compression complexity on either end.
- Cons: gateway must parse JSON before enforcing caps (after the cheap Content-Length guard); client `.sol` validation in §3.3 must be updated from 50KB → 64KB to stay consistent.
- §3.4 and §3.3 are amended by this ADR (see PRD updates).

**Refs:** PRD §3.3, §3.4; `docs/infra/risks.md` R5.

---

## ADR-006 — Audit subgraph: one structured-output call instead of five parallel LLM nodes

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** PRD §4.8 originally modelled audit as five parallel vulnerability-check nodes (reentrancy, access control, overflow, unchecked calls, hardcoded addresses) plus a join node. Lambda timeout is 30s (§7.1), and five concurrent LLM calls — especially on Ollama Cloud or slow providers — risked blowing the timeout or queueing. R6 flagged this as a demo-day landmine.

**Decision.** Collapse the five parallel checks into a single `analyseContract` node that uses structured output (Zod/JSON schema) to return all five finding categories in one LLM call. The wallet subgraph still demonstrates LangGraph parallel node execution via `fetchParallel` and `deepDiveDispatch`, so the teaching point is preserved. Audit edges simplified to: `readContract` → `analyseContract` → `hitlCheckpoint` → (resume) → follow-ups → `finalReport`.

**Why this is better.** Faster (one call vs five), cheaper for the user's key, fits Lambda's 30s window with headroom, and generally higher quality because the same context attends across all vulnerability classes. It also keeps the demo's parallel-nodes lesson on the wallet path, where parallelism is conditional and interesting, rather than on static checklist fan-out.

**Consequences.**
- Pros: avoids timeout, cheaper, simpler graph state, fewer failure modes.
- Cons: loses the "five parallel specialist nodes" visual/mental model; teaching script must lean harder on wallet parallelism.
- Shared `GraphState` should not expose the five separate `...Findings` fields; instead use a single `findings: AuditFinding[]` field. (PRD §2 `GraphState` definition to be updated if needed when implemented.)

**Refs:** PRD §4.8; `docs/infra/risks.md` R6.

---

## ADR-005 — Router is a hybrid deterministic pre-pass with LLM tie-breaker

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** PRD §4.9 originally described a pure-LLM router node. Live demos are unforgiving: a single misclassification (e.g. "what's in vitalik.eth's wallet?" routed to QnA) breaks the flow visibly. R4 pushed for a more reliable, rule-first approach.

**Decision.** Make the router deterministic by default, with a lightweight LLM tie-breaker only for genuinely ambiguous input:
- If `fileContent` is present in the request → intent is `audit`.
- Else if the user message contains an Ethereum address (`0x…`) or ENS name (e.g. `vitalik.eth`) → intent is `wallet`.
- Else → intent is `qna`.
- If a heuristic signals ambiguity (e.g. a `.sol` snippet pasted as text without an attachment, or a wallet address alongside a question phrased for QnA), route to a small LLM call for the final decision.

**Why this is better.** It is both more reliable *and* a stronger teaching point: "don't use an LLM where a rule is free and certain." The LLM is reserved for the interesting uncertainty.

**Consequences.**
- Pros: deterministic routing is instant and deterministic; reduces demo-day surprise.
- Cons: regex/heuristic address detection must be robust; edge cases need explicit handling.
- Implementation note: the deterministic pre-pass runs in `mainGraph` before any LLM is instantiated, and the tie-breaker (if needed) uses the same per-request LLM factory.

**Amendment (2026-06-26): tie-breaker is always-on, not ambiguity-only.** Implemented in `mainGraph.classifyIntent`: the LLM tie-breaker now runs on **every new turn** after the pre-pass and overrides it only when it disagrees (resume turns skip the router, so the extra call is new-turn-only). The user explicitly accepted the per-turn cost/latency in exchange for catching every pre-pass misroute (e.g. Solidity pasted as text with no file → pre-pass says `qna`, LLM says `audit`) without having to define an ambiguity heuristic. The classifier prompt is given a file-attachment hint (boolean + `fileName`, never the file body) so it has the same signal the pre-pass used; on any error or unparseable output it falls back to the pre-pass so a classifier failure never blocks routing. This supersedes the "only for genuinely ambiguous input" wording above; PRD §4.9's matching wording is not amended (PRD no-modify rule) — the feature doc records the as-built behavior.

**Refs:** PRD §4.9; `docs/infra/risks.md` R4.

---

## ADR-004 — Streaming is a v1 hard requirement

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** PRD §3.3 originally said "support streaming if the API route supports it," which made streaming optional. For a live talk, a 10–30s blank screen per turn is unacceptable and undermines the agent narrative. R3 asked to promote streaming to in-scope.

**Decision.** Streaming (SSE or chunked transfer over `fetch`) is required for v1. The Next.js `/api/chat` route streams the Lambda response to the browser, and the UI renders partial assistant messages as chunks arrive.

**Consequences.**
- Pros: better UX during long LLM/tool calls; strong credibility/teaching point; fits the demo format.
- Cons: more complex front-end message assembly; checkpoint/HITL suspension messages must be distinguishable from ordinary streaming tokens (e.g. a final JSON frame with `checkpointState`).
- Implementation note: the final response still returns structured metadata (`meta`, optional `checkpointState`) — these can be delivered as a terminal SSE frame with a `done` event, not inline text tokens.

**Refs:** PRD §3.3; `docs/infra/risks.md` R3.

---

## ADR-003 — Ollama provider uses Ollama Cloud remote API

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** R1 identified that `ChatOllama` defaulting to `http://localhost:11434` cannot work on AWS Lambda, because Lambda's `localhost` is the Lambda container, not the user's machine. The original PRD listed `ollama` as one of four supported providers without specifying the host.

**Decision.** Use Ollama Cloud (remote API at `https://ollama.com`) for the deployed demo path. `ChatOllama` is configured with `baseURL: 'https://ollama.com'` and the API key passed as an `Authorization: Bearer <token>` header. Provider remains in the four-option settings selector. Local `localhost:11434` development remains possible if the developer is running Ollama locally, but is not the default.

**Why this is cheap.** No new provider type; `ChatOllama` supports a remote host and Bearer auth. The same BYOK security model applies: the user's Ollama Cloud key lives in `sessionStorage` and is forwarded per request.

**Consequences.**
- Pros: all four advertised providers work in the deployed demo; no special-casing in UI; R1 resolved cleanly.
- Cons: requires users to have an Ollama Cloud API key; only "cloud" models are available via the remote endpoint; pricing/limits are outside our control.
- Open question: local development ergonomics — if a developer selects `ollama` locally without Ollama running, the failure is a connection error, not a 401. Error messaging should distinguish "cannot reach Ollama" from auth failure.

**Refs:** PRD §3.2, §4.5b; `docs/infra/risks.md` R1; https://docs.ollama.com/cloud.

---

## ADR-002 — Chat threads persist; API keys do not ("remember chats, never credentials")

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** The original PRD model was one `sessionId` per browser tab, held in
`sessionStorage` — closing the tab wiped everything. For a live demo where the
presenter switches between a QnA example, a wallet example, and an audit example,
single-tab-only conversations are poor UX and risk losing prep work. A thread
sidebar (multi-session, like ChatGPT) was requested. The fork: whether threads
persist across tab/browser close. The constraint: API keys MUST stay
`sessionStorage`-only (cleared on tab close) — that is the entire BYOK security
story (§3.2, §9) and is non-negotiable.

**Decision.**
- Adopt multi-session chat threads. The left sidebar lists all locally-known
  threads from IndexedDB; "New chat" mints a fresh `sessionId`; switching/deleting
  threads is supported.
- **Retention:** threads (messages + serialized `checkpointState`) persist in
  IndexedDB across tab and browser close. API keys stay in `sessionStorage` and
  are cleared on tab close — the two stores are never unified.
- Reopening the app: saved thread list is visible, but chat is blocked until
  keys are re-entered. The UI states this explicitly: "We remember your
  conversations, never your credentials."
- Each thread carries its own `checkpointState`; HITL resume uses that thread's
  last state — no cross-thread leakage.
- The thread list is for conversations only; intent routing remains invisible
  (no "mode" entries).

**Why this is cheap.** The backend is already stateless and resume is
client-owned (`checkpointState` rides in the request body, not looked up by
`sessionId` server-side — §4.10). `sessionId` is a correlation id, not a state
key. So threads are almost entirely a client-side change: the IndexedDB `sessions`
store already keys by `sessionId` (no schema change), and the active-session
pointer is just Zustand state. No new backend routes, no Lambda change. R2
(HITL resume) is unaffected — cleaner if anything.

**Consequences.**
- Pros: matches audience UX expectation; enables demo choreography across
  pre-prepared threads; preserves every BYOK security property (keys still wipe
  on tab close, never touch disk).
- Cons: reopening lands on "threads exist but keys gone" — must be designed as a
  first-class empty state (done in `docs/design.md` §5.2) or it reads as a bug.
  Adds a `localStorage`/IndexedDB-persisted surface that holds conversation text
  (not credentials) — acceptable, but means a "clear all conversations"
  affordance is needed (added to settings panel spec).
- Closes two §6 deferred questions (listable = yes; retention = persist).
  Remaining §6 items (exact schema, analytics display, cost formula) stay
  deferred pending the dedicated IndexedDB discussion.
- Follow-up micro-decision deferred to build time: behavior when switching away
  from a thread that is mid-stream (block switch vs freeze stream) — not a
  design-prompt concern.

**Refs:** PRD §3.2, §3.3, §3.5 (new), §6, §9; `docs/design.md`.

---

## ADR-001 — SessionStart reminder hook for open risks

**Date:** 2026-06-25 · **Status:** Accepted

**Context.** During foundational PRD review, seven demo-day risks were
identified (Ollama-through-Lambda, HITL resume-from-serialized-state, streaming,
hybrid router, 50KB checkpoint cap, parallel-audit timing, rehearsed questions).
These are easy to forget between sessions and would surface as broken demos
late. The user wanted a persistent, intrusive reminder mechanism.

**Decision.** Add a `SessionStart` hook (`scripts/on-session-start.sh`, wired in
`.agents/hooks.json`) that prints `docs/infra/risks.md` into the agent's context
at the start of every session, and an AGENTS.md §11 step 5 instructing the
agent to verbally re-surface every `STATUS: OPEN` item to the user before
starting work.

**Consequences.**
- Pros: risks stay top-of-mind; reminders are automatic and bidirectional
  (injected into context AND spoken to the user); the hook is
  self-extinguishing — once no `STATUS: OPEN` lines remain it prints nothing,
  so the nag rewards resolution.
- Cons: every session begins with the risks dump until items close; trivial
  cost, easy to tune by editing `risks.md`.
- To remove the mechanism entirely: delete the `SessionStart` block in
  `.agents/hooks.json`, the script, §11 step 5, and `risks.md`.
