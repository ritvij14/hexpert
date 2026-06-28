# Intent Upgrades — Production-Readiness Backlog

> **Tracking doc for free-only upgrades to the 3 agent intents.**
> Source: fusion research run 2026-06-28 (3-model panel + judge verification).
> Part of: Hexpert — see CLAUDE.md for full project context. Extends `docs/features/agent-architecture.md`.
>
> **Hard constraint:** every item here must be FREE — no paid APIs, no spending money.
> "Free tier that still requires an API key" is treated as DISQUALIFIED unless a true
> no-key alternative does not exist. Keyless-ness is the bar, not just $0.

---

## How to use this doc

Work items one at a time. For each item, move it through the status lifecycle and
keep `Notes` updated with the decision/finding. When an item is promoted to actual
implementation, write a focused PRD in `docs/prds/<feature-name>.md` and link it
from the item's `Notes` column.

**Status values:** `proposed` → `analyzing` → `accepted` / `rejected` → `in-progress` → `done`

**Priority legend:** P1 = high impact × low complexity (do first) · P2 = high impact × medium complexity · P3 = nice-to-have / deferred

---

## Verified rulings (do not re-litigate)

These were contested in the panel and resolved by the judge. Treat as settled.

| Claim | Ruling | Why |
| --- | --- | --- |
| The Graph subgraphs are no-key | **FALSE** | Hosted Service shut down June 2024; every query URL now requires a Subgraph Studio API key (free 100K/mo) or x402 micropayments. Disqualifies all Graph-based NFT/DeFi-position proposals. |
| Alchemy NFT free tier qualifies | **DISQUALIFIED** | Free in dollars but needs a key. Blockscout is the true no-key alternative for NFT data. |
| DefiLlama prices are no-key | **TRUE** | Prices live at `coins.llama.fi/prices/current/{coins}` (NOT `api.llama.fi` — that host 404s on `/prices/current`; the `llms-free.txt` base URL is stale). Batchable as `ethereum:0x...`, returns `{decimals, symbol, price, timestamp, confidence}` per coin. Native ETH via `coingecko:ethereum`. Best primary USD source. |
| DexScreener is no-key | **TRUE** | `api.dexscreener.com`, 300 req/min, returns priceUsd + liquidity + volume + 24h change. Best secondary. |
| Snapshot GraphQL is no-key | **TRUE** | `hub.snapshot.org/graphql`, ~100 req/min, no auth. |
| Blockscout is a no-key Etherscan equivalent | **TRUE** | `eth.blockscout.com/api`, Etherscan-compatible txlist/tokentx/getsourcecode + ERC-721 transfers, 5 req/s, no key. |
| Aderyn ships a prebuilt binary | **TRUE** | Linux x86_64 + aarch64 binaries on GitHub releases. Easiest static-analysis path for a Node Lambda (no Python). |
| Free no-key general web search is reliable | **FALSE (but partially mitigated)** | DDG Lite HTML scraping is brittle and the DDG Instant Answer JSON API is effectively abandoned (verified 2026-06-28); Brave Search dropped its free tier Feb 2026. **However Jina `s.jina.ai/<query>` is a genuine no-key search endpoint** (anonymous works, rate-limited; ~100 RPM with a free key) — the strongest no-key fallback when a long tail still needs search. For Hexpert's QnA the common path no longer needs search at all (Q1/Q2/Q3), and Tavily is now optional BYOK, so this constraint is dissolved in practice. |
| Per-wallet cross-protocol DeFi positions, no-key | **DOES NOT EXIST** | Dune SIM shuts down Aug 1 2026 → Zerion needs a key. Only no-key path is direct RPC to per-protocol view functions (high complexity). |
| Mythril / Echidna / Medusa / Halmos in Lambda | **DISQUALIFIED for Lambda** | Free/open-source but symbolic execution + fuzzing are slow & stateful — wrong fit for stateless Lambda + 60s timeout. Document as "run locally" ceiling. |

---

## QnA intent (`apps/agent/src/chains/qnaChain.ts`, `apps/agent/src/tools/webSearch.ts`)

Weakness today: ~~depends on **Tavily (paid/key)** for search restricted to 8 fixed doc domains — the one place the free constraint is currently violated.~~
**RESOLVED 2026-06-28:** Tavily is now OPTIONAL BYOK (`extractHeaders.ts` no longer 401s without it). QnA runs keyless via the prompt-injected knowledge pack (Q1) + `fetch_eip` (Q2) + `decode_4byte` (Q3) tools; `web_search` binds only when a `tvly-` key is supplied. PRD §4.3/§4.4/§4.6 amended.

| ID | Title | Resource | File / node | No-key? | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q1 | Build-time knowledge packs from the 8 allowlisted domains | Cached markdown (ethereum.org, EIPs, Solidity, ethers, Hardhat, Foundry, OZ, viem) | QnA system prompt / small RAG corpus | yes | P1 | done | DONE 2026-06-28: implemented as a curated prompt-injected Ethereum/Solidity essence in `qnaChain.ts` SYSTEM_PROMPT (basic version — no build-time fetch/RAG, per user request for the localhost path). The "skill that teaches the AI" pattern. Full RAG corpus deferred. |
| Q2 | `fetchEip(number)` tool | `raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-XXXX.md` | new tool in ReAct loop | yes | P1 | done | DONE 2026-06-28: `src/tools/fetchEip.ts`, bound into the QnA ReAct loop. Caps at 12000 chars. |
| Q3 | `decode4byte(selector)` tool | `4byte.directory/api/v1/signatures/?hex_signature=0x...` | new tool in ReAct loop | yes | P1 | done | DONE 2026-06-28: `src/tools/decode4byte.ts`, bound into the QnA ReAct loop. Returns all candidate signatures (selectors can collide). |
| Q4 | DefiLlama `llms-free.txt` knowledge pack | `api-docs.defillama.com/llms-free.txt` | QnA system prompt (build-time fetch) | yes | P2 | done | DONE 2026-06-28: lazily fetched from `api-docs.defillama.com/llms-free.txt` (no auth) and appended to the QnA system prompt, with a trimmed hardcoded fallback if the fetch fails. Cached for the process lifetime. |
| Q5 | Tavily replacement fallback | DDG Lite (`lite.duckduckgo.com/lite/`) with `site:` operator | `webSearch.ts` last-resort branch | yes | P3 | rejected | REJECTED 2026-06-28: DDG Instant Answer JSON API is effectively abandoned (verified); HTML scraping is brittle. The common QnA path no longer needs search (Q1/Q2/Q3), and Tavily is now optional BYOK — so a free scraping fallback is unnecessary. If a no-key long-tail search is ever wanted, use Jina `s.jina.ai` (see amended ruling above), not DDG. |

---

## Wallet analyst intent (`apps/agent/src/graphs/walletGraph.ts`, `walletSchema.ts`)

Weakness today: ~~three deep-dives infer from ERC-20 transfers and explicitly flag uncertainty — no prices, no real DeFi positions, no NFT data, no governance data.~~
**Partially RESOLVED 2026-06-28 (W1/W2/W3 done):** real keyless USD portfolio (DefiLlama + multicall), real off-chain governance (Snapshot), real ERC-721 NFT transfers (Blockscout) are now fed into the synthesis + deep-dive prompts. Remaining inference gap: per-protocol **DeFi positions** (W8, still deferred — no free no-key API).

| ID | Title | Resource | File / node | No-key? | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| W1 | DefiLlama USD prices | `coins.llama.fi/prices/current/{coins}` (batchable; decimals+symbol included) | `fetchParallel` + `WalletProfile` (add `totalUsd`, `topHoldingsUsd`) | yes | P1 | done | DONE 2026-06-28: `src/tools/portfolio.ts` — one viem multicall `balanceOf` over the wallet's distinct ERC-20 contracts (keyless, mainnet Multicall3) + native `eth_getBalance`, priced via one batched `coins.llama.fi` call (`coingecko:ethereum` for native ETH). `WalletProfile` gains optional `totalUsd` + `topHoldingsUsd` (deterministic, merged in `initialSynthesis`). `etherscan.ts` exposes `getTokenTransfers`/`summarizeTokenTransfers`/`distinctTokenContracts` so `fetchParallel` makes one Etherscan call, reused. Graceful: zero portfolio on any failure. NOTE: the prices host is `coins.llama.fi`, NOT `api.llama.fi` (which 404s on `/prices/current` — the llms-free.txt base URL is stale). |
| W2 | Snapshot GraphQL governance | `hub.snapshot.org/graphql` (`votes(where:{voter:...})` + proposals + spaces) | replace inference in `deepDiveGovernance` | yes | P1 | done | DONE 2026-06-28: `src/tools/snapshot.ts` `fetchSnapshotActivity(address)` — voter-scoped query only (unfiltered global queries 524-time-out on Cloudflare). `deepDiveGovernanceNode` feeds the real votes block into the prompt; `GOV_SYSTEM` now analyses real data and only falls back to on-chain inference when Snapshot is empty. Removes the "infer + flag uncertainty" caveat for off-chain governance. |
| W3 | Blockscout ERC-721 NFT data | `eth.blockscout.com/api/v2/addresses/{addr}/token-transfers?type=ERC-721` | replace inference in `deepDiveNft` | yes | P1 | done | DONE 2026-06-28: `src/tools/blockscout.ts` `fetchNftActivity(address)` — v2 REST (the Etherscan-compat `tokennfttx` action is NOT supported by Blockscout). `deepDiveNftNode` feeds real ERC-721 transfers (collections, direction, method, dates) into the prompt; `NFT_SYSTEM` analyses the real data. The v2 list view does not expose per-token `token_id`, so analysis is collection-level. Displaces Alchemy (needs key) and The Graph (needs key). |
| W4 | `decode4byte` in `initialSynthesis` | `4byte.directory` | `initialSynthesis` (decode `tx.input` selectors for top contracts) | yes | P2 | proposed | "called `deposit(address,uint256)` on Aave 47×" instead of "interacted with 0x7d27… 47×". Also sharpens `deepDiveDefi`. |
| W5 | On-chain Governor via public RPC | viem `getVotes` + `VoteCast` logs over free public RPC | `deepDiveGovernance` (alongside W2) | yes | P2 | proposed | Complements Snapshot for OpenZeppelin/Governor-style on-chain DAOs. Reuses existing viem + public RPC. |
| W6 | DefiLlama `/protocols` + `/yields` for protocol ID + yield context | `api.llama.fi/protocols`, `/yields` | `deepDiveDefi` / `initialSynthesis` | yes | P2 | proposed | "Aave v3 (Lending, $5.2B TVL, USDC pool ~X% APY)". |
| W7 | DexScreener liquidity context | `api.dexscreener.com/latest/dex/tokens/{addr}` | `deepDiveDefi` | yes | P2 | proposed | Tells the user if holdings are in liquid vs illiquid tokens. |
| W8 | Real DeFi positions via direct RPC to protocol view functions | Aave `UiPoolDataProvider.getUserReservesData`, Compound v3 `Comet.userBasic`, Uniswap v3 `NonfungiblePositionManager.positions(tokenId)` | new `fetchProtocolPositions` tool in `deepDiveDefi` | yes | P3 | proposed | HIGH complexity (per-protocol ABI, brittle). Only no-key path to real positions. Phase 2 after W1–W7. |
| W9 | Blockscout as Etherscan fallback (drop the key dependency) | `eth.blockscout.com/api` (Etherscan-compatible) | `etherscan.ts` + `contractFetcher.ts` | yes | P3 | proposed | Removes single-point-of-key-failure. Don't prioritize over higher-impact items; Etherscan free tier already works. |
| W10 | Multi-chain via public RPCs | Base/Arbitrum/Optimism free public RPCs | `fetchParallel` (loop chains) | yes | P3 | proposed | Closes "mainnet only". Medium complexity (per-chain rate limits). |

---

## Contract audit intent (`apps/agent/src/graphs/auditGraph.ts`, `auditSchema.ts`)

Weakness today: one LLM call guessing across 5 hardcoded categories with no mechanical ground truth.

| ID | Title | Resource | File / node | No-key? | Priority | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A1 | Aderyn static-analysis node | Prebuilt Aderyn Rust binary (Linux x86_64/aarch64) in Lambda package | new node between `readContract` and `analyseContract`; `child_process.execFile` | yes | P1 | proposed | **Biggest audit upgrade.** Single binary, no Python layer. Feed JSON findings into `ANALYST_SYSTEM`. |
| A2 | solc-js compilation pre-flight | npm `solc` (pure-JS Solidity compiler, no binary deps) | new `compileContract` node | yes | P1 | proposed | Catch syntax errors early; emit AST/ABI that enriches Aderyn + the LLM. None of the panel caught this — cleanest Lambda fit. |
| A3 | Wire existing `contractFetcher` into audit | Etherscan/Blockscout verified source | `auditGraph` + `mainGraph` routing (address without file → audit) | yes (free tier) | P1 | proposed | Submit an address instead of pasting source. Tool already exists, only wired to wallet deep-dive. |
| A4 | SWC registry + known-bug knowledge pack | Build-time JSON snapshot of SWC IDs + exploit patterns (ERC-777 reentrancy, read-only reentrancy, Vyper 2023 bug, flash-loan delegation, `transfer()` gas-stipend) | `ANALYST_SYSTEM` prompt | yes | P1 | proposed | Pure prompt injection, zero runtime cost. SWC unmaintained since ~2020 — cross-ref EEA EthTrust/SCSVS. |
| A5 | EIP-1967 / EIP-1822 proxy detection | `eth_getStorageAt` on free public RPC, impl slot `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` | new `detectProxy(address)` tool when auditing by address | yes | P2 | proposed | Detect proxy → fetch implementation → audit both. Closes the "no upgradeability analysis" gap. |
| A6 | OSV dependency-vuln check | `api.osv.dev/v1/query` (no key, no rate limit) | `analyseContract` or new dep-check node; add `dependencyVulnerabilities` to `auditFindingsSchema` | yes | P2 | proposed | Parse `@openzeppelin/contracts@x.y.z` from imports/pragma → query OSV. |
| A7 | Slither via Python Lambda layer | `slither-analyzer` + `solc-select` + solc binaries | same `runSlither` pattern as A1 | yes | P3 | proposed | 100 detectors vs Aderyn's smaller set. DEFERRED — heavier infra than Aderyn. Add only if A1 coverage is insufficient. |

---

## Disqualified (recorded so they don't get re-proposed)

| Item | Why disqualified | No-key alternative that replaces it |
| --- | --- | --- |
| NFT data via The Graph subgraphs | Needs Subgraph Studio key | W3 (Blockscout ERC-721) |
| NFT data via Alchemy free tier | Needs key | W3 (Blockscout ERC-721) |
| Per-wallet DeFi positions via Dune SIM | Shutting down Aug 1 2026; Zerion replacement needs key | W8 (direct RPC to protocol view functions) |
| Mythril / Echidna / Medusa / Halmos in Lambda | Too slow/stateful for stateless Lambda + 60s timeout | A1 (Aderyn) / A7 (Slither, deferred). Document these as "run locally" ceiling. |

---

## Open questions / caveats

- **Free no-key web search is genuinely fragile.** Pragmatic QnA move: lean on Q1/Q2/Q3 for common queries and keep Tavily as a small keyed fallback for the long tail, rather than making a free engine the primary path (Q5).
- **AGPLv3 / GPL-3.0 licensing** of Slither/Aderyn is fine for a hosted service; confirm before any redistribution or if the audit output is exposed via an API that could be considered "conveying." Flag in `docs/infra/risks.md` if it becomes a concern.
- **Lambda packaging** for A1 (Aderyn binary) and A2 (solc-js) needs a build/pack step update in `apps/agent/scripts/pack-lambda.sh` — track under the deploy runbook when accepted.