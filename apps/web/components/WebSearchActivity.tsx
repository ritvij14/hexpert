"use client";

import type { WebSearchRun } from "../stores/chatStore";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Muted card surfacing web_search activity for a turn (from the `webSearch`
 * SSE frame): how many queries ran, which pages were surfed (as links), and how
 * much data was retrieved. Styled to match the Dark-as-Night tool/meta palette
 * (zinc-800 borders, zinc-400/500 mono labels, tracking-widest).
 */
export default function WebSearchActivity({ searches }: { searches?: WebSearchRun[] }) {
  if (!searches || searches.length === 0) return null;
  const totalBytes = searches.reduce((n, s) => n + s.bytes, 0);
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800/60">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
          <span className="text-zinc-500">
            <SearchIcon />
          </span>
          Web search
          <span className="text-zinc-600">·</span>
          <span className="text-zinc-500">
            {searches.length} {searches.length === 1 ? "query" : "queries"}
          </span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
          {formatBytes(totalBytes)} retrieved
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-zinc-800/40">
        {searches.map((s, i) => (
          <li key={i} className="px-3 py-2 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-300 truncate font-mono">
                {s.query || "(no query)"}
              </span>
              <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-widest shrink-0">
                {formatBytes(s.bytes)}
              </span>
            </div>
            {s.urls.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {s.urls.map((u, j) => (
                  <li key={j}>
                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      <span className="text-zinc-600">↗</span>
                      {hostname(u)}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-[10px] font-mono text-zinc-600">
                no results within allowlist
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}