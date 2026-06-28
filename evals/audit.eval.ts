// Audit eval — grades the audit subgraph's structured output (real LLM, real
// tokens). See evals/README.md.
//
// Each case is two turns sharing a sessionId:
//   turn 1: send Solidity source → analyseContract (forced tool call + zod) →
//           graph suspends at the HITL checkpoint (hitl frame, no report yet).
//   turn 2: resume with "Full report only" → finalReport → report frame.
// The resume string MUST match AUDIT_FOLLOWUP_OPTIONS.reportOnly exactly, else
// the conditional edge falls through (see auditGraph.ts).
//
// Grade:
//   vulnerable contract → ≥1 high/medium finding
//   clean contract       → 0 high/medium findings
// Read off the report frame's AuditFinding[] — no LLM judge needed, the output
// is zod-validated structured.
import { runDataset, hasDone, type Case, type SseFrame } from "./lib/run.ts";
import type { AuditReport, AuditFinding } from "@hexpert/shared";

const REPORT_ONLY = "Full report only"; // AUDIT_FOLLOWUP_OPTIONS.reportOnly — keep in sync

// Classic reentrancy: external call before state update.
const VULN_REENTRANCY = `// SPDX-License-Identifier: MIT
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
}`;

// Checks-effects-interactions ordering; no known high/medium issue.
const CLEAN = `// SPDX-License-Identifier: MIT
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
}`;

type Expect = "vulnerable" | "clean";

const cases: Case<Expect>[] = [
  { id: "audit/vuln-reentrancy", expected: "vulnerable", turns: [
    { sessionId: "eval-audit-1", message: "Audit this contract for vulnerabilities.",
      fileContent: VULN_REENTRANCY, fileName: "Vulnerable.sol" },
    { sessionId: "eval-audit-1", message: REPORT_ONLY },
  ]},
  { id: "audit/clean-safe", expected: "clean", turns: [
    { sessionId: "eval-audit-2", message: "Audit this contract for vulnerabilities.",
      fileContent: CLEAN, fileName: "Safe.sol" },
    { sessionId: "eval-audit-2", message: REPORT_ONLY },
  ]},
];

function findReport(frames: SseFrame[]): AuditReport | null {
  const f = frames.find((x) => x.type === "report") as { auditReport?: AuditReport } | undefined;
  return f?.auditReport ?? null;
}

async function main(): Promise<void> {
  const ok = await runDataset("audit", cases, (c, frames) => {
    const failures: string[] = [];
    const summary: string[] = [];
    const errs = frames.flat().filter((f) => f.type === "error") as { error: string }[];
    if (errs.length) {
      failures.push(`error: ${errs.map((e) => e.error).join("; ")}`);
    } else {
      if (!hasDone(frames[frames.length - 1] ?? []).pass) failures.push("last turn missing [DONE]");
      let sawReport = false;
      const allFindings: AuditFinding[] = [];
      for (const turn of frames) {
        const r = findReport(turn);
        if (r) { sawReport = true; allFindings.push(...r.findings); }
      }
      const highMed = allFindings.filter((f) => f.severity === "high" || f.severity === "medium");
      summary.push(`${allFindings.length} findings (${highMed.length} high/med)`);
      if (!sawReport) {
        failures.push("no report frame produced");
      } else if (c.expected === "vulnerable" && highMed.length === 0) {
        failures.push("expected >=1 high/medium finding, got only low/info");
      } else if (c.expected === "clean" && highMed.length > 0) {
        failures.push(`expected 0 high/medium, got ${highMed.length}: ${highMed.map((f) => `${f.severity}:${f.title}`).join(", ")}`);
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