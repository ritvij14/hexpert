// PRD §4.7 (W1) — keyless USD portfolio valuation for the wallet subgraph.
//
// Balances: one viem multicall (balanceOf over the wallet's distinct ERC-20
// contracts + native eth_getBalance) against the shared public RPC — no key,
// one round-trip via mainnet's Multicall3 contract. Prices + decimals + symbol:
// one batched GET to coins.llama.fi/prices/current — no auth, decimals included
// so no extra decimals round-trip. Native ETH is priced via the `coingecko:ethereum`
// coin key.
//
// Graceful: any RPC or price failure yields an empty portfolio (totalUsd 0),
// never breaks the wallet flow. Only tokens DefiLlama prices are valued; the
// rest are listed unpriced. Distinct tokens are capped at 30 to keep the URL
// bounded. No API key, no cost.

import { getAddress, type Address, type Abi } from "viem";
import { getPublicClient } from "./ens.js";

const PRICES_URL = (coins: string[]) =>
  `https://coins.llama.fi/prices/current/${coins.join(",")}`;
const ETH_COIN = "coingecko:ethereum";
const MAX_TOKENS = 30;

const ERC20_BALANCE_ABI: Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
];

type CoinPrice = {
  decimals?: number;
  symbol?: string;
  price?: number;
};

export type UsdHolding = {
  symbol: string;
  /** USD value of the wallet's current balance of this token (0 if unpriced). */
  usdValue: number;
  /** Human-readable balance in natural units, e.g. "5000.0". */
  balance: string;
  priced: boolean;
};

export type UsdPortfolio = {
  totalUsd: number;
  holdings: UsdHolding[];
  /** Human-readable block for an LLM prompt. */
  summary: string;
};

type PriceMap = Map<string, CoinPrice>; // keyed by lowercase `ethereum:0x...` or `coingecko:ethereum`

async function fetchPrices(coinKeys: string[]): Promise<PriceMap> {
  if (coinKeys.length === 0) return new Map();
  try {
    const res = await fetch(PRICES_URL(coinKeys));
    if (!res.ok) return new Map();
    const data = (await res.json()) as { coins?: Record<string, CoinPrice> };
    return new Map(Object.entries(data.coins ?? {}));
  } catch {
    return new Map();
  }
}

function formatUnits(wei: bigint, decimals: number): string {
  if (decimals <= 0) return wei.toString();
  const s = wei.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

/**
 * Compute a keyless USD portfolio for `address` given the distinct token
 * contracts it has transferred. Returns totalUsd + per-token holdings + a
 * prompt-ready summary string. Never throws.
 */
export async function fetchUsdPortfolio(
  address: string,
  tokenContracts: string[],
): Promise<UsdPortfolio> {
  const client = getPublicClient();
  const wallet = getAddress(address) as Address;
  const holdings: UsdHolding[] = [];
  let totalUsd = 0;

  try {
    // Native ETH balance + price.
    const ethWei = await client.getBalance({ address: wallet });
    const tokens = tokenContracts.slice(0, MAX_TOKENS).map((c) => c.toLowerCase());

    const coinKeys = [ETH_COIN, ...tokens.map((c) => `ethereum:${c}`)];
    const prices = await fetchPrices(coinKeys);

    const ethPrice = prices.get(ETH_COIN)?.price ?? 0;
    const ethDecimals = 18;
    const ethAmount = Number(formatUnits(ethWei, ethDecimals));
    const ethUsd = ethAmount * ethPrice;
    totalUsd += ethUsd;
    holdings.push({
      symbol: "ETH",
      balance: ethAmount.toFixed(4),
      usdValue: ethUsd,
      priced: ethPrice > 0,
    });

    // ERC-20 balances via one multicall (Multicall3 on mainnet).
    if (tokens.length > 0) {
      const contracts = tokens.map((c) => ({
        address: getAddress(c) as Address,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [wallet],
      }));
      const results = await client.multicall({ contracts, allowFailure: true });

      for (let i = 0; i < tokens.length; i++) {
        const r = results[i] as { status: "success" | "failure"; result?: unknown };
        if (r.status !== "success") continue;
        const bal = r.result as bigint | undefined;
        if (!bal || bal <= 0n) continue; // wallet no longer holds this token

        const key = `ethereum:${tokens[i]}`;
        const cp = prices.get(key);
        const decimals = cp?.decimals ?? 0;
        const symbol = cp?.symbol ?? "UNKNOWN";
        const amount = Number(formatUnits(bal, decimals));
        const usd = cp?.price ? amount * cp.price : 0;
        if (usd > 0) totalUsd += usd;
        holdings.push({ symbol, balance: amount.toFixed(4), usdValue: usd, priced: !!cp?.price });
      }
    }
  } catch {
    // Any RPC/price blow-up: return what we have (likely empty). The caller
    // still gets a valid (zero) portfolio and the wallet flow continues.
    return { totalUsd: 0, holdings, summary: "USD portfolio valuation unavailable." };
  }

  // Sort by USD value desc; keep priced first.
  holdings.sort((a, b) => b.usdValue - a.usdValue);

  const lines = holdings
    .slice(0, 12)
    .map((h) => `- ${h.symbol}: ${h.balance}${h.priced ? ` ($${h.usdValue.toFixed(2)})` : " (unpriced)"}`);
  const summary =
    holdings.length === 0
      ? "USD portfolio valuation unavailable."
      : `USD portfolio (keyless, DefiLlama prices):\n${lines.join("\n")}\nEstimated total: ~$${totalUsd.toFixed(2)}`;

  return { totalUsd, holdings, summary };
}