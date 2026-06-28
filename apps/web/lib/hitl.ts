// HITL option-set detection. The backend `hitl` frame is `{ question, options }`
// with no multi/single flag. The two known interrupt shapes (the shared contract
// defined in apps/agent/src/graphs/{wallet,audit}Schema.ts) are matched here so
// the UI can render wallet deep-dive as multi-select and audit follow-up as
// single-select. Drift in those option strings = a UI detection miss, so they
// are duplicated here intentionally as the frontend's view of the contract.

export const WALLET_DEEPDIVE_OPTIONS = [
  "DeFi positions",
  "NFT activity",
  "Governance",
  "Full summary",
] as const;

export const AUDIT_FOLLOWUP_OPTIONS = [
  "Generate a fix",
  "Show an exploit scenario",
  "Full report only",
] as const;

/** "Full summary" is exclusive — selecting it (with anything else) still means
 *  "no deep-dive", and selecting a real direction should clear it. */
export const FULL_SUMMARY = "Full summary";

export function isWalletHITL(options: string[]): boolean {
  return options.every((o) =>
    (WALLET_DEEPDIVE_OPTIONS as readonly string[]).includes(o),
  );
}

export function isMultiSelectHITL(options: string[]): boolean {
  return isWalletHITL(options);
}

/** Join a multi-select into the resume `message`. Any separator works — the
 *  backend `parseSelection` does case-insensitive substring matching on
 *  "defi" / "nft" / "governance". */
export function joinSelection(selected: string[]): string {
  return selected.join(", ");
}