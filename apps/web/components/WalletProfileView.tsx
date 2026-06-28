"use client";

import { Icon } from "@iconify/react";
import type { WalletProfile } from "@hexpert/shared";

const fmtInt = (n: number): string => n.toLocaleString("en-US");

/**
 * Wallet profile card (R10 F1). Visual source of truth: docs/design/
 * generated-page.html "Wallet Profile Card". The design's 3-stat grid used
 * ETH Balance / ERC20 Value, which the WalletProfile type doesn't carry — the
 * fetched profile exposes topContracts + tokenHoldings instead, so the grid
 * shows Tx Count / Top Contracts / Tokens Held (honest, data-driven). The
 * LLM-authored `summary` renders below the grid.
 */
export default function WalletProfileView({ profile }: { profile: WalletProfile }) {
  const { address, ensName, age, transactionCount, topContracts, tokenHoldings, summary } = profile;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Tx Count", value: fmtInt(transactionCount) },
    { label: "Top Contracts", value: fmtInt(topContracts.length) },
    { label: "Tokens Held", value: fmtInt(tokenHoldings.length) },
  ];

  return (
    <div className="w-full bg-[#121214] border border-zinc-800/80 rounded-lg p-5 flex flex-col gap-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-zinc-700/80 flex items-center justify-center shrink-0">
            <Icon icon="solar:wallet-linear" className="text-zinc-300 text-lg" />
          </div>
          <div className="min-w-0">
            <div className="font-medium text-sm text-zinc-100 flex items-center gap-2">
              <span className="truncate">{ensName ?? address}</span>
              {ensName ? (
                <Icon icon="solar:check-circle-linear" className="text-emerald-500 text-xs shrink-0" />
              ) : null}
            </div>
            {ensName ? (
              <div className="font-mono text-xs text-emerald-400/80 mt-0.5 truncate">{address}</div>
            ) : null}
          </div>
        </div>
        <div className="text-right hidden sm:block shrink-0">
          <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Age</div>
          <div className="text-sm font-medium text-zinc-300 mt-0.5">{age || "—"}</div>
        </div>
      </div>
      <div className="h-px w-full bg-zinc-800/60" />
      <div className="grid grid-cols-3 gap-4 text-sm">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</span>
            <span className="font-mono text-zinc-300 text-xs truncate">{s.value}</span>
          </div>
        ))}
      </div>
      {summary ? (
        <div className="text-xs text-zinc-400 leading-relaxed">{summary}</div>
      ) : null}
    </div>
  );
}