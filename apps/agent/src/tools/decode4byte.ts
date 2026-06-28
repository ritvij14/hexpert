// PRD §4.4 — decode a 4-byte function selector to candidate human-readable
// signatures via 4byte.directory. No API key required. Selectors can collide
// (multiple signatures share one 4-byte hash), so all matches are returned.
// Called from the QnA ReAct loop for "what does this calldata/tx do?" questions.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

const ENDPOINT = "https://www.4byte.directory/api/v1/signatures/";

export const decode4byte = tool(
  async ({ selector }: { selector: string }) => {
    const sig = selector.startsWith("0x") ? selector : `0x${selector}`;
    if (!/^0x[a-fA-F0-9]{8}$/.test(sig)) {
      return `"${selector}" is not a valid 4-byte selector (expected 0x + 8 hex chars).`;
    }
    const url = new URL(ENDPOINT);
    url.searchParams.set("hex_signature", sig);
    const res = await fetch(url.toString());
    if (!res.ok) return `4byte.directory lookup failed: HTTP ${res.status}.`;
    const data = (await res.json()) as { results?: { text_signature: string }[] };
    const sigs = (data.results ?? []).map((r) => r.text_signature);
    if (sigs.length === 0) return `No known signatures for selector ${sig}.`;
    return `Selector ${sig} matches ${sigs.length} signature(s):\n- ${sigs.join("\n- ")}`;
  },
  {
    name: "decode_4byte",
    description:
      "Decode a 4-byte function selector (e.g. 0x18160ddd) to candidate human-readable function signatures from 4byte.directory. Useful for 'what does this selector / calldata / transaction do?' questions. Selectors can collide, so multiple matches may be returned. No API key needed.",
    schema: z.object({
      selector: z.string().describe("A 4-byte selector, e.g. 0x18160ddd (with or without 0x)"),
    }),
  },
);