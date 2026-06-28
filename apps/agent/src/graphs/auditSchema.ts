// PRD §4.8 / ADR-006 — audit findings schema + follow-up options.
//
// Structured output is done via tool calling (not `format`/json_schema) so the
// same path works on all four providers incl. Ollama Cloud, which has no
// structured-output mode but does support tool calling. The model is forced to
// emit a single `record_audit_findings` tool call; we intercept its args and
// validate with zod (the tool is never actually executed).
//
// The five finding categories (reentrancy/access/overflow/unchecked/hardcoded)
// live ONLY in this schema. The node flattens them into one `AuditFinding[]`
// for state, honouring ADR-006 (one call, five categories) without five state
// channels. `packages/shared` is untouched.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Findings tool schema
// ---------------------------------------------------------------------------

const findingSchema = z.object({
  severity: z.enum(["high", "medium", "low", "info"]),
  title: z.string().describe("Short, specific finding title."),
  description: z
    .string()
    .describe("Concise explanation of the issue and impact. Keep under 200 chars."),
  lineReference: z
    .string()
    .describe("Line or line range in the contract, e.g. 'L42' or 'L42-45'. Use 'n/a' if unknown."),
});

export const auditFindingsSchema = z.object({
  contractName: z.string().describe("The Solidity contract name from the source."),
  overallRisk: z
    .enum(["high", "medium", "low", "info", "none"])
    .describe("Highest severity across all findings, or 'none' if no findings."),
  summary: z
    .string()
    .describe("2-4 sentence overall assessment of the contract's security posture."),
  reentrancy: z
    .array(findingSchema)
    .describe("Reentrancy vulnerabilities (external calls before state update)."),
  access: z
    .array(findingSchema)
    .describe("Access-control issues (missing/incorrect onlyOwner, public setters)."),
  overflow: z
    .array(findingSchema)
    .describe("Integer overflow/underflow risks (pre-0.8 unchecked math, unsafe casts)."),
  unchecked: z
    .array(findingSchema)
    .describe("Unchecked calls/returns (ignored .call/.send return values, low-level calls)."),
  hardcoded: z
    .array(findingSchema)
    .describe("Hardcoded values (addresses, limits, fees) that should be parameterised."),
});

export type AuditFindingsTool = z.infer<typeof auditFindingsSchema>;

/**
 * The structured-output vehicle. The model MUST call this exactly once with all
 * findings. Implementation is a no-op stub — it is never executed; the
 * `analyseContract` node reads the call out of `ai.tool_calls` and zod-validates
 * the args. This mirrors how Claude Code uses tool calls for structured return.
 */
export const recordAuditFindingsTool = tool(
  async () => "recorded",
  {
    name: "record_audit_findings",
    description:
      "Record the full security audit of a Solidity contract. Call this EXACTLY ONCE with every finding across the five categories, plus overallRisk, summary, and contractName. Do not respond in prose.",
    schema: auditFindingsSchema,
  },
);

// ---------------------------------------------------------------------------
// HITL follow-up options (shared contract)
// ---------------------------------------------------------------------------
// These exact strings are: (a) the interrupt options offered to the user,
// (b) the conditional-edge router keys in auditGraph, and (c) what the frontend
// must send as the resume `message`. Drift in any one place = silent
// fall-through on the conditional edge.

export const AUDIT_FOLLOWUP_OPTIONS = {
  generateFix: "Generate a fix",
  generateExploit: "Show an exploit scenario",
  reportOnly: "Full report only",
} as const;

export const AUDIT_FOLLOWUP_VALUES: readonly string[] = Object.values(AUDIT_FOLLOWUP_OPTIONS);