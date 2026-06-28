// PRD §4.7 — wallet profile schema + deep-dive options.
//
// Structured output via tool calling (not `format`/json_schema) so the same
// path works on all four providers incl. Ollama Cloud (which has no
// structured-output mode but supports tool calling) — same approach as
// auditSchema.ts. The model is forced to emit a single `record_wallet_profile`
// call; the `initialSynthesis` node intercepts the args and zod-validates them.
// The tool is never actually executed.
//
// Only the interpretive fields (age, topContracts, tokenHoldings, summary) come
// from the LLM. address / ensName / transactionCount are set deterministically
// in the node from the fetched data — no reason to let the model guess those.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Profile tool schema
// ---------------------------------------------------------------------------

export const walletProfileSchema = z.object({
  age: z
    .string()
    .describe("Human-readable wallet age derived from the earliest transaction timestamp, e.g. '3 years 2 months'."),
  topContracts: z
    .array(z.string())
    .describe("Most-interacted-with contract addresses (by frequency), 0x-prefixed."),
  tokenHoldings: z
    .array(z.string())
    .describe("Distinct token symbols the wallet holds or has actively transferred."),
  summary: z
    .string()
    .describe("2-4 sentence plain-English summary of the wallet's on-chain activity and profile."),
});

export type WalletProfileTool = z.infer<typeof walletProfileSchema>;

/**
 * The structured-output vehicle. The model MUST call this exactly once with its
 * profile reading. No-op stub — never executed; `initialSynthesis` reads the
 * call out of `ai.tool_calls` and zod-validates the args.
 */
export const recordWalletProfileTool = tool(
  async () => "recorded",
  {
    name: "record_wallet_profile",
    description:
      "Record the initial wallet profile from fetched Etherscan data. Call this EXACTLY ONCE with age, topContracts, tokenHoldings, and summary. Do not respond in prose.",
    schema: walletProfileSchema,
  },
);

// ---------------------------------------------------------------------------
// HITL deep-dive options (shared contract)
// ---------------------------------------------------------------------------
// These exact strings are: (a) the interrupt options offered to the user,
// (b) what the frontend sends back as the resume `message`. `deepDiveDispatch`
// parses the resume text (case-insensitive substring match) to pick nodes, so
// the user may select several (e.g. "DeFi and NFT"). "Full summary" (or no
// match) skips the deep-dive nodes and goes straight to finalSynthesis.

export const WALLET_DEEPDIVE_OPTIONS = {
  defi: "DeFi positions",
  nft: "NFT activity",
  governance: "Governance",
  full: "Full summary",
} as const;

export const WALLET_DEEPDIVE_VALUES: readonly string[] = Object.values(WALLET_DEEPDIVE_OPTIONS);