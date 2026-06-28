// Router eval — grades the intent classifier (hybrid pre-pass + always-on LLM
// tie-breaker, ADR-005) against the meta frame's `intent`. Real LLM, real
// tokens. See evals/README.md.
//
// Cases include clear-cut routing (pre-pass wins, LLM should agree) and the two
// ambiguity classes the tie-breaker exists to catch:
//   - an address embedded in a question  → wallet (pre-pass wins)
//   - Solidity pasted as text, no file      → audit (pre-pass says qna, LLM must override)
import { runDataset, hasDone, noError, intentIs, type Case } from "./lib/run.ts";
import type { Intent } from "@hexpert/shared";

// A real wallet + ENS so the wallet cases exercise the same strings users send.
const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const cases: Case<Intent>[] = [
  { id: "router/qna-general", expected: "qna",
    turns: [{ sessionId: "eval-router-1", message: "What is Ethereum gas?" }] },
  { id: "router/qna-solidity-concept", expected: "qna",
    turns: [{ sessionId: "eval-router-2", message: "Explain how require() works in Solidity." }] },
  { id: "router/wallet-0x", expected: "wallet",
    turns: [{ sessionId: "eval-router-3", message: `Analyse the wallet ${ADDR}.` }] },
  { id: "router/wallet-ens", expected: "wallet",
    turns: [{ sessionId: "eval-router-4", message: "Look up vitalik.eth and tell me about its activity." }] },
  { id: "router/audit-file", expected: "audit",
    turns: [{ sessionId: "eval-router-5", message: "Audit this contract for vulnerabilities.",
      fileContent: "contract A { function f() public {} }", fileName: "A.sol" }] },
  // Ambiguous: address inside a question → still wallet.
  { id: "router/wallet-addr-in-question", expected: "wallet",
    turns: [{ sessionId: "eval-router-6", message: `Is ${ADDR} a wallet worth holding?` }] },
  // Ambiguous: Solidity pasted as text with no file → pre-pass says qna, LLM
  // tie-breaker must override to audit. This is the core case the tie-breaker
  // exists for; if it regresses, this case fails.
  { id: "router/audit-solidity-as-text", expected: "audit",
    turns: [{ sessionId: "eval-router-7",
      message: "Please review this for issues: contract Vulnerable { mapping(address=>uint) bal; function withdraw() public { msg.sender.call{value: bal[msg.sender]}(''); bal[msg.sender]=0; } }" }] },
];

async function main(): Promise<void> {
  const ok = await runDataset("router", cases, (c, frames) => {
    const failures: string[] = [];
    const last = frames[frames.length - 1] ?? [];
    const noErr = noError(last); if (!noErr.pass) failures.push(noErr.message);
    const done = hasDone(last); if (!done.pass) failures.push(done.message);
    const intent = intentIs(c.expected)(last); if (!intent.pass) failures.push(intent.message);
    return { pass: failures.length === 0, messages: failures };
  });
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});