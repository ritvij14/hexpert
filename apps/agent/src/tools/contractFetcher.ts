// PRD §4.4 — fetch verified contract source from Etherscan given a contract
// address (module=contract, action=getsourcecode). Uses Etherscan API V2
// (V1 is deprecated); chainid=1 = Ethereum mainnet.

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { etherscanFetch } from "./etherscanRateLimit.js";

const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";

export const fetchContractSource = tool(
  async ({ address }: { address: string }) => {
    const url = new URL(ETHERSCAN_BASE);
    url.searchParams.set("chainid", "1");
    url.searchParams.set("module", "contract");
    url.searchParams.set("action", "getsourcecode");
    url.searchParams.set("address", address);
    url.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY ?? "");

    const res = await etherscanFetch(url.toString());
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    const data = (await res.json()) as {
      status?: string;
      message?: string;
      result?: { ContractName: string; SourceCode: string; ABI: string }[];
    };
    if (data.status !== "1" && !Array.isArray(data.result)) {
      throw new Error(`Etherscan API error: ${data.message ?? "unknown"}`);
    }
    const item = data.result?.[0];
    if (!item || !item.SourceCode) {
      return `No verified source code found for ${address}.`;
    }
    return `Contract: ${item.ContractName}\n\n${item.SourceCode}`.slice(0, 16000);
  },
  {
    name: "fetch_contract_source",
    description: "Fetch verified Solidity source code for a contract address from Etherscan.",
    schema: z.object({ address: z.string().describe("A 0x-prefixed contract address") }),
  },
);