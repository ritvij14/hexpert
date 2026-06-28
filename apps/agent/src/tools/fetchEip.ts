// PRD §4.4 — fetch an Ethereum Improvement Proposal / ERC by number from the
// canonical EIPs repo (raw GitHub markdown). No API key required. Called from
// the QnA ReAct loop to ground EIP/ERC answers in the official spec text.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const EIP_URL = (n: number) =>
  `https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-${n}.md`;

// Cap so a single EIP doesn't dominate the ReAct context window.
const MAX_CHARS = 12000;

export const fetchEip = tool(
  async ({ number }: { number: number }) => {
    const res = await fetch(EIP_URL(number));
    if (!res.ok) return `EIP-${number} not found (HTTP ${res.status}).`;
    const text = await res.text();
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n\n…(truncated)" : text;
  },
  {
    name: "fetch_eip",
    description:
      "Fetch the canonical markdown text of an Ethereum Improvement Proposal or ERC by its number (e.g. 20 for ERC-20, 7702 for EIP-7702). Use this to ground answers about a specific EIP/ERC in the official spec. No API key needed.",
    schema: z.object({
      number: z.number().int().describe("The EIP/ERC number, e.g. 20 or 7702"),
    }),
  },
);