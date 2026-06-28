// PRD §4.4 — web search tool, instantiated per request with the user's Tavily
// key (res.locals.searchKey). Restricted to the Ethereum documentation allowlist.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

export const WEB_SEARCH_ALLOWED_DOMAINS = [
  "ethereum.org",
  "eips.ethereum.org",
  "docs.soliditylang.org",
  "docs.ethers.org",
  "hardhat.org",
  "book.getfoundry.sh",
  "docs.openzeppelin.com",
  "viem.sh",
];

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

/**
 * Build a per-request web_search tool bound to the given Tavily API key.
 * Results are restricted to WEB_SEARCH_ALLOWED_DOMAINS (R7 lives here — the
 * allowlist is narrow by design; curate demo questions accordingly).
 */
export function createWebSearch(searchKey: string) {
  return tool(
    async ({ query }: { query: string }) => {
      const res = await fetch(TAVILY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: searchKey,
          query,
          include_domains: WEB_SEARCH_ALLOWED_DOMAINS,
          max_results: 5,
        }),
      });
      if (!res.ok) return `web search failed: HTTP ${res.status}`;
      const data = (await res.json()) as {
        results?: { title: string; url: string; content: string }[];
      };
      const results = data.results ?? [];
      if (results.length === 0) return "web search returned no results within the allowlist.";
      return results
        .map((r) => `## ${r.title}\n${r.url}\n${r.content}`)
        .join("\n\n");
    },
    {
      name: "web_search",
      description:
        "Search Ethereum documentation (ethereum.org, EIPs, Solidity, ethers, Hardhat, Foundry, OpenZeppelin, viem) for up-to-date answers. Always cite the URL.",
      schema: z.object({ query: z.string().describe("The search query") }),
    },
  );
}