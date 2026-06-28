# Hexpert — Localhost Demo Runbook

> A scripted localhost demo for Hexpert: what to boot, what to click, and exactly
> what to type for each of the three intents (Q&A, Wallet, Audit). The prompts
> below are drawn from the real-LLM eval fixtures in `evals/` — the ones marked
> **eval-confirmed** are known to pass; the rest are classic patterns in the
> same shape.
>
> Status: 2026-06-28. Provider for this runbook: **Ollama** (`EVAL_MODEL=glm-5.2:cloud`,
> Ollama Cloud — see `docs/infra/risks.md` R1). Adjust the Settings drawer if you
> switch providers.

---

## 0. Before the demo (one-time)

1. **Env.** All keys live in `apps/agent/.env` (the eval runner and the agent both load it). Required for a full demo:
   - `REDIS_URL` — TTL-evicted HITL checkpointer (ADR-008). **Without it, audit/wallet HITL resume fails.**
   - `ETHERSCAN_API_KEY` — wallet subgraph (transactions + token holdings) and contract source fetch.
   - `ETH_RPC_URL` — ENS resolution (default `https://ethereum.publicnode.com` is fine).
   - `EVAL_SEARCH_KEY` — Tavily key (`tvly-…`); the Q&A subgraph's `web_search` is gated on it.
   - `LOCAL_DEV_API_KEY` / `LOCAL_DEV_SEARCH_KEY` — local-only BYOK fallback so you can demo from the UI without re-typing keys (off-Lambda only).
   - `ALLOWED_ORIGIN` — must match the web origin (`http://localhost:3000` for local).
2. **Install + boot** (two terminals, or one with `npm run dev`):
   ```bash
   npm install
   npm run dev          # web on :3000, agent on :3001 (concurrently)
   ```
   Confirm the agent is up: `curl http://localhost:3001/health` → `200`.
3. **BYOK in the UI.** Open the Settings drawer (top-right). Set:
   - Provider: **Ollama**
   - Model: `glm-5.2:cloud` (or your local model id)
   - API key: your Ollama Cloud key (or the `LOCAL_DEV_API_KEY` fallback covers it locally)
   - Tavily key: your `tvly-…` (or `LOCAL_DEV_SEARCH_KEY` covers it locally)
   Keys are stored in `sessionStorage` only — never persisted to IndexedDB.
4. Open `http://localhost:3000`. You should see the empty/onboarding chat state.

**Smoke order:** do **Q&A first** (fastest, single-turn, no HITL), then **Wallet** (HITL + real Etherscan), then **Audit** (HITL + `.sol` attach). This front-loads the reliable stuff and warms the agent.

---

## 1. Q&A — 5 vetted prompts

Q&A routes here when there's no `0x`/ENS and no attached file. The agent runs a bounded ReAct loop with `web_search` restricted to the Ethereum docs allowlist (`ethereum.org`, `eips.ethereum.org`, `docs.soliditylang.org`, `docs.ethers.org`, `hardhat.org`, `book.getfoundry.sh`, `docs.openzeppelin.com`, `viem.sh`). All five below are **eval-confirmed** (`evals/qna.eval.ts`) and chosen to hit that allowlist.

| # | Prompt (type verbatim) | Vetting | What you'll see |
|---|---|---|---|
| 1 | `What is Ethereum gas, and what unit is it priced in?` | eval-confirmed | Intent tag → Q&A; tool pill `running: web_search`; a `WebSearchActivity` card (query + surfed URLs); streamed prose answer mentioning gas/gwei |
| 2 | `Explain how require() works in Solidity.` | eval-confirmed | Q&A; answer covers require → revert + gas refund, distinct from assert/revert |
| 3 | `What is a reentrancy attack in Solidity and how do I prevent it?` | eval-confirmed | Q&A; answer explains external-call re-entry before state update + a mitigation (checks-effects-interactions / guard) |
| 4 | `What is EIP-4844 and why does it matter for L2 rollups?` | eval-confirmed | Q&A; **exercises the allowlist** (`eips.ethereum.org`); answer covers blob transactions lowering DA costs for rollups |
| 5 | `What is the capital of France?` | eval-confirmed | Q&A; the agent **politely declines** (off-scope) and offers Ethereum help — this is the guardrail demo, not a real answer |

**What you're showing:** streaming tokens, the `web_search` tool pill + activity card, and the off-scope guardrail (#5). No HITL on this intent.

---

## 2. Wallet — 5 vetted flows

Wallet routes here on any `0x…` address or ENS name. Turn 1 fetches on-chain data (Etherscan transactions + token holdings, ENS resolution) and synthesizes a structured `WalletProfile`, then **suspends at HITL**. You pick a deep-dive option; turn 2 resumes (keyed by `sessionId`, state in Redis) and streams the final answer.

All five use the **eval-confirmed** address `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` (vitalik.eth). The variety is in the HITL choice, which is the point of this demo.

**Turn-1 prompt (use any of these phrasings — they all route to wallet):**
- `Analyse the wallet 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045.`
- `Look up vitalik.eth and profile its on-chain activity.`
- `What's in vitalik.eth's wallet?`

**Then pick one of these HITL options (multi-select; the chips are the contract — exact strings):**

| # | Turn-1 phrasing | Resume option (click chip → Send) | Vetting | What you'll see |
|---|---|---|---|---|
| 1 | `0xd8dA…6045` address | **Full summary** | eval-confirmed (`wallet/0x-full-summary`) | Wallet-profile card (Tx Count / Top Contracts / Tokens Held grid + summary), then full streamed summary |
| 2 | `vitalik.eth` | **Full summary** | eval-confirmed (`wallet/ens-full-summary`) | Same; exercises ENS resolution |
| 3 | `0xd8dA…6045` address | **DeFi positions** | eval-confirmed (`wallet/deepdive-defi`); answer must mention "defi" | Deep-dive fan-out runs, final answer covers DeFi positions |
| 4 | `vitalik.eth` | **NFT activity** | address confirmed; resume path not yet eval-confirmed | Deep-dive fan-out, final answer covers NFT activity |
| 5 | `vitalik.eth` | **Governance** | address confirmed; resume path not yet eval-confirmed | Deep-dive fan-out, final answer covers governance |

**What you're showing:** the `walletProfile` card rendering from a structured frame (not just text), the HITL suspend/resume round-trip across two requests (state lives in Redis, ADR-008), and the parallel deep-dive fan-out (the conditional-edge parallelism lesson). Multi-select is supported — you can pick e.g. `DeFi positions` + `Governance` together.

**If turn 1 returns an error frame:** most often Etherscan free-tier rate limit or `REDIS_URL` not set. See Troubleshooting.

---

## 3. Audit — 5 vetted prompts

Audit routes here when a `.sol` file is attached (`fileContent` present → deterministic pre-pass, R4). Turn 1 runs `analyseContract` (one structured-output call → zod-validated findings) and **suspends at HITL**; pick **"Full report only"** to get the deterministic `report` frame rendered grouped by severity. (You can also pick "Generate a fix" or "Show an exploit scenario" — both then flow to `finalReport`.)

Attach the `.sol` file in the input (paperclip), type the prompt, Send. Below are the snippets to save as `.sol` files (or paste into a file and attach).

### #1 — Reentrancy (eval-confirmed, `audit/vuln-reentrancy`) → expect ≥1 high/medium finding
Save as `Vulnerable.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Vulnerable {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok);
        balances[msg.sender] = 0;
    }
}
```
Prompt: `Audit this contract for vulnerabilities.` → pick **Full report only**.

### #2 — Clean / safe (eval-confirmed, `audit/clean-safe`) → expect 0 high/medium findings
Save as `Safe.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Safe {
    mapping(address => uint256) public balances;
    function deposit() external payable { balances[msg.sender] += msg.value; }
    function withdraw() external {
        uint256 amount = balances[msg.sender];
        require(amount > 0, "nothing to withdraw");
        balances[msg.sender] = 0; // effect before interaction
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
```
Prompt: `Audit this contract for vulnerabilities.` → pick **Full report only**.

### #3 — Missing access control (classic; not yet eval-confirmed)
Save as `Mintable.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Mintable {
    mapping(address => uint256) public balances;
    function mint(address to, uint256 amount) public { balances[to] += amount; }
}
```
Expect a finding that `mint` is unprotected (anyone can mint).

### #4 — `tx.origin` authorization (classic; not yet eval-confirmed)
Save as `Auth.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Auth {
    address public owner;
    constructor() { owner = msg.sender; }
    function withdraw(address to) public {
        require(tx.origin == owner, "not owner");
        payable(to).transfer(address(this).balance);
    }
}
```
Expect a finding that `tx.origin` is spoofable via intermediate contracts.

### #5 — Unchecked low-level call return (classic; not yet eval-confirmed)
Save as `Forwarder.sol`:
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
contract Forwarder {
    function forward(address payable target) public payable {
        target.call{value: msg.value}(""); // return value ignored
    }
}
```
Expect a finding about the ignored `call` return value.

**Vetting note:** only #1 and #2 are eval-confirmed today. #3–#5 are textbook patterns the `analyseContract` structured-output node is designed to catch; if you want them vetted before the talk, add them as cases in `evals/audit.eval.ts` and run `npm run eval:audit` (task 4 in the build order).

**What you're showing:** the `.sol` attach → router pre-pass, the HITL choice, and the `report` frame rendered as severity-grouped cards (`AuditReportView`) — structured output, not prose.

---

## 4. Recovery lines for off-script asks

If the audience asks something the demo isn't built for, steer rather than improvise:

- **Non-Ethereum question** (e.g. "what's the capital of France?"): let it run — the agent declines by design (Q&A #5). Use it as the guardrail talking point.
- **A wallet the agent can't fetch** (random/empty address): "Let me use a known-active one — vitalik.eth." Switch to Wallet #1.
- **A contract too large to attach** (>64KB cap → 413): "Hexpexpert caps files at 64KB; let me use a trimmed example." Switch to Audit #1.
- **Niche Q&A that returns poor allowlist results** (e.g. a obscure L2): "That's outside the Ethereum-docs allowlist Hexpert searches. Try this instead —" then pivot to Q&A #1–#4.
- **Wrong intent tag** (e.g. pasted Solidity routed to Q&A): rephrase — "Please audit this contract:" — and attach it as a `.sol` file so the deterministic pre-pass forces Audit (R4). The router eval's `router/audit-solidity-as-text` case is the live demonstration of the LLM tie-breaker overriding the pre-pass for pasted-text Solidity.
- **HITL resume doesn't stream:** check the agent console for Redis errors — resume needs the `sessionId` to match turn 1 and Redis to be reachable.
- **Blank screen for >20s:** streaming is a hard requirement (ADR-004); a blank screen means the agent isn't up or CORS/origin is wrong. See Troubleshooting.

---

## 5. Troubleshooting (localhost)

| Symptom | Likely cause | Fix |
|---|---|---|
| Web loads but every turn 502s | Agent on :3001 down | `curl localhost:3001/health`; restart `npm -w @hexpert/agent run dev` |
| 504 (timeout) | Agent up but turn >55s | Ollama Cloud slow / cold; retry; or lower model complexity |
| 401 from agent | BYOK key missing/wrong | Re-open Settings; for local, `LOCAL_DEV_API_KEY`/`LOCAL_DEV_SEARCH_KEY` fallback covers it |
| CORS error in browser console | `ALLOWED_ORIGIN` ≠ `http://localhost:3000` | Set it in `apps/agent/.env`, restart agent |
| HITL chips appear but resume fails | `REDIS_URL` unset/unreachable | Set `REDIS_URL`; resume state is server-side (ADR-008) |
| Wallet turn-1 error frame | Etherscan rate limit / key | Wait, or swap the key; vitalik.eth is high-volume — expect occasional throttling |
| No `report`/`walletProfile` card | Stale build | `next build` + hard reload; the frames are in `lib/sse.ts` |
| Icons missing | On-demand fetch blocked (offline) | Fine online; see R10 F2 |
| Threads vanish on reload | IndexedDB blocked (private mode) | Falls back to in-memory; use a normal window |

---

## 6. What each SSE frame renders as (cheat sheet)

| Frame | UI element |
|---|---|
| `token` | streamed assistant text (markdown) |
| `tool` | muted tool-call pill (`running: <name>`) above the stream |
| `webSearch` | `WebSearchActivity` card (query count, surfed URL links, bytes) |
| `hitl` | `HITLChips` (wallet = multi-select, audit = single) + Send |
| `report` | `AuditReportView` (findings grouped high/medium/low/info + overall badge) |
| `walletProfile` | `WalletProfileView` (header + 3-stat grid + summary) |
| `meta` | intent tag finalized; footer (tokens/latency/tool-call count) |
| `error` | error state on the assistant bubble |
| `[DONE]` | streaming stops |

---

## 7. Vetting status summary

| Intent | Eval-confirmed prompts | Classic (not yet eval-confirmed) |
|---|---|---|
| Q&A | #1–#5 (all) | — |
| Wallet | #1, #2 (Full summary); #3 (DeFi, incl. "defi" content check) | #4 (NFT activity), #5 (Governance) resume paths |
| Audit | #1 (reentrancy), #2 (clean — `audit/clean-safe`) | #3 (access control), #4 (tx.origin), #5 (unchecked call) |

**Audit grader bug (found & fixed 2026-06-28 run):** the grader's `if (allFindings.length === 0)` branch conflated "zero findings" with "no report frame," so a truly clean contract could never pass — `audit/clean-safe` was reported `✗` as "no report frame produced" even though the trace showed turn 2 *did* emit `report: findings=0`. Fixed in `evals/audit.eval.ts`: track `sawReport` from the `report` frame explicitly, then grade on high/medium count. `audit: 2/2 passed` after the fix.

To harden the "classic" rows before a talk, add them as cases to the relevant `evals/*.eval.ts` and run `npm run eval:<intent>` (build-order task 4).