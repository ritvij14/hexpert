// Etherscan free-tier rate limit: 3 calls/sec, enforced process-wide and
// shared by etherscan.ts (fetchTransactions / fetchTokenHoldings) and
// contractFetcher.ts (fetchContractSource). The wallet subgraph fires
// txlist + tokentx concurrently in fetchParallel, and a warm Lambda (or
// local dev) can overlap turns sharing one ETHERSCAN_API_KEY — without
// throttling, two concurrent turns = 4 calls/sec = a 429 ("Max rate limit
// reached, please use API Key for higher rate limit"). Sliding 1s window
// over dispatch timestamps; waits until a slot opens. Paid tiers raise the
// ceiling (Lite 5, Standard 10, Advanced 20, Professional/Pro Plus 30) —
// bump MAX_CALLS if the key is upgraded.

const WINDOW_MS = 1000;
const MAX_CALLS = 3;
let dispatches: number[] = [];

async function throttle(): Promise<void> {
  for (;;) {
    const now = Date.now();
    dispatches = dispatches.filter((t) => now - t < WINDOW_MS);
    if (dispatches.length < MAX_CALLS) {
      dispatches.push(now);
      return;
    }
    // Wait until the oldest dispatch exits the window, then recheck.
    const waitMs = WINDOW_MS - (now - dispatches[0]) + 1;
    await new Promise((r) => setTimeout(r, waitMs));
  }
}

/** `fetch` gated to ≤3 Etherscan calls/sec across the whole process. */
export async function etherscanFetch(url: string): Promise<Response> {
  await throttle();
  return fetch(url);
}