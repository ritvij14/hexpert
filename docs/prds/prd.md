# Hexpert — Product Requirements Document

---

## ⚠️ STRICT INSTRUCTION — READ BEFORE ANYTHING ELSE

**This PRD is the single source of truth for the Hexpert project.**

- This document must not be modified unless the user **explicitly requests a change**.
- If the user's intent is ambiguous or could imply a PRD update, **ask a clarifying question immediately** before making any changes.
- All implementation decisions must trace back to this document.
- If a conflict arises between this PRD and any other instruction, this PRD wins.

---

## Overview

**Hexpert** is a demo-first educational tool built to showcase AI agent architecture to a developer audience at an Ethereum community event. It is a monorepo containing a Next.js 16 frontend and an Express backend orchestrated with LangChain and LangGraph. It exposes a single unified chat interface where users can ask Ethereum questions, analyse wallets, and audit smart contracts — the agent routes and handles everything.

The primary goal is to teach, not to ship. Every architectural decision should serve clarity and demonstrability.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router, TypeScript), deployed on Vercel |
| API Gateway | Next.js API Routes (Vercel serverless functions) — proxies all requests to Lambda |
| Backend | Express + TypeScript, deployed on AWS Lambda via the AWS Lambda Web Adapter (response streaming) |
| Orchestration | LangChain (QnA chain) + LangGraph (main agent graph with router, wallet subgraph, audit subgraph) |
| Client Storage | IndexedDB (conversation history, graph checkpoints, analytics) |
| File Handling | LLM-native file reading (Solidity `.sol` uploads via chat) |
| Evals | LangGraph-assisted evals |
| Monorepo | npm workspaces |
| Shared Types | `@hexpert/shared` package |
| LLM Auth | BYOK — user-supplied API key stored in `sessionStorage`, forwarded via `X-Api-Key` header |

---

## Request Flow Architecture

```
Browser (API key in sessionStorage)
  ↓ POST /api/chat  { message, sessionId, fileContent? }
  ↓ Header: X-Api-Key: sk-...
Next.js API Route (Vercel — server side only, never exposed to browser)
  → Validates key format
  → Signs the request to the Lambda Function URL with the hexpert-vercel IAM user's keys (SigV4) — the Function URL is IAM-auth (ADR-012), so anonymous/unsigned calls are rejected at the AWS layer before the Lambda runs
  → Forwards request to Lambda URL (env var, never in client bundle)
  → Header: X-Api-Key forwarded
AWS Lambda (Express + LangGraph)
  → Instantiates LLM client with key from header (per-request, never stored)
  → Runs main LangGraph agent (router → subgraph)
  → Calls Etherscan / web search tools as needed
  → Returns response + serialized graph state + token/cost metadata to Next.js route
  → Returns response
Next.js API Route
  → Returns response to browser
```

The Lambda URL is a server-side secret. It is never exposed in the browser bundle, network tab, or client-side code. The browser only ever communicates with the same Vercel origin.

---

## Agent Architecture

The core of Hexpert is a single LangGraph graph. All user messages enter this graph regardless of intent.

```
User Message (text or text + .sol file)
        ↓
[Router Node]
LLM classifies intent into one of three types:
  - qna      → routes to QnA subgraph
  - wallet   → routes to Wallet subgraph
  - audit    → routes to Audit subgraph
        ↓
┌──────────────────────────────────────────────────┐
│ QnA Subgraph        │ Wallet Subgraph            │ Audit Subgraph          │
│ (LangChain LCEL)    │ (LangGraph)                │ (LangGraph)             │
│                     │                            │                         │
│ Linear chain:       │ Parallel fetch:            │ Parallel checks:        │
│ prompt → LLM →      │  ENS | Txns | Tokens       │  Reentrancy | Access |  │
│ web search tool →   │        ↓                   │  Overflow | Calls |     │
│ response            │ Initial synthesis          │  Hardcoded              │
│                     │        ↓                   │        ↓                │
│                     │ ⏸ HITL checkpoint          │ ⏸ HITL checkpoint       │
│                     │ Agent asks user to         │ Agent presents initial  │
│                     │ choose deep-dive direction │ findings, asks user to  │
│                     │        ↓                   │ choose follow-up action │
│                     │ Selected nodes run         │        ↓                │
│                     │ (parallel if multiple)     │ Selected follow-up      │
│                     │        ↓                   │ nodes run               │
│                     │ Final synthesis            │        ↓                │
│                     │                            │ Final report            │
└──────────────────────────────────────────────────┘
        ↓
Single response streamed back to chat interface
```

**Key architectural points:**
- The router is a hybrid classifier: a deterministic pre-pass (`fileContent` → audit; Ethereum address/ENS → wallet; else qna) with a lightweight LLM tie-breaker only for ambiguous input (ADR-005)
- QnA uses a plain LangChain chain — deliberately simpler than the LangGraph subgraphs, teaches the contrast
- Wallet and Audit use LangGraph with parallel node execution and human-in-the-loop (HITL) checkpoints
- HITL checkpoints pause graph execution and send a message back to the user asking for direction — the graph resumes when the user replies
- All three paths return their response as a chat message in the same conversation thread

---

## Monorepo Structure

```
hexpert/
├── apps/
│   ├── web/               # @hexpert/web — Next.js 16
│   └── agent/             # @hexpert/agent — Express + LangChain/LangGraph
├── packages/
│   └── shared/            # @hexpert/shared — shared TypeScript types
├── evals/                 # LangGraph eval scripts
├── .env.example
├── .gitignore
└── package.json           # npm workspaces root
```

---

## 1. Monorepo Initialisation

- Create root `hexpert/` directory — DONE
- Create root `package.json` with `"workspaces": ["apps/*", "packages/*"]` — DONE
- Add `concurrently` as a root dev dependency — DONE
- Add root `dev` script that runs `@hexpert/web` and `@hexpert/agent` concurrently — DONE
- Create `.gitignore` covering `node_modules`, `.env`, `.next`, `dist`, `*.js.map` — DONE
- Create `.env.example` with placeholder keys for all environment variables used across the project — DONE
- Create `apps/`, `packages/`, `evals/` directories — DONE

---

## 2. Shared Package (`@hexpert/shared`)

- Create `packages/shared/package.json` with name `@hexpert/shared` — DONE
- Create `packages/shared/tsconfig.json` extending root config — DONE
- Create `packages/shared/src/index.ts` as the single export entry point — DONE
- Define and export `Intent` type: `'qna' | 'wallet' | 'audit'` — DONE
- Define and export `Message` type: `{ role: 'user' | 'assistant', content: string, timestamp: number }` — DONE
- Define and export `ChatRequest` type: `{ message: string, sessionId: string, fileContent?: string, fileName?: string }` — DONE
- Define and export `WalletProfile` type: fields for address, ENS name, age, transaction count, top contracts, token holdings, summary string — DONE
- Define and export `AuditFinding` type: fields for severity (`'high' | 'medium' | 'low' | 'info'`), title, description, lineReference — DONE
- Define and export `AuditReport` type: fields for contractName, findings array, overallRisk, summary string — DONE
- Define and export `GraphState` type: fields for sessionId, intent, messages, walletAddress, fileContent, walletProfile, auditReport, awaitingHITL (boolean), hitlPrompt (string) — DONE
- Ensure `@hexpert/web` and `@hexpert/agent` both reference `@hexpert/shared` in their `package.json` dependencies — DONE
- Define and export `ProviderConfig` type: `{ provider: 'openai' | 'anthropic' | 'openrouter' | 'ollama', apiKey: string, model: string, searchKey: string }` — DONE
- Define and export `MessageMeta` type: fields for `sessionId`, `messageId` (UUID), `intent` (Intent), `tokensUsed` (input + output), `estimatedCostUsd`, `latencyMs`, `toolCallCount`, `subgraphRan` (string) — DONE
- Define and export `StoredMessage` type: `Message` extended with `meta: MessageMeta`. (No `checkpointState` field — per ADR-008, HITL state lives server-side in Redis keyed by `sessionId`; the client does not send or store a serialized checkpoint.) — DONE
- Define and export `SessionStore` type: fields for `sessionId`, `createdAt`, `messages: StoredMessage[]` — DONE

---

## 3. Frontend (`@hexpert/web`)

> **Status (2026-06-28):** The `apps/web` slice is built and verified for the
> localhost demo (against the local agent on :3001) — `tsc --noEmit` +
> `next build` green; the `/api/chat` gateway smoke-tested (clean 502/504 on
> agent-down/timeout; per-field caps enforced). As-built module doc:
> `docs/features/frontend.md`. Implementation honors the two deferral notes
> below: IndexedDB persistence (§3.3 note — now implemented, see §6 and
> `docs/infra/risks.md` R10 F3) and no-SigV4 on the local path (§3.4
> note — the deployed-Lambda SigV4 gateway wiring is added when the deploy is
> verified). The five follow-up gap decisions (F1–F5) in
> `docs/infra/risks.md` R10 are resolved: F1/F3/F4/F5 implemented 2026-06-28;
> F2 is a no-op (online icon fetch is acceptable for the demo).

### 3.1 Project Setup
- Scaffold Next.js 16 App Router project with TypeScript inside `apps/web/` — DONE
- No `src/` directory — pages and components live at root of `apps/web/` — DONE
- Install `@hexpert/shared` as a workspace dependency — DONE
- Create `.env.local.example` with `LAMBDA_URL` placeholder (server-side only, no `NEXT_PUBLIC_` prefix) — DONE
- Deploy target is Vercel — ensure no client-side references to Lambda URL exist anywhere in the codebase

### 3.2 BYOK
- The **active session id** is held in `sessionStorage` under `hexpert_session_id`
- Starting a "New chat" generates a fresh `crypto.randomUUID()` and writes it as the active id (see §3.5)
- Include the active `sessionId` in the `ChatRequest` body (the `sessionId` field) on every request to `/api/chat` — the backend reads `body.sessionId`, not a header
- On page load, check `sessionStorage` for `hexpert_provider`, `hexpert_api_key`, `hexpert_model`, and `hexpert_search_key`
- If any of the four are missing, block chat input and prompt the user to complete settings before proceeding
- Provide a settings entry point (accessible at any time) containing:
    - A provider selector with four options: `openai`, `anthropic`, `openrouter`, `ollama`
    - An API key input with show/hide toggle
    - A model name text input (user types the model string they want to use)
    - A Tavily API key input with show/hide toggle
- On save, write all four values to `sessionStorage` under `hexpert_provider`, `hexpert_api_key`, `hexpert_model`, `hexpert_search_key` — never `localStorage`
- Display notice: "Your keys are sent over HTTPS and never stored on our servers. They are cleared when you close this tab."
- All requests to `/api/chat` must include the following headers read from `sessionStorage`:
    - `X-Api-Key` — LLM provider API key
    - `X-Provider` — selected provider string
    - `X-Model` — selected model string
    - `X-Search-Key` — Tavily API key
- If any request returns 401, surface an error prompting the user to check their keys

### 3.3 Chat Interface
- Single page at `app/page.tsx` — no sub-routes for different modes
- Render a scrollable conversation thread of user and assistant messages
- Render a text input at the bottom with a send button
- Render a file attachment button that accepts `.sol` files only, max 64KB, validated client-side before sending (raised from 50KB per ADR-007 so a max contract fits the first-turn payload)
- When a `.sol` file is attached, include its contents as `fileContent` and its name as `fileName` in the request body
- On send, POST to `/api/chat` with `ChatRequest` payload and `X-Api-Key` header
- Render assistant messages as they arrive — streaming is required (SSE/chunked from the Next.js API route); show partial content progressively so a long LLM turn never leaves a blank screen
- Initialize IndexedDB on first load with a single object store named `sessions`, keyed by `sessionId`
- On every assistant response, write the full `StoredMessage` (including `meta`) to IndexedDB under the current `sessionId`
- On page load, read existing messages for the current `sessionId` from IndexedDB and render them in the conversation thread

> **IndexedDB persistence (here and in §3.5) is now implemented (2026-06-28, R10 F3):** a single `sessions` object store keyed by `sessionId`, value = the thread's full `UiMessage[]` (+ thread metadata); written on every assistant response and loaded on init/switch. API keys stay in `sessionStorage` (never unified with threads). HITL resume does NOT depend on IndexedDB — the checkpoint is server-side in Redis keyed by `sessionId` (ADR-008).
- When the agent hits a HITL checkpoint, the assistant message contains a question and options — render these as a normal chat message; the user replies in the text input as usual
- HITL resume is keyed by `sessionId` (sent in the `ChatRequest` body): the client sends the user's reply as the message and reuses the same `sessionId`; it does **not** send any serialized checkpoint (per ADR-008 the checkpoint lives server-side in Redis)
- HITL options may be rendered as selectable chips/buttons as a convenience; clicking a chip populates the text input and sends — the reply is still a normal chat message that resumes the graph by `sessionId`. Wallet deep-dive options support multi-select; audit follow-up is single-select

### 3.4 Next.js API Route (Gateway)
- Create `app/api/chat/route.ts` as a server-side POST handler
- Read `LAMBDA_URL` from `process.env` — never expose to client
- Validate that `X-Api-Key`, `X-Provider`, and `X-Model` headers are present (`X-Search-Key` is optional — the agent's `extractHeaders` does the real validation: provider allowlist + `tvly-` prefix when a search key is supplied). Do NOT over-constrain the key format with a regex: key prefixes vary by provider (OpenAI `sk-`, Anthropic `sk-ant-`, OpenRouter `sk-or-`, Ollama Cloud), so a `sk-`-only regex would reject valid keys
- Check `Content-Length` — return 413 if payload exceeds 3MB (cheap pre-check per ADR-007)
- Parse the JSON body and enforce per-field caps (per ADR-007): `message` ≤ 8KB, `fileName` ≤ 256B, `fileContent` ≤ 64KB — return 413 with a field-specific message on violation. (The client no longer sends `checkpointState` — per ADR-008 the checkpoint is server-side in Redis.)
- Sign the outgoing request to the Lambda Function URL with SigV4 using `LAMBDA_IAM_ACCESS_KEY_ID` + `LAMBDA_IAM_SECRET_ACCESS_KEY` (the `hexpert-vercel` IAM user — see §8). The Function URL is `AuthType: AWS_IAM` (ADR-012); unsigned calls are rejected at the AWS layer before the Lambda runs
- Forward full request body and `X-Api-Key` header to Lambda URL via `fetch` (signed as above)
- Set 55-second timeout on the fetch to Lambda
- On Lambda error or timeout, return 502 to client
- On success, stream or forward Lambda response to client

> **Local-dev path:** when `LAMBDA_URL` points at the local agent (`http://localhost:3001`, via `npm -w @hexpert/agent run dev`), skip SigV4 signing and the IAM keys — the local agent has no IAM auth. SigV4 applies only to the deployed IAM-authed Function URL (ADR-012). The localhost demo runs against this local path; the deployed-Lambda gateway wiring (IAM keys, SigV4) is added when the deploy is verified.

### 3.5 Chat Threads (Multi-Session)
- A "New chat" action creates a fresh `sessionId` (via `crypto.randomUUID()`) and sets it as the active session
- The left sidebar renders the list of all locally-known threads from IndexedDB, each labelled by its first user message (truncated); the active thread is highlighted
- Switching threads sets the active `sessionId` and loads that thread's messages from IndexedDB into the conversation view
- Deleting a thread removes it from IndexedDB; if it was active, fall back to a "New chat" empty state
- **Retention:** threads (messages) persist in IndexedDB across tab and browser close; they are NOT cleared on tab close
- **Keys are separate from threads:** API keys live only in `sessionStorage` (per §3.2) and are cleared on tab close — reopening the app shows the saved thread list but requires re-entering keys before chat is enabled. Surface this explicitly in the empty/onboarding state: "We remember your conversations, never your credentials"
- Each thread's HITL checkpoint lives server-side in Redis under its `sessionId` (per ADR-008); resuming a HITL on a thread reuses that `sessionId` (no cross-thread leakage). Checkpoints are TTL-evicted — if a thread's checkpoint has expired, the next message on that thread starts a fresh turn instead of resuming
- The thread list is for conversations only — there are no "mode" entries; intent routing is invisible to the user

---

## 4. Agent Backend (`@hexpert/agent`)

### 4.1 Project Setup
- Scaffold Express server inside `apps/agent/` with TypeScript — DONE
- Install `express`, `tsx`, `typescript`, `@types/express`, `@types/node` — DONE (the AWS Lambda Web Adapter replaces `serverless-http` — ADR-011)
- Install `@langchain/core`, `@langchain/langgraph`, `@langchain/openai`, `@langchain/anthropic`, `@langchain/ollama` — DONE
- Install `@langchain/langgraph-checkpoint-redis` — the durable TTL-evicted checkpointer for HITL state (per ADR-008) — DONE
- Install `@hexpert/shared` as a workspace dependency — DONE
- Create `src/index.ts` that starts the Express server (`app.listen` on `PORT`) — runs locally via tsx and on Lambda via the AWS Lambda Web Adapter, which fronts the HTTP server and streams Function URL events through (no `serverless-http` handler — ADR-011) — DONE
- Add `dev` script using `tsx watch src/index.ts` — DONE
- Add `build` script compiling TypeScript to `dist/` — DONE
- Create `.env.example` with `ETHERSCAN_API_KEY`, `ALLOWED_ORIGIN`, `REDIS_URL`, `REDIS_TTL_MINUTES` (plus `LOCAL_DEV_API_KEY` / `LOCAL_DEV_SEARCH_KEY` — see §4.3) — DONE

### 4.2 Express Setup
- Register single route: `POST /api/chat` — DONE
- Register `GET /health` returning `{ status: 'ok' }` — DONE
- Add `express.json({ limit: '3mb' })` middleware globally (raised from 50kb per ADR-007; per-field caps enforced in the chat handler) — DONE
- Lock CORS to `ALLOWED_ORIGIN` environment variable only — DONE
- Apply `extractHeaders` middleware to `/api/chat` before the handler — DONE
- Instantiate a single `RedisSaver` checkpointer from `REDIS_URL` with `TTLConfig { defaultTTL: Number(process.env.REDIS_TTL_MINUTES ?? 60), refreshOnRead: true }` (per ADR-008); shared across all graph invocations. Initialised lazily on first use (guarded by `REDIS_URL` presence) so the server boots without Redis; Lambda holds no checkpoint state between requests — DONE

### 4.3 API Key Middleware
- Create `src/middleware/extractHeaders.ts` — DONE
- Extract and validate the following headers from every incoming `/api/chat` request:
    - `X-Api-Key` — validate format is non-empty string
    - `X-Provider` — validate value is one of `openai`, `anthropic`, `openrouter`, `ollama`
    - `X-Model` — validate is non-empty string
    - `X-Search-Key` — OPTIONAL. When present, validate it is prefixed with `tvly-`; when absent, attach an empty string. Enables the `web_search` tool for the QnA intent; when omitted, QnA runs keyless via the `fetch_eip` / `decode_4byte` tools + the prompt-injected knowledge pack (see §4.6). Wallet/audit never used it.
- Return 401 if any REQUIRED header is missing or fails validation
- Attach all four values to `res.locals`: `apiKey`, `provider`, `model`, `searchKey` (empty string when no Tavily key is supplied)
- Never log any of these values anywhere in the codebase
- **Local-dev fallback (off-Lambda only):** when not running on Lambda (`!process.env.AWS_LAMBDA_FUNCTION_NAME`), a missing `X-Api-Key` / `X-Search-Key` falls back to `LOCAL_DEV_API_KEY` / `LOCAL_DEV_SEARCH_KEY` from `.env`, so the pipeline can be smoke-tested with curl without pasting keys into every request. Headers take precedence. On Lambda the fallback is dead code and the BYOK headers are required exactly as above — these env vars must NEVER be set in the Lambda environment (they are local-dev-only; `.env` is gitignored and not packaged for deploy)

### 4.4 Tool Definitions
- Create `src/tools/` directory — DONE
- Create `src/tools/etherscan.ts` — fetches transaction list and token holdings for a wallet address via Etherscan API V2 (`api.etherscan.io/v2/api?chainid=1`; V1 is deprecated) — DONE (`fetchTransactions` and `fetchTokenHoldings` return compact summaries capped at `offset=1000`; `etherscanGet` throws on real errors rather than silently returning `[]`; reverse-ENS `fetchEnsName` delegates to `src/tools/ens.ts` which resolves via viem + a public Ethereum RPC. Also exports raw helpers `getTokenTransfers`/`summarizeTokenTransfers`/`distinctTokenContracts` so the wallet subgraph reuses one Etherscan call for both the token summary and the USD-portfolio balance lookup — see §4.7)
- Create `src/tools/ens.ts` — forward (`resolveEnsAddress`) and reverse (`resolveEnsName`) ENS resolution via viem v2 against a public Ethereum RPC (env `ETH_RPC_URL`, default `https://ethereum.publicnode.com`); no API key, no cost; best-effort, returns null if unresolved. Also exports `getPublicClient()` for shared keyless on-chain reads (balances, multicall) — DONE
- Create `src/tools/portfolio.ts` — keyless USD portfolio: one viem multicall `balanceOf` over the wallet's distinct ERC-20 contracts + native `eth_getBalance`, priced via one batched `coins.llama.fi/prices/current` call (returns decimals+symbol+price per coin; native ETH via `coingecko:ethereum`). `fetchUsdPortfolio(address, tokenContracts)` → `{ totalUsd, holdings, summary }`. Graceful zero on failure. No API key — DONE (W1)
- Create `src/tools/snapshot.ts` — keyless off-chain governance: `fetchSnapshotActivity(address)` queries `hub.snapshot.org/graphql` (voter-scoped) for recent votes + proposals + spaces. Fed into the governance deep-dive. No API key — DONE (W2)
- Create `src/tools/blockscout.ts` — keyless NFT data: `fetchNftActivity(address)` queries `eth.blockscout.com/api/v2/addresses/{addr}/token-transfers?type=ERC-721` (v2 REST; the Etherscan-compat `tokennfttx` action is not supported). Fed into the NFT deep-dive. No API key — DONE (W3)
- Create `src/tools/contractFetcher.ts` — fetches verified contract source from Etherscan given a contract address — DONE
- Create `src/tools/etherscanRateLimit.ts` — `etherscanFetch(url)` gates all Etherscan `fetch`es to ≤3 calls/sec (free-tier ceiling) via a process-wide sliding 1s window, shared by `etherscan.ts` + `contractFetcher.ts`; a warm Lambda or local dev overlapping turns on one `ETHERSCAN_API_KEY` would otherwise 429. Bump `MAX_CALLS` for a paid key — DONE
- `src/tools/webSearch.ts` — instantiated per-request using `res.locals.searchKey` as the Tavily API key; restricts search to Ethereum documentation domains: `ethereum.org`, `eips.ethereum.org`, `docs.soliditylang.org`, `docs.ethers.org`, `hardhat.org`, `book.getfoundry.sh`, `docs.openzeppelin.com`, `viem.sh` — DONE
- Create `src/tools/fileReader.ts` — accepts raw Solidity file content string and returns it for LLM consumption — DONE
- Create `src/tools/fetchEip.ts` — keyless tool fetching an EIP/ERC's canonical markdown by number from `raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-<n>.md`; caps at 12000 chars. Bound into the QnA ReAct loop — DONE
- Create `src/tools/decode4byte.ts` — keyless tool decoding a 4-byte function selector via `4byte.directory/api/v1/signatures?hex_signature=0x...`; returns all candidate `text_signature` matches (selectors can collide). Bound into the QnA ReAct loop — DONE
- Export all tools from `src/tools/index.ts` — DONE

### 4.5 Prompt Injection Guard
- Create `src/utils/sanitise.ts` — DONE
- Implement `wrapUserContent(content: string): string` that wraps all user-supplied content in delimiter tags before it enters any prompt — DONE
- All prompt templates must instruct the LLM to treat content within delimiter tags as data only, not instructions — DONE

### 4.5b LLM Client Factory
- Create `src/utils/llmFactory.ts` — DONE
- Export `createLLM({ provider, apiKey, model })` returning the correct LangChain chat-model client based on `provider`: — DONE
  - `openai` → `ChatOpenAI` — DONE
  - `openrouter` → `ChatOpenAI` with OpenAI-compatible baseURL (`https://openrouter.ai/api/v1`) — DONE
  - `anthropic` → `ChatAnthropic` — DONE
  - `ollama` → `ChatOllama` configured for the Ollama Cloud remote API (`baseURL: 'https://ollama.com'`, Bearer token in `Authorization` header) — DONE
- Reads `provider`, `apiKey`, and `model` from `res.locals`; clients are created per-request, never at module level — DONE
- Never persist or log `apiKey` — DONE

### 4.6 QnA Subgraph (LangChain)
- Create `src/chains/qnaChain.ts` — DONE
- Accept `{ provider, apiKey, model, searchKey }` as parameters — instantiate the LLM client via `createLLM` (§4.5b) inside the function, never at module level. The keyless tools `fetch_eip` (§4.4) and `decode_4byte` (§4.4) are always bound; `webSearch` (§4.4) is bound ONLY when `searchKey` is non-empty, so the localhost path runs fully keyless — DONE
- Implement as a bounded ReAct loop (max 5 iterations) over the LLM with the bound tools — dispatch each tool call by name via a `name → tool` map (not a hardcoded `webSearch` reference), `invoke` → push `ToolMessage` results → repeat until a no-tool response or the iteration cap. (A manual loop rather than `AgentExecutor`, so LLM `.invoke()` token events surface through the outer graph's `streamEvents`.) — DONE
- System prompt instructs the model to answer Ethereum-related questions only and cite sources. It is enriched with: (Q1) a curated canonical Ethereum/Solidity knowledge block covering the 8 allowlisted doc domains, and (Q4) a lazily-fetched DefiLlama free-API reference (`api-docs.defillama.com/llms-free.txt`, no auth, with a hardcoded fallback). Tool-use guidance steers the model to `fetch_eip` for EIP/ERC-by-number questions, `decode_4byte` for selector/calldata questions, and `web_search` only for current docs it doesn't already know — DONE
- Wrap user message with `wrapUserContent` before inserting into prompt — DONE
- Accept conversation history as input for multi-turn context — DONE
- Return response as a string — DONE

### 4.7 Wallet Subgraph (LangGraph) — DONE (live-confirmed 2026-06-26; W1/W2/W3 keyless data 2026-06-28)
- Create `src/graphs/walletGraph.ts`
- Accept `{ provider, apiKey, model }` as parameters — instantiate the LLM client via `createLLM` (§4.5b) inside the function, never at module level
- Define graph state extending `GraphState`: adds fields for `ensResult`, `transactionsResult`, `tokensResult`, `usdResult`, `walletUsd`, `deepDiveSelection`
- Define nodes:
  - `fetchParallel` — runs ENS reverse-resolve + `fetchTransactions` + raw ERC-20 transfer fetch (`getTokenTransfers`) in parallel; then computes a keyless **USD portfolio** (`fetchUsdPortfolio` in `src/tools/portfolio.ts`: one viem multicall `balanceOf` over the distinct token contracts + native `eth_getBalance`, priced via one batched `coins.llama.fi/prices/current` call — no API key). Stores `tokensResult` (summary), `usdResult` (prompt string), `walletUsd` (structured). Graceful: zero portfolio on any failure.
  - `initialSynthesis` — LLM node that reads parallel fetch results (incl. USD portfolio) and produces an initial `WalletProfile` (now with optional deterministic `totalUsd` + `topHoldingsUsd`) plus a HITL prompt asking the user to choose a deep-dive direction (DeFi positions / NFT activity / Governance / Full summary)
  - `hitlCheckpoint` — sets `awaitingHITL: true` and `hitlPrompt` on state, suspends graph execution, returns HITL message to caller
  - `deepDiveDispatch` — reads user's reply, determines which deep-dive nodes to run, dispatches them in parallel if multiple selected
  - `deepDiveDefi` — LLM node using `contractFetcher` tool to analyse DeFi protocol interactions
  - `deepDiveNft` — LLM node fed **real ERC-721 NFT transfer data** from Blockscout (`fetchNftActivity` in `src/tools/blockscout.ts`, keyless v2 REST `type=ERC-721`); analyses collection-level activity (the v2 list view does not expose per-token `token_id`)
  - `deepDiveGovernance` — LLM node fed **real off-chain governance data** from Snapshot (`fetchSnapshotActivity` in `src/tools/snapshot.ts`, keyless GraphQL `hub.snapshot.org/graphql`, voter-scoped); falls back to on-chain inference only when Snapshot is empty
  - `finalSynthesis` — LLM node that combines initial profile with deep-dive results into a final response
- Define edges:
  - Start → `fetchParallel` → `initialSynthesis` → `hitlCheckpoint` → (suspended, awaits user reply)
  - On resume → `deepDiveDispatch` → selected deep-dive nodes (parallel) → `finalSynthesis` → End
- At the HITL suspension, the checkpointer (Redis, TTL-evicted, keyed by `thread_id = sessionId` per ADR-008) persists the graph state; Lambda holds no state between requests — the client does not send a serialized checkpoint, resume is keyed by `sessionId`

### 4.8 Audit Subgraph (LangGraph) — DONE
- Create `src/graphs/auditGraph.ts` (+ `auditSchema.ts` for the findings zod schema + `AUDIT_FOLLOWUP_OPTIONS` constants) — DONE
- Accept `{ provider, apiKey, model }` as parameters — instantiate the LLM client via `createLLM` (§4.5b) inside the factory, never at module level — DONE
- Define graph state (`AuditStateAnnotation`) extending `GraphState`: adds a single flat `findings: AuditFinding[]` field (per ADR-006 — the five categories live **only in the zod tool schema** in `auditSchema.ts`, not as separate state channels), plus `overallRisk`, `auditSummary`, `contractName`, `followUpSelection`, `fixOutput`, `exploitOutput` — DONE
- Define nodes:
  - `readContract` — passes file content through `readSolidity` (passthrough), confirms content is present for the analyser prompt — DONE
  - `analyseContract` — single LLM node that produces all five finding categories (reentrancy, access control, integer overflow, unchecked external calls, hardcoded addresses/keys) in one call. Structured output is done via **tool-calling + zod validation**: the model is forced to call a `record_audit_findings` tool, the node intercepts the args and `safeParse`s them — NOT native `format`/json_schema. This is uniform across all four providers including Ollama Cloud, which has no structured-output mode but does support tool calling (ADR-009). Bounded retry (max 2) on miss/parse-failure — DONE
  - `hitlCheckpoint` — `interrupt()` presenting the follow-up options (`Generate a fix` / `Show an exploit scenario` / `Full report only` — the exact strings in `AUDIT_FOLLOWUP_OPTIONS`, which are also the conditional-edge keys and the resume message the client must send) — DONE
  - `generateFix` — LLM node that produces remediation code for each finding — DONE
  - `generateExploit` — LLM node that produces a plain-English exploit walkthrough for high severity findings — DONE
  - `finalReport` — deterministic (non-LLM) assembly node that builds the final `AuditReport` from `findings`/`overallRisk`/`summary`/`contractName` plus any `fixOutput`/`exploitOutput`, and pushes the rendered report as the assistant message — DONE
- Define edges:
  - Start → `readContract` → `analyseContract` → `hitlCheckpoint` → (suspended, awaits user reply)
  - On resume → conditional on `followUpSelection`: `generateFix` / `generateExploit` / (report only) → `finalReport` → End
- Integration: the subgraph is compiled **without its own checkpointer** and nested as the `audit` node in `mainGraph` (ADR-010); its `interrupt()` bubbles up to mainGraph's `RedisSaver`. An optional `checkpointer` param lets evals run it standalone later — DONE
- At the HITL suspension, the checkpointer (Redis, TTL-evicted, keyed by `thread_id = sessionId` per ADR-008) persists the graph state; Lambda holds no state between requests — the client does not send a serialized checkpoint, resume is keyed by `sessionId`

### 4.9 Main Graph (Router)
- Create `src/graphs/mainGraph.ts` — DONE
- This is the single entry point for all agent invocations
- Define graph state as `GraphState` from `@hexpert/shared` (mirrored into a LangGraph `Annotation` in `src/graphs/state.ts`) — DONE
- Define nodes:
  - `router` — hybrid intent classifier: a deterministic pre-pass sets `intent` to `audit` if `fileContent` is present, `wallet` if the user message contains an Ethereum address (`0x…`) or ENS name, otherwise `qna`. If the message is ambiguous, only then invoke a lightweight LLM tie-breaker to pick the final intent — DONE (deterministic pre-pass + always-on LLM tie-breaker that overrides only on disagreement, with fallback to the pre-pass on failure; see `mainGraph.ts` `classifyIntent`/`llmTieBreak`)
  - `qnaNode` — invokes `qnaChain` and returns response — DONE
  - `walletNode` — invokes the nested `walletGraph` and returns response or HITL suspension — DONE (Step 6)
  - `auditNode` — invokes the nested `auditGraph` and returns response or HITL suspension — DONE (Step 6+)
- Define edges:
  - Start → `router`
  - `router` → conditional edge: if `intent === 'qna'` → `qnaNode`, if `intent === 'wallet'` → `walletNode`, if `intent === 'audit'` → `auditNode` — DONE
  - All terminal nodes → End
- On resume after HITL, skip `router` — resume the suspended subgraph directly via `Command({ resume })` keyed by `sessionId` (per ADR-008 the checkpoint lives server-side in Redis; the client does not send a serialized `checkpointState`)

### 4.10 Chat Route Handler
- Create `src/routes/chat.ts` — DONE
- Accept `ChatRequest` body: `{ message, sessionId, fileContent?, fileName? }` — DONE
- Read `res.locals` (`apiKey`, `provider`, `model`, `searchKey`) — DONE
- The graph is always invoked with `{ configurable: { thread_id: sessionId } }` against a `RedisSaver` checkpointer (per ADR-008) — DONE
- If the session has a suspended checkpoint in Redis for this `thread_id` (i.e. `getState(config).next` is non-empty): resume the suspended subgraph directly via `Command({ resume: message })` — skip the router node; the user message becomes the HITL response — DONE
- Otherwise (new turn): invoke `mainGraph` with the message and session context — DONE
- Stream the response as SSE (`text/event-stream`): frames `{"type":"token","text":…}` (from `on_chat_model_stream`), `{"type":"tool","name":…}` (from `on_tool_start`), `{"type":"hitl","question":…,"options":[…]}` (emitted when the graph suspends at an interrupt — extracted from `getState().tasks[].interrupts[].value`; tells the client what follow-up option text to send back as the resume message), `{"type":"report","auditReport":AuditReport}` (emitted when `finalReport` produced one — it is deterministic, so it is never streamed as tokens), a terminal `{"type":"meta","meta":MessageMeta}`, then `data: [DONE]`. No `checkpointState` is returned — the checkpoint lives in Redis, keyed by `sessionId`, TTL-evicted — DONE (R8)
- Aggregate token usage from `on_chat_model_end` `usage_metadata` into `MessageMeta.tokensUsed`; `estimatedCostUsd` is `0` until the §6 cost-formula discussion lands — DONE
- If the user's resume references an expired/missing checkpoint (TTL lapsed), treat as a new turn and invoke `mainGraph` from the router — DONE
- Abort the upstream LLM stream if the client disconnects mid-response (`res.on("close")` while not `writableEnded`) — DONE
- Emit a consistent SSE error frame `{"type":"error",…}` + `[DONE]` on failure — DONE
- Never log request body or headers — DONE

---

## 5. Evals (`/evals`)

> **Status (2026-06-28):** All four real-LLM evals are built —
> `evals/router.eval.ts`, `evals/audit.eval.ts`, `evals/qna.eval.ts`,
> `evals/wallet.eval.ts`, plus shared `evals/lib/run.ts`. Run on-demand with the
> user's keys via `npm run eval:*` (see `evals/README.md`). Type-checked under
> strict mode. **Not yet execution-verified** — that needs the user's `EVAL_*`
> keys + `REDIS_URL` (+ `ETHERSCAN_API_KEY` for wallet) and a green `npm run eval`.
> **Deviation from 5.1:** no separate `evals/package.json` / `evals/tsconfig.json`
> — running via the root `tsx` (already a root devDep) is simpler and sufficient.
> **Deferred to a future PRD entry:** the offline CI commit-gate layer (real graph
> plumbing with a mocked LLM, no keys, runs on every push) and frontend tests.
> The existing `apps/agent/test/flow/qna.test.ts` covers the plumbing-regression
> role ad hoc until the CI layer is built.

### 5.1 Setup
- Create `evals/package.json` with `tsx`, `@langchain/core`, `@langchain/langgraph` as dependencies
- Create `evals/tsconfig.json`
- Read API key from `.env` file in evals directory — never hardcoded

> **DONE (deviated):** no separate `evals/package.json` / `evals/tsconfig.json` —
> the evals run via the root `tsx` devDep and read `.env` through `evals/lib/run.ts`.

### 5.2 QnA Eval
- Create `evals/qna.eval.ts`
- Define dataset of 5 Ethereum Q&A pairs (question + expected answer keywords)
- Run each through `qnaChain`
- Score: pass if all expected keywords present in response
- Print summary: total, passed, failed, pass rate

> **DONE (2026-06-28):** `evals/qna.eval.ts` built. **Deviation:** QnA output is
> prose with no zod-validated field, so scoring is deterministic keywords **plus
> an LLM-as-judge** (configurable `EVAL_JUDGE_*`, default `EVAL_MODEL`) scoring
> the streamed answer vs. a per-case rubric — not keywords alone. Runs through
> `/api/chat` (full path), not `qnaChain` directly. The 5 fixtures double as R7's
> curated demo questions. See `evals/README.md` and `docs/infra/risks.md` R7.

### 5.3 Wallet Eval
- Create `evals/wallet.eval.ts`
- Define 2 known wallet addresses with known characteristics
- Run each through `walletGraph` up to and including the HITL checkpoint — automatically supply a fixed HITL response to continue
- Score: pass if final `WalletProfile` contains non-empty ENS, transactionCount, and summary
- Print summary

> **DONE (2026-06-28):** `evals/wallet.eval.ts` built — 3 cases (0x address, ENS
> name, deep-dive-DeFi), 2-turn HITL via `/api/chat` (turn 2 supplies the option
> string). `chat.ts` now surfaces a `walletProfile` SSE frame (R10 F1), so
> `WalletProfile` fields are available for scoring; the eval still scores on
> emitted SSE structure — `intent=wallet`, `hitl` suspend on turn 1, non-empty
> streamed answer on turn 2, and a "defi" content check on the deep-dive case
> (fan-out signal). See `evals/README.md`.

### 5.4 Audit Eval — DONE (2026-06-27)
- Create `evals/audit.eval.ts`
- Include 2 sample `.sol` file contents — one with known vulnerabilities, one clean
- Run each through `auditGraph` up to and including the HITL checkpoint — automatically supply a fixed HITL response to continue
- Score: pass if vulnerable contract produces at least one high/medium finding, clean contract produces none
- Print summary

### 5.5 Router Eval (added 2026-06-27) — DONE (2026-06-27)
- `evals/router.eval.ts` — grades the intent classifier (hybrid pre-pass + always-on LLM tie-breaker, ADR-005)
- Dataset of `(message, fileContent?, expectedIntent)` including the two ambiguity classes the tie-breaker exists to catch: an address inside a question (→ wallet), and Solidity pasted as text with no file (→ audit, pre-pass says qna, LLM must override)
- Score: pass if the meta frame `intent` matches the expected intent (and no error frame, [DONE] present)
- Run via `/api/chat` (real LLM), not `qnaChain` directly, so the full router path is exercised

---

## 6. Client-Side Storage Schema and Analytics Convention

> **Partially resolved (2026-06-28).** IndexedDB persistence and the analytics
> display are now decided (and the frontend baseline is built — see
> `docs/features/frontend.md`); only the per-provider cost-estimation formula
> remains open. Decisions recorded here and in `docs/infra/risks.md` R10.

- ~~Exact IndexedDB schema — object store structure, indexes, versioning strategy~~ — **DONE (2026-06-28, R10 F3):** a single `sessions` object store keyed by `sessionId`, value = the thread's full `UiMessage[]` (+ thread metadata); write the full message (incl. `meta`) on every assistant response; load a thread's messages on init/switch; API keys stay in `sessionStorage` (never unified with threads). Implemented in `apps/web/lib/idb.ts` + wired into `chatStore` (hydrate on `init`, persist on `sendMessage` `finally`, delete on `deleteThread`).
- ~~Full definition of what Lambda returns per request beyond the chat message~~ — **DONE:** `MessageMeta` is defined in §2 and emitted as the terminal `meta` SSE frame (token counts, latency, tool-call count, subgraph id).
- ~~How analytics are displayed in the UI~~ — **DECIDED (2026-06-28):** a minimal inline per-assistant-message meta footer (tokens used, latency, tool-call count). A richer summary panel / per-node breakdown is not built; revisit if the talk wants it.
- Cost estimation formula per provider (pricing varies — OpenAI, Anthropic, OpenRouter, Ollama Cloud all have different token pricing) — **STILL OPEN.** `estimatedCostUsd` is `0` until this lands; the UI shows token counts instead.
- ~~Whether historical sessions are listable/navigable in the UI~~ — DECIDED (2026-06-25): yes, via the thread sidebar (§3.5)
- ~~Data retention — whether IndexedDB is cleared on session end or persists~~ — DECIDED (2026-06-25): threads persist across tab/browser close; API keys do not (§3.2, §3.5)

**Only cost tracking (the per-provider `estimatedCostUsd` formula) remains gated.** IndexedDB persistence and the analytics display are implemented.

---

## 7. AWS Lambda Deployment

### 7.1 Lambda Config
- Create `infrastructure/template.yaml` (SAM) defining the function: runtime `nodejs20.x`, handler `run.sh`, memory 512MB, timeout 60 seconds (wallet turn-2 on a whale runs ~40s; 30s would cut it off — ADR-011)
- Attach the AWS Lambda Web Adapter layer (`LambdaAdapterLayerX86`) and set `AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap`, `AWS_LWA_INVOKE_MODE=response_stream`, `PORT=8000` (ADR-011)
- Enable a Lambda Function URL with HTTPS enforced, `InvokeMode: RESPONSE_STREAM`, and `AuthType: AWS_IAM` (ADR-012) — the URL is NOT public; only an AWS principal with `lambda:InvokeFunctionUrl` may invoke. No `Principal: "*"` resource-based policy
- Create a dedicated IAM user `hexpert-vercel` with an access key, grant it `lambda:InvokeFunctionUrl` on this function, and store its keys as Vercel env vars (`LAMBDA_IAM_ACCESS_KEY_ID` / `LAMBDA_IAM_SECRET_ACCESS_KEY`) so the Next.js API route can SigV4-sign each call (frontend-phase — see §3.4). Do NOT use root credentials for deploys (audit S9): create a separate deploy IAM profile
- Disable CloudWatch logging of request headers in Lambda execution role policy
- Document all required environment variables in `infrastructure/README.md`

### 7.2 Build
- Add `build:lambda` script to `@hexpert/agent` compiling TypeScript to `dist/` and staging `run.sh + dist/ + production node_modules/` into `apps/agent/lambda-pkg/` (plus a `dist-lambda.zip`) via `scripts/pack-lambda.sh`
- Package with the AWS Lambda Web Adapter (zip + layer); the Express app runs as a plain HTTP server (`app.listen` on `PORT`) and the adapter streams Function URL events through — no `serverless-http` (ADR-011)

---

## 8. Environment Variables Reference

| Variable | Where | Exposed to browser? | Purpose |
|---|---|---|---|
| `LAMBDA_URL` | Vercel (server) | No | Lambda Function URL — never in client bundle |
| `LAMBDA_IAM_ACCESS_KEY_ID` | Vercel (server) | No | Access key ID for the `hexpert-vercel` IAM user — used to SigV4-sign the Lambda Function URL call (ADR-012) |
| `LAMBDA_IAM_SECRET_ACCESS_KEY` | Vercel (server) | No | Secret access key for the `hexpert-vercel` IAM user — never in client bundle |
| `ETHERSCAN_API_KEY` | Lambda env | No | Wallet and contract data |
| `ALLOWED_ORIGIN` | Lambda env | No | CORS origin — the frontend domain (default `https://hexpert.ritvij.dev`). Browser→Lambda is moot under the Vercel gateway, but correct config (ADR-012) |
| `REDIS_URL` | Lambda env | No | Upstash (or local) Redis URL for the HITL checkpointer (per ADR-008) |
| `REDIS_TTL_MINUTES` | Lambda env | No | Checkpoint TTL in minutes (default 60); abandoned HITL checkpoints auto-expire |
| `AWS_LWA_INVOKE_MODE` | Lambda env | No | AWS Lambda Web Adapter invoke mode — `response_stream` enables SSE streaming (ADR-011) |
| `PORT` | Lambda env | No | Port the Express server listens on; the Web Adapter forwards Function URL events here (default 8000) |
| `hexpert_api_key` | Browser sessionStorage | Tab only | User-supplied LLM key — cleared on tab close |
| `hexpert_provider` | Browser sessionStorage | Tab only | Selected LLM provider |
| `hexpert_model` | Browser sessionStorage | Tab only | Selected model name |
| `hexpert_search_key` | Browser sessionStorage | Tab only | Tavily API key — cleared on tab close |

---

## 9. Security Checklist

| Measure | Where implemented |
|---|---|
| HTTPS enforced | Lambda Function URL (AWS managed cert) + Vercel (automatic) |
| Lambda URL never exposed to browser | Vercel server-side env var only |
| Function URL not public (IAM-auth) | `AuthType: AWS_IAM` on the Function URL — no `Principal: "*"`; only the `hexpert-vercel` IAM principal can invoke (ADR-012). Anonymous calls rejected at the AWS layer before the Lambda runs (also bounds cost abuse) |
| No server-side conversation persistence | Lambda is fully stateless — no database for messages, no session store, no file writes. The only server-side state is the short-lived HITL checkpoint in TTL-evicted Redis (per ADR-008), which holds graph state only, never messages or credentials |
| HITL checkpoint TTL-evicted | Redis checkpoints auto-expire (`REDIS_TTL_MINUTES`, default 60); abandoned checkpoints self-clean, no unbounded growth |
| API keys cleared on tab close | sessionStorage only, never localStorage |
| Conversations persist; credentials do not | Threads in IndexedDB persist across tab close; API keys in sessionStorage cleared on tab close — the two stores are never unified |
| API keys format validated | Next.js API route + Lambda middleware (double validation) |
| LLM client instantiated per-request | Inside route handler using `res.locals.apiKey` |
| Prompt injection guarded | `wrapUserContent` applied to all user-supplied content |
| Payload size limited | `express.json({ limit: '3mb' })` on Lambda + per-field caps enforced in chat handler + Content-Length pre-check on Next.js route (per ADR-007) |
| File size and type validated client-side | `.sol` extension + 64KB limit before upload (per ADR-007) |
| CORS locked to frontend origin | `ALLOWED_ORIGIN` env var on Lambda (default `https://hexpert.ritvij.dev`) |
| No header or body logging | Explicit exclusion across all route handlers and middleware |

---

## 10. Key Teaching Points (for the talk)

- The agent loop: perception → memory → planning → action
- LangChain LCEL for simple linear chains vs LangGraph for stateful, branching, resumable workflows
- The router node as the decision-making layer — the agent classifies intent before acting
- Parallel node execution in LangGraph — multiple tool calls or checks running simultaneously
- Human-in-the-loop checkpointing — graph suspends mid-execution, waits for real user input, resumes
- Harness engineering in practice: tool definitions, client side memory, HITL, orchestration
- BYOK as an architectural pattern — users own their keys, zero LLM cost to the operator
- Next.js API routes as a security gateway — Lambda URL never touches the browser
- Evals as a first-class concern built into the project from day one
