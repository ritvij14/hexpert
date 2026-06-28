// PRD §4.7 (W2) — keyless off-chain governance data via the Snapshot GraphQL hub.
//
// `hub.snapshot.org/graphql` is unauthenticated (~100 RPM). We query a voter's
// recent votes with their proposal + space, returning a compact block for the
// governance deep-dive prompt. This replaces the old "infer governance from
// ERC-20 transfers and flag uncertainty" behaviour with real off-chain data.
// Graceful: any failure or empty result returns a clear "no Snapshot data"
// string so the node can still note on-chain Governor activity separately.

const ENDPOINT = "https://hub.snapshot.org/graphql";

type SnapshotVote = {
  id?: string;
  vp?: number;
  created?: number;
  choice?: unknown;
  proposal?: { id?: string; title?: string } | null;
  space?: { id?: string; name?: string } | null;
};

function describeChoice(choice: unknown): string {
  if (choice == null) return "?";
  if (typeof choice === "number" || typeof choice === "string") return String(choice);
  return JSON.stringify(choice);
}

/** Fetch a wallet's recent Snapshot off-chain votes (keyless). Never throws. */
export async function fetchSnapshotActivity(address: string): Promise<string> {
  const query = `{
    votes(first: 25, where: { voter: "${address.toLowerCase()}" }) {
      id vp created choice
      proposal { id title }
      space { id name }
    }
  }`;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return `Snapshot lookup failed (HTTP ${res.status}).`;
    const data = (await res.json()) as { data?: { votes?: SnapshotVote[] }; errors?: unknown };
    if (data.errors) return "Snapshot lookup returned an error.";
    const votes = data.data?.votes ?? [];
    if (votes.length === 0) {
      return `No Snapshot off-chain votes found for ${address}.`;
    }
    const lines = votes.slice(0, 25).map((v, i) => {
      const space = v.space?.name ?? v.space?.id ?? "?";
      const title = v.proposal?.title ?? "(untitled proposal)";
      const date = v.created ? new Date(v.created * 1000).toISOString().slice(0, 10) : "?";
      return `${i + 1}. [${space}] "${title}" — vote: ${describeChoice(v.choice)} (vp ${v.vp ?? "?"}, ${date})`;
    });
    return `Snapshot off-chain governance: ${votes.length} recent vote(s)\n${lines.join("\n")}`;
  } catch {
    return "Snapshot off-chain governance data unavailable.";
  }
}