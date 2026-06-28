# Feature: Agent Architecture

> **Module doc for the core agent architecture.** Part of: Hexpert — see CLAUDE.md for full project context.
> Status: Stable
> Last updated: 2026-06-26
>
> **Promotion threshold:** When this file exceeds ~400 lines, promote to `docs/features/agent-architecture/` directory.

---

## What This Feature Does

Defines the end-to-end agent architecture for Hexpert: a single LangGraph main graph that classifies user intent, then dispatches to one of three subgraphs (QnA, Wallet, Audit). It also governs how the frontend streams responses, how LLM clients are instantiated per request, and how the agent resumes after a human-in-the-loop (HITL) checkpoint.

---

## Files & Ownership

**Specification source:**
- `docs/prds/prd.md` §4 — Agent Backend
- `docs/prds/prd.md` §3.3 / §3.4 — Streaming + Next.js gateway

**Implementation files:**
- `apps/agent/src/utils/llmFactory.ts` — per-request LLM client factory — DONE
- `apps/agent/src/utils/sanitise.ts` — prompt-injection guard (`wrapUserContent`) — DONE
- `apps/agent/src/checkpointer.ts` — lazy `RedisSaver` singleton (ADR-008) — DONE
- `apps/agent/src/middleware/extractHeaders.ts` — BYOK header validation + local-dev fallback — DONE
- `apps/agent/src/tools/` — `webSearch` (8-domain allowlist), `fileReader`, `etherscan`, `contractFetcher`, `ens`, `etherscanRateLimit` + barrel — DONE. `fetchEnsName` delegates to `ens.ts` (reverse ENS via viem + public RPC); `fetchTransactions`/`fetchTokenHoldings` return compact summaries (count + samples) instead of sliced raw JSON. `etherscanRateLimit` gates all Etherscan `fetch`es to ≤3 calls/sec (free-tier ceiling) process-wide via a sliding window shared by `etherscan.ts` + `contractFetcher.ts`.
- `apps/agent/src/chains/qnaChain.ts` — bounded ReAct QnA chain — DONE
- `apps/agent/src/graphs/state.ts` — LangGraph `Annotation` mirroring `GraphState` — DONE
- `apps/agent/src/graphs/mainGraph.ts` — hybrid router + dispatch — DONE (wallet + audit nodes are nested subgraphs; router also extracts the 0x/ENS target into `walletAddress`)
- `apps/agent/src/graphs/walletGraph.ts` — wallet subgraph: `fetchParallel` (ENS + txns + tokens) → `initialSynthesis` (forced `record_wallet_profile` tool call + zod) → `hitlCheckpoint` (interrupt) → `deepDiveDispatch` (Send fan-out to defi/nft/governance) → `finalSynthesis` — DONE (live-confirmed 2026-06-26 on Ollama Cloud + Etherscan V2 + Upstash Redis)
- `apps/agent/src/graphs/walletSchema.ts` — zod profile schema + `record_wallet_profile` tool + `WALLET_DEEPDIVE_OPTIONS` constants — DONE
- `apps/agent/src/graphs/auditGraph.ts` — audit subgraph: one tool-calling structured-output `analyseContract` node (zod-validated, uniform across all 4 providers incl. Ollama Cloud) + HITL follow-up — DONE (Step 6+)
- `apps/agent/src/graphs/auditSchema.ts` — zod findings schema + `record_audit_findings` tool + `AUDIT_FOLLOWUP_OPTIONS` constants — DONE
- `apps/agent/src/routes/chat.ts` — POST `/api/chat` SSE handler — DONE
- `apps/web/app/api/chat/route.ts` — server-side gateway proxy — TODO (web feature)
- `apps/web/app/page.tsx` — streaming chat UI — TODO (web feature)

**What lives here vs. elsewhere:**
- Tool definitions → `apps/agent/src/tools/`
- Shared types → `packages/shared/src/index.ts`
- BYOK settings UI → `apps/web/app/page.tsx` settings panel (owned by Frontend feature)
- Conversation persistence → IndexedDB feature doc (TBD — blocked on §6 discussion)

---

## Data Model

See `packages/shared/src/index.ts` for canonical types:
- `Intent`: `'qna' | 'wallet' | 'audit'`
- `ChatRequest`: `{ message, sessionId, fileContent?, fileName? }`
- `GraphState`: `{ sessionId, intent, messages, walletAddress, fileContent, walletProfile, auditReport, awaitingHITL, hitlPrompt }`
- `WalletProfile`, `AuditFinding`, `AuditReport`, `StoredMessage`, `MessageMeta`

---

## Business Logic

**Core rules:**
- The Lambda backend is stateless for conversations (no message/session DB). The only server-side state is the short-lived HITL **checkpoint in TTL-evicted Redis** (`RedisSaver`, `defaultTTL` minutes + `refreshOnRead: true`), keyed by `thread_id = sessionId` (per ADR-008). Lambda holds no checkpoint state between requests; Redis bridges the two turns and self-cleans.
- The client does **not** send a serialized checkpoint. Resume is keyed by `sessionId` (the `X-Session-Id` header); the user's reply is the message, and Lambda resumes via `Command({ resume: message })`.
- LLM clients are created per request from `res.locals` headers — never module-level, never logged.
- All user-supplied content is wrapped by `wrapUserContent` before entering any prompt (prompt-injection guard).
- API keys live in `sessionStorage` only; Lambda validates headers but never stores them.

**Routing rules (hybrid, post-ADR-005):**
1. If `fileContent` is present → `audit`.
2. Else if the message contains an Ethereum address (`0x…`) or ENS name (e.g. `vitalik.eth`) → `wallet`.
3. Else → `qna`.
4. If the pre-pass flags ambiguity, a lightweight LLM tie-breaker selects the final intent.

**Streaming rules (post-ADR-004):**
- v1 requires SSE/chunked streaming from Lambda through the Next.js gateway to the browser.
- Partial assistant text is rendered progressively.
- The final SSE frame carries structured metadata (`meta`) so the UI can finalize the message; the checkpoint lives server-side in Redis (ADR-008), so no `checkpointState` is sent to or stored by the client.

---

## Key Flows

### New chat turn

1. Browser POSTs to `/api/chat` with `ChatRequest` + provider/model/search headers.
2. Next.js gateway validates `X-Api-Key` format and payload size, then streams the request to Lambda.
3. Lambda middleware validates headers and attaches them to `res.locals`.
4. `chat.ts` invokes `mainGraph` with the request body and message history.
5. `mainGraph.router` classifies intent using the hybrid rules.
6. The appropriate subgraph runs. If it hits a HITL checkpoint, the graph suspends in Redis (keyed by `thread_id = sessionId`) and streams a HITL prompt back.
7. Lambda streams SSE frames back through the gateway: `token` → … → terminal `meta` → `[DONE]`.
8. UI writes the `StoredMessage` (message + `meta`; no `checkpointState`) to IndexedDB.

### Resuming from HITL

1. Browser sends the user's reply as the `message` and reuses the same `sessionId` (the `X-Session-Id` header). It does **not** send any serialized checkpoint.
2. Lambda `chat.ts` invokes the graph with `{ configurable: { thread_id: sessionId } }` against the shared `RedisSaver`.
3. `getState(config)` is non-empty (a suspended checkpoint exists in Redis for this `thread_id`) → resume the suspended subgraph directly via `Command({ resume: message })` — skip the router. The user's message becomes the HITL response.
4. Graph completes or suspends again; response is streamed back and stored. The Redis checkpoint TTL refreshes on read; if it had expired, the request is treated as a fresh turn (router runs).
5. Lambda holds no state between requests — the cold Lambda loads the checkpoint from Redis on this invocation.

---

## Dependencies

**This feature depends on:**
- `packages/shared` — shared types
- `@langchain/core`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-redis`, provider-specific LangChain packages
- `viem` v2 — ENS forward/reverse resolution against a public Ethereum RPC (wallet subgraph)
- AWS Lambda Web Adapter — fronts the Express app on Lambda and streams Function URL events through (response streaming — ADR-011; replaces the earlier `serverless-http` plan, which buffered the whole response and would have broken SSE)
- Redis (Upstash in deployed demo, local in dev) via `REDIS_URL` — TTL-evicted HITL checkpointer (per ADR-008)
- Tavily API (via `X-Search-Key`) — web search tool
- Etherscan API (Lambda env `ETHERSCAN_API_KEY`) — wallet/contract tools
- Public Ethereum RPC (env `ETH_RPC_URL`, default `https://ethereum.publicnode.com`) — ENS forward/reverse resolution (wallet subgraph); must support ENS universal-resolver CCIP-read batch gateways
- Ollama Cloud (`https://ollama.com`) — `ollama` provider remote API

**Other features that depend on this:**
- Frontend chat UI — consumes `/api/chat` and renders streams/HITL prompts
- IndexedDB persistence — stores messages (and `meta`); no `checkpointState` per ADR-008

**Infra docs to read when working here:**
- `docs/prds/prd.md` §4
- `docs/infra/api-contracts.md`
- `docs/infra/decisions.md` ADR-003 through ADR-006
- `docs/infra/risks.md`

---

## Known Issues & Tech Debt

- Cost/token analytics are blocked on the §6 design discussion (`estimatedCostUsd` is always `0`).
- The default ENS RPC (`ethereum.publicnode.com`) must support ENS universal-resolver CCIP-read batch gateways; Cloudflare's `cloudflare-eth.com` does NOT (returns "Internal error" on `resolveWithGateways`). `eth.drpc.org` is a confirmed alternative. See `ens.ts`.
- Etherscan V1 (`api.etherscan.io/api`) is deprecated and returns an error string as `result`; the tools use V2 (`api.etherscan.io/v2/api?chainid=1`). `etherscanGet` throws on real errors (rate limit / invalid key / deprecation) rather than silently coercing a string `result` to `[]`. `fetchTransactions`/`fetchTokenHoldings` cap at `offset=1000` (whale wallets like vitalik.eth return 10000 rows / ~7MB unbounded — too slow for a live demo; the cap is flagged in the summary so the profile stays honest). All Etherscan `fetch`es are gated by `etherscanRateLimit.ts` to ≤3 calls/sec (free tier; a warm Lambda or local dev overlapping turns on one `ETHERSCAN_API_KEY` would otherwise 429). Bump `MAX_CALLS` if the key is upgraded (Lite 5, Standard 10, Advanced 20, Pro/Pro Plus 30).
- Turn-2 latency on a whale wallet (~40s for `deepDiveDefi` with 2 `fetch_contract_source` calls + `finalSynthesis`) is high; streaming keeps the screen live, but a smaller demo address would be snappier.

## Resolved

- HITL resume-from-serialized-state — RESOLVED 2026-06-25 via ADR-008, and **empirically CONFIRMED** against a live Upstash Redis. A spike (`apps/agent/src/spikes/audit-hitl-spike.ts`, `@langchain/langgraph@1.4.6`) proved stateless resume from a client-supplied blob is impossible (cross-process `updateState(values)` and `Command({update,resume})` both fail), then confirmed the fix: two separate `RedisSaver` instances (simulating two cold Lambdas) resume off the same Redis by `thread_id = sessionId` (EXP R PASS), TTL is set on all checkpoint keys and actually expires after `defaultTTL` (EXP T PASS, ~61s at `defaultTTL:1`). RediSearch is not required (only RedisJSON). See `docs/infra/risks.md` R2.
- 50KB body cap vs `checkpointState` size — RESOLVED 2026-06-25 via ADR-007 (per-field caps). With ADR-008 the client no longer sends `checkpointState`, so its 2MB cap is moot for the resume path; `fileContent ≤ 64KB` still matters. See `docs/infra/risks.md` R5.

---

## Recent Changes

- **2026-06-28**: Two `chat.ts` streaming fixes/additions found during localhost testing. (1) **Classifier-token leak:** `on_chat_model_stream` forwarded *every* LLM token, including the always-on router tie-breaker, whose prompt replies with one word (`qna`/`wallet`/`audit`) — so that word prepended to the real answer (e.g. `qnaHello!`). Fix: the classifier `llm.invoke` in `mainGraph.llmTieBreak` is now tagged `{ tags: ["intent-classifier"] }`, and `chat.ts` drops any `on_chat_model_stream` event carrying that tag. (2) **`webSearch` SSE frame (new):** `chat.ts` now handles `on_tool_end` for `web_search` and emits `{ type:"webSearch", query, urls, bytes }` — `query` from the tool's `data.input`, `urls` from the result-markdown's URL lines (line-anchored so URLs inside page excerpts aren't counted as "surfed"), and `bytes` = `Buffer.byteLength` of the retrieved markdown. The `web_search` tool and the qna chain are unchanged. Added to the `SseFrame` union in both `chat.ts` and `apps/web/lib/sse.ts`; the frontend renders it via a new `WebSearchActivity.tsx` card (see `docs/features/frontend.md`). The eval harness `SseFrame` is a loose union and `parseSse` JSON-parses every frame, so the new frame needs no harness change (confirmed: 16/16 agent tests pass).

- **2026-06-26**: Switched the Lambda deploy path from `serverless-http` to the **AWS Lambda Web Adapter** with response streaming (ADR-011; resolves R9). `serverless-http` buffers the entire Express response and returns it on `res.end()` — SSE frames would all arrive at the browser at once after the turn, reproducing the 10–40s blank screen ADR-004 forbids. With the Web Adapter: `apps/agent/src/index.ts` drops the `serverless-http` handler and just runs `app.listen(PORT)` (the `require.main` guard already covers both local tsx and Lambda, since the adapter boots the app via `node dist/index.js` through `run.sh`); `apps/agent/run.sh` is the Lambda handler; `apps/agent/scripts/pack-lambda.sh` stages `run.sh + dist/ + prod node_modules/` into `lambda-pkg/` (and `dist-lambda.zip`); `infrastructure/template.yaml` (SAM) defines the function (nodejs20.x, handler `run.sh`, 512MB, timeout 60s) with the `LambdaAdapterLayerX86` layer, `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, `AWS_LWA_INVOKE_MODE=response_stream`, `PORT=8000`, and a Function URL with `InvokeMode: RESPONSE_STREAM` + public invoke permission. `build:lambda` script added; `serverless-http` dependency removed. PRD §4.1/§4.2/§7/§8, AGENTS.md, README, and this doc updated. Build clean. Deploy runbook in `infrastructure/README.md`.

- **2026-06-26**: Implemented the always-on LLM router tie-breaker (ADR-005 / PRD §4.9). `mainGraph.classifyIntent` is now async: it runs the deterministic pre-pass (`fileContent` → audit; `0x`/ENS → wallet; else qna), then invokes the user's selected LLM on every new turn to classify the latest user message into `audit`/`wallet`/`qna`. The LLM's label overrides the pre-pass only when it disagrees; on any error or unparseable output it falls back to the pre-pass so a classifier failure never blocks routing. The classifier prompt is given a file-attachment hint (boolean + `fileName`, never the file body — keeps it cheap on audit turns) so it has the same signal the pre-pass used. User content is wrapped via `wrapUserContent`. `routerNode` is now async. Cost is intentionally not a concern (per user). Build clean. This was the last open backend-logic TODO; the agent backend (`apps/agent`, PRD §4) is feature-complete. Next per build order: AWS Lambda deploy (PRD §7) → manual end-to-end test against the deployed Lambda → evals (PRD §5) → frontend.

- **2026-06-26**: Added Etherscan rate limiting. New `apps/agent/src/tools/etherscanRateLimit.ts` exports `etherscanFetch(url)` — a sliding 1s window over dispatch timestamps, `MAX_CALLS=3` (free-tier ceiling), enforced process-wide. `etherscan.ts` (`etherscanGet`) and `contractFetcher.ts` both route their `fetch`es through it. Motivation: the wallet subgraph fires `txlist` + `tokentx` concurrently in `fetchParallel`, and a warm Lambda (or local dev) can overlap turns on the single shared `ETHERSCAN_API_KEY` — 2 concurrent turns = 4 calls/sec = a 429 ("Max rate limit reached"). The limiter makes the burst impossible; existing error handling still surfaces any residual 429 body. Paid tiers raise the ceiling — bump `MAX_CALLS`. Build clean.

- **2026-06-26**: Wallet subgraph live-confirmed + Etherscan V2 migration. The first smoke (vitalik.eth) ran the full graph correctly but on EMPTY data: Etherscan has deprecated the V1 endpoint (`api.etherscan.io/api` → `{"status":"0","message":"NOTOK","result":"You are using a deprecated V1 endpoint..."}`), and `etherscanGet` was silently coercing that string `result` to `[]` via `Array.isArray(result) ? result : []` → "0 transactions". Fixed: `etherscan.ts` + `contractFetcher.ts` switched to Etherscan API V2 (`api.etherscan.io/v2/api?chainid=1`); `etherscanGet` now throws on real errors (status "0" with a non-"No transactions found" message, surfacing the `result` string) and returns `[]` only for legit-empty. `fetchTransactions`/`fetchTokenHoldings` cap at `page=1&offset=1000` (whale wallets return 10000 rows / ~7MB unbounded — too slow for a live demo; the cap appends "(showing first 1000; wallet may have more)" so the profile stays honest). Re-smoked on :3002 with env loaded: turn 1 → 2 tool frames + `hitl` frame (real data: 1000 txns, 243 distinct tokens, 15.9s); turn 2 "DeFi positions" → 2× `fetch_contract_source` (deepDiveDefi bounded ReAct) + 2082 streamed tokens grounded in real data ("First activity Sep 2015… 1000+ transactions"), 40.6s. Validates the full wallet path: ENS forward resolve → parallel Etherscan V2 fetch → structured-output profile → Redis HITL suspend/resume → `Send` fan-out → streamed finalSynthesis.
- **2026-06-26**: Implemented the wallet subgraph (PRD §4.7). New `apps/agent/src/tools/ens.ts` (forward + reverse ENS via viem v2 against a public Ethereum RPC — default `ethereum.publicnode.com`, overridable via `ETH_RPC_URL`; no API key, no cost), `apps/agent/src/graphs/walletSchema.ts` (zod profile schema + `record_wallet_profile` tool + `WALLET_DEEPDIVE_OPTIONS`), and `apps/agent/src/graphs/walletGraph.ts` (`buildWalletGraph({params, checkpointer?})` factory: fetchParallel → initialSynthesis → hitlCheckpoint → deepDiveDispatch → Send fan-out to deepDiveDefi/Nft/Governance → finalSynthesis → END). Structured output via tool-calling + zod (uniform across all 4 providers incl. Ollama Cloud, same approach as audit). `fetchParallel` forward-resolves ENS-name input via `resolveEnsAddress`, then runs reverse-ENS + `fetchTransactions` + `fetchTokenHoldings` concurrently. `initialSynthesis` forces one `record_wallet_profile` call; deterministic fields (address/ensName/transactionCount) are merged in the node, the LLM only produces age/topContracts/tokenHoldings/summary. `deepDiveDispatch` parses the user's multi-select reply (case-insensitive substring) and fans out via LangGraph `Send`; "Full summary" or no match → `finalSynthesis` from the initial profile alone. `deepDiveDefi` uses `fetchContractSource` (bounded ReAct, max 3). Nested+factory integration mirrors audit: compiled without its own checkpointer and added as the `wallet` node in `mainGraph`, so its `interrupt()` bubbles up to mainGraph's RedisSaver and `chat.ts` is unchanged (the existing `hitl` SSE frame surfaces the wallet prompt). `mainGraph.router` now also extracts the 0x/ENS target into `state.walletAddress`. `etherscan.ts` `fetchEnsName` delegates to `ens.ts`; `fetchTransactions`/`fetchTokenHoldings` switched from sliced raw JSON to compact summaries (count + samples) to avoid truncation-broken `transactionCount`. `viem@^2.53.1` added; `.env.example` adds `ETH_RPC_URL`. Build clean. ENS path live-confirmed (`vitalik.eth`↔address both directions, no-record→null).
- **2026-06-26**: Resolved R8 — `chat.ts` now emits a `hitl` SSE frame (question + options, extracted from the suspended checkpoint's interrupt value) when the graph suspends, and a `report` frame carrying the structured `AuditReport` when `finalReport` produced one (it's deterministic, never streamed as tokens). `MessageMeta`/`packages/shared` unchanged. Surfacing was confirmed necessary by the live smoke test (turn 1 showed the client nothing; turn 2 only the streamed fix).
- **2026-06-26**: Implemented the audit subgraph (PRD §4.8 / ADR-006). New `apps/agent/src/graphs/auditSchema.ts` (zod findings schema + `record_audit_findings` tool + `AUDIT_FOLLOWUP_OPTIONS` constants) and `apps/agent/src/graphs/auditGraph.ts` (`buildAuditGraph({params, checkpointer?})` factory: readContract → analyseContract → hitlCheckpoint → conditional(generateFix|generateExploit|finalReport) → finalReport → END). Structured output is done via **tool calling + zod validation**, uniform across all four providers incl. Ollama Cloud (which has no structured-output mode but supports tool calling) — no `format`/json_schema dependency. Nested+factory integration: the subgraph is compiled without its own checkpointer and added as the `audit` node in `mainGraph`, so its `interrupt()` bubbles up to mainGraph's RedisSaver and `chat.ts` is unchanged. The five finding categories live only in the zod schema; state holds a flat `findings: AuditFinding[]` (honours ADR-006's "one call, five categories" without five state channels). `zod@^3.25.76` added explicitly to `apps/agent/package.json`. Build clean. **Live smoke CONFIRMED 2026-06-26** on Ollama Cloud + `glm-5.2:cloud`: turn 1 (`analyseContract` tool-call + zod → `hitlCheckpoint` interrupt → suspend in Redis, `intent:"audit"`) and turn 2 (resume via same `sessionId`, router skipped, `generateFix` streamed a contract-specific fix from the checkpointed findings) both passed. Validates the uniform tool-calling structured-output path on the one provider (Ollama Cloud) with no native structured-output mode. Note: `toolCallCount` reads `0` on audit turns because `record_audit_findings` is intercepted (never invoked), so `on_tool_start` doesn't fire — expected.
- **2026-06-25**: Resolved R2 — ADR-008. Spike proved stateless interrupt-resume from a client blob is impossible in `@langchain/langgraph@1.4.6`; HITL checkpoint now lives in TTL-evicted Redis (`RedisSaver`, `thread_id = sessionId`). The client no longer sends `checkpointState`; resume is keyed by `sessionId`. PRD §2/§3.3/§3.5/§4.7/§4.8/§4.10 amended. Spike at `apps/agent/src/spikes/audit-hitl-spike.ts`.
- **2026-06-25**: Resolved R5 — ADR-007. Per-field body caps replace the single 50KB total cap; `checkpointState` cap now moot for resume (ADR-008); `fileContent ≤ 64KB` keeps the first-turn audit from 413ing.
- **2026-06-25**: Resolved R1 — Ollama provider now targets Ollama Cloud (`https://ollama.com`) with Bearer auth, so the deployed Lambda path works.
- **2026-06-25**: Resolved R3 — streaming promoted from aspirational to v1 hard requirement (SSE/chunked).
- **2026-06-25**: Resolved R4 — router is now a hybrid deterministic pre-pass with LLM tie-breaker instead of a pure-LLM classifier.
- **2026-06-25**: Resolved R6 — audit subgraph collapsed from five parallel LLM check nodes to one structured-output `analyseContract` node.
- **2026-06-25**: Built the QnA slice end-to-end (Steps 1-5). Shared types for all PRD §2 types (`packages/shared/src/index.ts`); agent foundation — `checkpointer.ts` (lazy `RedisSaver` singleton), `extractHeaders` middleware (BYOK + local-dev fallback), `index.ts` (Express/CORS/3mb json-limit/`build` script); tools — `webSearch` (8-domain allowlist), `fileReader`, `etherscan` (txns + tokens; `fetchEnsName` stubbed), `contractFetcher`; `qnaChain` (bounded ReAct loop, **not** `AgentExecutor`, so LLM `.invoke()` token events surface via `streamEvents`); `mainGraph` hybrid router + `qnaNode` (wallet/audit are Step 6 stubs); `chat.ts` SSE handler (token/tool/meta/error frames + `[DONE]`, abort-on-disconnect, `on_chat_model_end` usage aggregation). Verified live against Ollama Cloud + Tavily + Upstash Redis: token streaming, the `web_search` ReAct loop, and multi-turn history persistence all confirmed.
- **2026-06-25**: Added local-dev env fallback in `extractHeaders` (`LOCAL_DEV_API_KEY` / `LOCAL_DEV_SEARCH_KEY`) so the pipeline can be smoke-tested with curl without key headers. Guarded by `!process.env.AWS_LAMBDA_FUNCTION_NAME` — dead on Lambda, BYOK headers required as PRD §4.3 specifies. Keys live in gitignored `.env`, never packaged for deploy.
- **2026-06-25**: Renamed the Question-and-Answer feature from "QA" to "QnA" across code and docs to avoid confusion with Quality Assurance. Intent value `"qa"`→`"qna"`, `qaChain.ts`→`qnaChain.ts`, `runQa`→`runQna`, `qaNode`→`qnaNode`, `QaChainParams`→`QnaChainParams`. `docs/infra/testing.md` keeps "QA" where it genuinely means Quality Assurance (`pre-merge-qa-tester` agent, "manual QA").
