// PRD §4.4 — Etherscan-backed wallet tools + ENS reverse resolution. The
// Etherscan API key is the Lambda-side env ETHERSCAN_API_KEY (never per-request,
// never logged). Invoked directly by the wallet subgraph's fetchParallel node.
//
// fetchTransactions / fetchTokenHoldings return compact summaries (count +
// samples) rather than raw sliced JSON: a large wallet's txlist is far bigger
// than any sane LLM context window, and slicing mid-array yields invalid JSON
// and a wrong transactionCount. The summary gives the LLM clean, bounded input
// and an accurate count. These tools have no consumers besides the wallet
// subgraph.

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { resolveEnsName } from "./ens.js";
import { etherscanFetch } from "./etherscanRateLimit.js";

// Etherscan API V2 (V1 is deprecated and returns an error string as `result`).
// chainid=1 = Ethereum mainnet. See https://docs.etherscan.io/v2-migration.
const ETHERSCAN_BASE = "https://api.etherscan.io/v2/api";

function etherscanUrl(params: Record<string, string>): string {
  const url = new URL(ETHERSCAN_BASE);
  url.searchParams.set("chainid", "1");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("apikey", process.env.ETHERSCAN_API_KEY ?? "");
  return url.toString();
}

async function etherscanGet(params: Record<string, string>): Promise<unknown> {
  const res = await etherscanFetch(etherscanUrl(params));
  if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
  const data = (await res.json()) as { status: string; message: string; result: unknown };
  if (data.status === "1") return data.result;
  // status "0": "No transactions found" is a legit empty result. Anything else
  // (rate limit, deprecated endpoint, invalid key, etc. — where `result` is a
  // string message) is a real error and MUST surface, not silently become [].
  if (/no transactions found/i.test(data.message)) return [];
  throw new Error(
    `Etherscan API error: ${data.message}${typeof data.result === "string" ? ` — ${data.result}` : ""}`,
  );
}

function weiToEther(wei: string | undefined): string {
  if (!wei) return "0";
  const n = Number(wei) / 1e18;
  return Number.isFinite(n) ? n.toFixed(4) : "0";
}

const addressSchema = z.object({ address: z.string().describe("A 0x-prefixed Ethereum address") });

type TxRow = {
  timeStamp?: string;
  from?: string;
  to?: string;
  value?: string;
  functionName?: string;
  contractAddress?: string;
};

/** Normal transactions for an address (module=account, action=txlist). */
export const fetchTransactions = tool(
  async ({ address }: { address: string }) => {
    const result = (await etherscanGet({
      module: "account",
      action: "txlist",
      address,
      startblock: "0",
      endblock: "99999999",
      page: "1",
      offset: "1000",
      sort: "asc",
    })) as TxRow[];
    const arr = Array.isArray(result) ? result : [];
    const lines = arr.slice(0, 12).map((t, i) => {
      const fn = t.functionName || "transfer";
      const to = t.to ?? "?";
      return `${i + 1}. t=${t.timeStamp ?? "?"} ${t.from ?? "?"} -> ${to} [${fn}] ${weiToEther(t.value)}ETH`;
    });
    // At the page cap the wallet likely has more — flag it so the profile is honest.
    const capped = arr.length === 1000 ? " (showing first 1000; wallet may have more)" : "";
    return `Normal transactions: ${arr.length}${capped}\n${lines.join("\n")}`;
  },
  {
    name: "fetch_transactions",
    description: "Fetch a summary of normal transactions for an Ethereum address from Etherscan (count + first 12 entries, capped at 1000).",
    schema: addressSchema,
  },
);

type TokenRow = {
  tokenSymbol?: string;
  contractAddress?: string;
  value?: string;
  from?: string;
  to?: string;
};

/**
 * Raw ERC-20 token transfer rows for an address (module=account, action=tokentx).
 * Shared between the fetch_token_holdings tool (summary) and the wallet subgraph's
 * USD-portfolio path (which needs the distinct contract list for balance multicall).
 */
export async function getTokenTransfers(address: string): Promise<TokenRow[]> {
  const result = await etherscanGet({
    module: "account",
    action: "tokentx",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "1000",
    sort: "asc",
  });
  return Array.isArray(result) ? (result as TokenRow[]) : [];
}

/** Compact human summary of ERC-20 transfer activity for an LLM prompt. */
export function summarizeTokenTransfers(rows: TokenRow[]): string {
  const byKey = new Map<string, { symbol: string; contract: string; count: number }>();
  for (const t of rows) {
    const symbol = t.tokenSymbol ?? "UNKNOWN";
    const key = `${symbol}:${t.contractAddress ?? ""}`;
    const existing = byKey.get(key);
    if (existing) existing.count++;
    else byKey.set(key, { symbol, contract: t.contractAddress ?? "", count: 1 });
  }
  const lines = [...byKey.values()]
    .slice(0, 20)
    .map((t) => `${t.symbol} ${t.contract} x${t.count}`);
  return `Distinct tokens: ${byKey.size} (from ${rows.length} transfers)\n${lines.join("\n")}`;
}

/** Distinct token contract addresses the wallet has transferred (keyless balance lookup). */
export function distinctTokenContracts(rows: TokenRow[]): string[] {
  const set = new Set<string>();
  for (const t of rows) {
    const c = (t.contractAddress ?? "").toLowerCase();
    if (/^0x[a-f0-9]{40}$/.test(c)) set.add(c);
  }
  return [...set];
}

/** ERC-20 token transfer events for an address (module=account, action=tokentx). */
export const fetchTokenHoldings = tool(
  async ({ address }: { address: string }) =>
    summarizeTokenTransfers(await getTokenTransfers(address)),
  {
    name: "fetch_token_holdings",
    description: "Fetch a summary of ERC-20 token transfer events for an Ethereum address from Etherscan (distinct tokens + transfer counts).",
    schema: addressSchema,
  },
);

// Reverse ENS (address -> name) via the ENS reverse resolver on a public RPC —
// see ens.ts. Best-effort; returns null if no reverse record is set.
export const fetchEnsName = tool(
  async ({ address }: { address: string }) => resolveEnsName(address),
  {
    name: "fetch_ens_name",
    description: "Resolve the ENS name for an Ethereum address (best-effort) via the ENS reverse resolver. Returns null if unresolved.",
    schema: addressSchema,
  },
);