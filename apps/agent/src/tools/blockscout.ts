// PRD §4.7 (W3) — keyless NFT transfer data via Blockscout's v2 REST API.
//
// `eth.blockscout.com` is a no-key Etherscan equivalent. Its Etherscan-compat
// action `tokentnfttx` is NOT supported, so we use the v2 endpoint
// `/api/v2/addresses/{addr}/token-transfers?type=ERC-721` (paginated, 50/page).
// Returns collection + direction + method + timestamp per transfer. The v2 list
// view does not expose the per-token token_id, so the analyst summarises
// collection-level activity. Graceful: any failure returns a clear string and
// the node still runs.

const BASE = "https://eth.blockscout.com";

type Addr = { hash?: string; ens_domain_name?: string | null } | null;
type NftItem = {
  token?: { address_hash?: string; name?: string; symbol?: string } | null;
  from?: Addr;
  to?: Addr;
  method?: string;
  timestamp?: string;
};

function short(addr: string | undefined): string {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "?";
}

function label(a: Addr | undefined): string {
  if (!a) return "?";
  if (a.ens_domain_name) return a.ens_domain_name;
  return short(a.hash);
}

/** Fetch a wallet's recent ERC-721 NFT transfers from Blockscout (keyless). Never throws. */
export async function fetchNftActivity(address: string): Promise<string> {
  const url = `${BASE}/api/v2/addresses/${address.toLowerCase()}/token-transfers?type=ERC-721`;
  try {
    const res = await fetch(url);
    if (!res.ok) return `Blockscout NFT lookup failed (HTTP ${res.status}).`;
    const data = (await res.json()) as { items?: NftItem[] };
    const items = data.items ?? [];
    if (items.length === 0) {
      return `No ERC-721 NFT transfers found for ${address} on Blockscout.`;
    }

    // Group by collection for a count summary.
    const byCol = new Map<string, { name: string; symbol: string; count: number }>();
    for (const it of items) {
      const name = it.token?.name ?? "Unknown";
      const symbol = it.token?.symbol ?? "?";
      const key = it.token?.address_hash ?? name;
      const existing = byCol.get(key);
      if (existing) existing.count++;
      else byCol.set(key, { name, symbol, count: 1 });
    }
    const colLines = [...byCol.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([, c]) => `- ${c.name} (${c.symbol}): ${c.count} transfer(s)`);

    const recent = items
      .slice(0, 25)
      .map((it, i) => {
        const name = it.token?.name ?? "Unknown";
        const dir = `${label(it.from)} → ${label(it.to)}`;
        const date = it.timestamp ? it.timestamp.slice(0, 10) : "?";
        return `${i + 1}. ${name} — ${it.method ?? "transfer"}, ${dir}, ${date}`;
      });

    return `ERC-721 NFT activity (Blockscout, ${items.length} recent transfer(s)):
Collections:
${colLines.join("\n")}
Recent transfers:
${recent.join("\n")}`;
  } catch {
    return "Blockscout NFT data unavailable.";
  }
}