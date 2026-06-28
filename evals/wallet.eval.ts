// Wallet eval — grades the wallet subgraph's HITL round-trip (real LLM, real
// tokens, real Etherscan + ENS RPC). See evals/README.md.
//
// Each case is two turns sharing a sessionId:
//   turn 1: address/ENS → fetchParallel → initialSynthesis (one structured
//           record_wallet_profile call → zod-validated WalletProfile) → graph
//           suspends at hitlCheckpoint (hitl frame, no final answer yet).
//   turn 2: resume with an option string from WALLET_DEEPDIVE_VALUES → the
//           conditional edge dispatches deep-dive nodes (or skips to final) →
//           finalSynthesis streams the answer.
//
// Grading is structural (no judge needed): suspension proves initialSynthesis
// produced a valid WalletProfile; a non-empty streamed answer proves the resume
// + finalSynthesis path; a "defi" content check proves the deep-dive fan-out
// ran and flowed into the final answer. We do NOT assert on tool-event frames —
// the wallet fetch tools are invoked programmatically (not via LLM tool-calling),
// so their streamEvents behaviour is not a contract we grade on.
import {
  runDataset,
  hasDone,
  noError,
  intentIs,
  tokenText,
  hitlSuspended,
  type Case,
} from "./lib/run.ts";

const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // vitalik.eth
const FULL_SUMMARY = "Full summary"; // WALLET_DEEPDIVE_OPTIONS.full — keep in sync
const DEFI = "DeFi positions"; // WALLET_DEEPDIVE_OPTIONS.defi — keep in sync

type WalletExpect = {
  /** turn-2 resume option text. */
  resumeOption: string;
  /** Lowercased substring the turn-2 answer must mention (deep-dive fan-out signal). */
  answerMustContain?: string;
};

const cases: Case<WalletExpect>[] = [
  {
    id: "wallet/0x-full-summary",
    expected: { resumeOption: FULL_SUMMARY },
    turns: [
      { sessionId: "eval-wallet-1", message: `Analyse the wallet ${ADDR}.` },
      { sessionId: "eval-wallet-1", message: FULL_SUMMARY },
    ],
  },
  {
    id: "wallet/ens-full-summary",
    expected: { resumeOption: FULL_SUMMARY },
    turns: [
      { sessionId: "eval-wallet-2", message: "Look up vitalik.eth and profile its on-chain activity." },
      { sessionId: "eval-wallet-2", message: FULL_SUMMARY },
    ],
  },
  {
    id: "wallet/deepdive-defi",
    expected: { resumeOption: DEFI, answerMustContain: "defi" },
    turns: [
      { sessionId: "eval-wallet-3", message: `Analyse the wallet ${ADDR}.` },
      { sessionId: "eval-wallet-3", message: DEFI },
    ],
  },
];

async function main(): Promise<void> {
  const ok = await runDataset<WalletExpect>("wallet", cases, (c, frames) => {
    const failures: string[] = [];
    const summary: string[] = [];
    const errs = frames.flat().filter((f) => f.type === "error") as { error: string }[];

    if (errs.length) {
      failures.push(`error: ${errs.map((e) => e.error).join("; ")}`);
      return { pass: false, messages: [...summary, ...failures] };
    }

    // Turn 1 — must route to wallet, run the fetch+synthesis, and suspend at HITL.
    const turn1 = frames[0] ?? [];
    const it1 = intentIs("wallet")(turn1); if (!it1.pass) failures.push(`turn1: ${it1.message}`);
    if (!hitlSuspended(turn1).pass) failures.push("turn1: expected a hitl frame (graph did not suspend)");

    // Turn 2 — must resume and stream a final answer; deep-dive cases must
    // surface the requested topic (proves the fan-out node ran and reached
    // finalSynthesis).
    const turn2 = frames[1] ?? [];
    if (frames.length < 2) {
      failures.push("turn2: missing (expected a HITL resume turn)");
    } else {
      const it2 = intentIs("wallet")(turn2); if (!it2.pass) failures.push(`turn2: ${it2.message}`);
      if (!hasDone(turn2).pass) failures.push("turn2: missing [DONE]");
      const answer = tokenText(turn2);
      if (answer.trim() === "") {
        failures.push("turn2: no token frames — final answer did not stream");
      } else {
        summary.push(`turn2 answer: ${answer.length} chars`);
        if (c.expected.answerMustContain) {
          const needle = c.expected.answerMustContain;
          if (!answer.toLowerCase().includes(needle)) {
            failures.push(`turn2: answer does not mention "${needle}" (deep-dive fan-out may not have run)`);
          }
        }
      }
    }

    return { pass: failures.length === 0, messages: [...summary, ...failures] };
  });
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});