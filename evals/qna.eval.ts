// QnA eval — grades QnA answer quality (real LLM, real tokens). See evals/README.md.
//
// Unlike router (`meta.intent`) and audit (`report` frame), QnA has no
// zod-validated structured field — its output is prose streamed as `token`
// frames. Answer quality therefore needs an **LLM-as-judge**: a second LLM call
// scores the agent's streamed answer against a per-case rubric.
//
// The judge is configurable (R7's parked decision): `EVAL_JUDGE_*` env, default
// to `EVAL_MODEL`. Build it stronger later by setting those vars — no rewrite.
// The case set here doubles as R7's curated guaranteed-good demo questions (the
// QnA Tavily allowlist is narrow; these are answerable from it).
//
// Grading per case:
//   - deterministic: noError, hasDone, intent === "qna", optional mustContain
//     substrings, non-empty streamed answer
//   - judge:        {pass, reason} scoring the answer vs. the rubric
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { Provider } from "@hexpert/shared";
import { createLLM } from "../apps/agent/src/utils/llmFactory.ts";
import {
  runDataset,
  hasDone,
  noError,
  intentIs,
  tokenText,
  evalHeaders,
  type Case,
} from "./lib/run.ts";

// --- Judge config (R7 parked decision) --------------------------------------
// Default to the agent's own keys; override via EVAL_JUDGE_* to use a stronger
// model for grading. evalHeaders already exit(2) on missing EVAL_*, so the
// defaults always resolve to real values here.
const judgeProvider = (process.env.EVAL_JUDGE_PROVIDER ?? evalHeaders["X-Provider"]) as Provider;
const judgeModel = process.env.EVAL_JUDGE_MODEL ?? evalHeaders["X-Model"];
const judgeApiKey = process.env.EVAL_JUDGE_API_KEY ?? evalHeaders["X-Api-Key"];

type QnaExpect = {
  /** Free-text criterion the answer must satisfy — passed to the judge. */
  rubric: string;
  /** Lowercased substrings the streamed answer must contain (deterministic floor). */
  mustContain?: string[];
};

const JUDGE_SYSTEM = `You are a strict grader for Hexpert, an Ethereum-focused assistant. Decide whether the ANSWER satisfies the RUBRIC for the QUESTION.
Reply with ONLY a JSON object, no markdown fences, no other text:
{"pass": true|false, "reason": "<one short sentence>"}`;

function parseJudge(content: string): { pass: boolean; reason: string } {
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) return { pass: false, reason: `judge returned no JSON: ${content.slice(0, 160)}` };
  try {
    const o = JSON.parse(m[0]) as { pass?: unknown; reason?: unknown };
    return {
      pass: o.pass === true,
      reason: typeof o.reason === "string" ? o.reason : "(no reason)",
    };
  } catch (e) {
    return { pass: false, reason: `judge JSON unparseable: ${(e as Error).message}` };
  }
}

/** Score one answer against its rubric. Judge failures surface (never mask). */
async function gradeWithJudge(
  question: string,
  rubric: string,
  answer: string,
): Promise<{ pass: boolean; reason: string }> {
  try {
    const llm = createLLM({ provider: judgeProvider, apiKey: judgeApiKey, model: judgeModel });
    const human = `QUESTION:\n${question}\n\nRUBRIC:\n${rubric}\n\nANSWER:\n${answer}`;
    const res = await llm.invoke([new SystemMessage(JUDGE_SYSTEM), new HumanMessage(human)]);
    const content = typeof res.content === "string" ? res.content : String(res.content);
    return parseJudge(content);
  } catch (e) {
    return { pass: false, reason: `judge call failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// --- Cases (also R7's curated demo-question set) ----------------------------

const cases: Case<QnaExpect>[] = [
  {
    id: "qna/gas",
    expected: {
      rubric:
        "Explains that Ethereum gas is the fee paid for computation/storage when executing transactions, measured in gwei (or wei/ETH).",
    },
    turns: [{ sessionId: "eval-qna-1", message: "What is Ethereum gas, and what unit is it priced in?" }],
  },
  {
    id: "qna/solidity-require",
    expected: {
      rubric:
        "Explains that Solidity's require() checks a condition, reverts the transaction (rolling back state) if false, and refunds unused gas; distinct from assert()/revert().",
    },
    turns: [{ sessionId: "eval-qna-2", message: "Explain how require() works in Solidity." }],
  },
  {
    id: "qna/reentrancy",
    expected: {
      rubric:
        "Explains a reentrancy attack as an external call re-entering the contract before state is updated (classic DAO exploit), and mentions a mitigation such as checks-effects-interactions or a reentrancy guard.",
    },
    turns: [{ sessionId: "eval-qna-3", message: "What is a reentrancy attack in Solidity and how do I prevent it?" }],
  },
  {
    id: "qna/eip-4844",
    expected: {
      rubric:
        "Explains EIP-4844 / proto-danksharding introduces blob-carrying transactions that lower data-availability costs for L2 rollups. (Exercises the Tavily allowlist — eips.ethereum.org is whitelisted.)",
    },
    turns: [{ sessionId: "eval-qna-4", message: "What is EIP-4844 and why does it matter for L2 rollups?" }],
  },
  {
    id: "qna/offtopic-decline",
    expected: {
      rubric:
        "Politely declines the non-Ethereum question and offers to help with Ethereum topics instead. Does NOT answer the actual capital-of-France question.",
      mustContain: ["ethereum"],
    },
    turns: [{ sessionId: "eval-qna-5", message: "What is the capital of France?" }],
  },
];

function missingNeedles(text: string, needles: string[]): string[] {
  const t = text.toLowerCase();
  return needles.filter((n) => !t.includes(n.toLowerCase()));
}

async function main(): Promise<void> {
  const ok = await runDataset<QnaExpect>("qna", cases, async (c, frames) => {
    const failures: string[] = [];
    const summary: string[] = [];
    const last = frames[frames.length - 1] ?? [];

    const ne = noError(last); if (!ne.pass) failures.push(ne.message);
    const dn = hasDone(last); if (!dn.pass) failures.push(dn.message);
    const it = intentIs("qna")(last); if (!it.pass) failures.push(it.message);

    const answer = tokenText(last);
    const question = c.turns[c.turns.length - 1]?.message ?? "";

    if (answer.trim() === "") {
      // QnA streams its prose as token frames; an empty answer means nothing
      // streamed to grade — surface it explicitly rather than feeding the judge
      // an empty string.
      failures.push("no token frames — answer did not stream");
      return { pass: false, messages: [...summary, ...failures] };
    }

    const missing = missingNeedles(answer, c.expected.mustContain ?? []);
    if (missing.length) failures.push(`answer missing required terms: ${missing.join(", ")}`);

    const verdict = await gradeWithJudge(question, c.expected.rubric, answer);
    summary.push(`judge: ${verdict.reason}`);
    if (!verdict.pass) failures.push(`judge: ${verdict.reason}`);

    return { pass: failures.length === 0, messages: [...summary, ...failures] };
  });
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});