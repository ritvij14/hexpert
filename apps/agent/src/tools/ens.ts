// PRD §4.4 — ENS resolution via a public Ethereum RPC. No API key, no cost.
// Forward (name -> address) and reverse (address -> name) using viem against a
// public RPC. viem 2.x uses ENS's universal resolver with CCIP-read batch
// gateways, which not every public RPC supports — Cloudflare's gateway returns
// "Internal error" on resolveWithGateways. The default below
// (ethereum.publicnode.com) is confirmed to support both directions; override
// with ETH_RPC_URL (eth.drpc.org is another confirmed-working alternative).
// Best-effort: returns null on any failure or unset record.
//
// Used by the wallet subgraph's fetchParallel node (forward resolve when the
// user typed an ENS name like "vitalik.eth"; reverse resolve for the profile).

import { createPublicClient, http, getAddress, isAddress } from "viem";
import { mainnet } from "viem/chains";
import type { Address } from "viem";

const RPC_URL = process.env.ETH_RPC_URL ?? "https://ethereum.publicnode.com";

// Lazy singleton — created on first use, not at import. On a cold Lambda the
// module is re-loaded per invocation anyway, so this never leaks across calls.
let client: ReturnType<typeof createPublicClient> | null = null;
function publicClient() {
  if (!client) {
    client = createPublicClient({ chain: mainnet, transport: http(RPC_URL) });
  }
  return client;
}

/** Shared mainnet public client for keyless on-chain reads (balances, multicall). */
export function getPublicClient() {
  return publicClient();
}

/** Forward resolve an ENS name to a 0x address. Returns null if unset/unresolved. */
export async function resolveEnsAddress(name: string): Promise<Address | null> {
  try {
    const addr = await publicClient().getEnsAddress({ name });
    return addr ?? null;
  } catch {
    return null;
  }
}

/** Reverse resolve a 0x address to its ENS name. Returns null if unset/unresolved. */
export async function resolveEnsName(address: string): Promise<string | null> {
  try {
    if (!isAddress(address)) return null;
    const name = await publicClient().getEnsName({ address: getAddress(address) });
    return name ?? null;
  } catch {
    return null;
  }
}