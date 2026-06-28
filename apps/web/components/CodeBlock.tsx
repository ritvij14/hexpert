"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";

type CodeBlockProps = {
  lang: string;
  /** Raw code text — used for line numbers + copy. */
  code: string;
  /** Highlighted React nodes produced by rehype-highlight. */
  children: React.ReactNode;
};

export default function CodeBlock({ lang, code, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.replace(/\n$/, "").split("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mt-2 bg-[#0a0a0c] border border-zinc-800/80 rounded-md overflow-hidden relative shadow-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-[#121214]/80 border-b border-zinc-800/80 backdrop-blur-sm">
        <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1.5">
          <Icon icon="solar:document-text-linear" className="text-xs" />
          {lang || "code"}
        </span>
        <button
          onClick={copy}
          className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-md hover:bg-zinc-800 flex items-center gap-1 text-[10px] font-medium"
        >
          <Icon icon={copied ? "solar:check-circle-linear" : "solar:copy-linear"} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="p-4 overflow-x-auto text-xs font-mono leading-relaxed flex bg-[#09090b]">
        <div className="flex flex-col text-zinc-700 select-none pr-4 text-right border-r border-zinc-800/50 mr-4 shrink-0">
          {lines.map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <pre className="text-zinc-300 whitespace-pre m-0 flex-1">
          <code className="hljs">{children}</code>
        </pre>
      </div>
    </div>
  );
}