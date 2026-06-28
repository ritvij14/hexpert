"use client";

import { Icon } from "@iconify/react";
import type { UiMessage } from "../stores/chatStore";
import type { Intent } from "@hexpert/shared";
import Markdown from "./Markdown";
import HITLChips from "./HITLChips";
import AuditReportView from "./AuditReportView";
import WalletProfileView from "./WalletProfileView";
import WebSearchActivity from "./WebSearchActivity";

const INTENT_TAG: Record<Intent, string> = {
  wallet: "Wallet",
  audit: "Audit",
  qna: "Q&A",
};

function ToolPills({ msg }: { msg: UiMessage }) {
  if (!msg.toolCalls || msg.toolCalls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {msg.toolCalls.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="inline-flex items-center gap-1.5 bg-zinc-800/50 px-2 py-0.5 rounded-sm border border-zinc-700/50 text-[10px] font-mono text-zinc-400 uppercase tracking-widest select-none"
        >
          {msg.streaming ? "running: " : ""}
          {name}
        </span>
      ))}
    </div>
  );
}

function MetaFooter({ msg }: { msg: UiMessage }) {
  if (!msg.meta) return null;
  const tokens = msg.meta.tokensUsed.input + msg.meta.tokensUsed.output;
  const secs = (msg.meta.latencyMs / 1000).toFixed(1);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10px] font-mono text-zinc-600 uppercase tracking-widest">
      {tokens > 0 ? <span>{tokens} tokens</span> : null}
      <span>{secs}s</span>
      {msg.meta.toolCallCount > 0 ? <span>{msg.meta.toolCallCount} tool calls</span> : null}
    </div>
  );
}

export default function MessageBubble({ msg }: { msg: UiMessage }) {
  if (msg.role === "user") {
    return (
      <div className="self-end max-w-[85%] sm:max-w-[75%] flex flex-col gap-2 items-end">
        {msg.fileName ? (
          <div className="inline-flex items-center gap-2 bg-zinc-900/80 px-2.5 py-1.5 rounded-md border border-zinc-800 shadow-sm w-max mb-1">
            <Icon icon="solar:file-code-linear" className="text-indigo-400 text-sm" />
            <span className="text-xs font-mono text-zinc-300">{msg.fileName}</span>
          </div>
        ) : null}
        {msg.content ? (
          <div className="bg-zinc-900 rounded-xl rounded-tr-sm px-4 py-3 text-sm text-zinc-200 border border-zinc-800/50 shadow-sm leading-relaxed whitespace-pre-wrap break-words">
            {msg.content}
          </div>
        ) : null}
      </div>
    );
  }

  // Assistant
  const showCursor = msg.streaming && !msg.error;
  const intent = msg.intent ?? msg.intentHint;
  return (
    <div className="self-start w-full flex flex-col gap-3 group">
      {intent ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-sm bg-zinc-800/50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 uppercase tracking-widest border border-zinc-700/50 select-none">
            {INTENT_TAG[intent]}
          </span>
        </div>
      ) : null}

      <ToolPills msg={msg} />

      {msg.webSearches?.length ? <WebSearchActivity searches={msg.webSearches} /> : null}

      {msg.walletProfile ? <WalletProfileView profile={msg.walletProfile} /> : null}

      {msg.content ? <Markdown>{msg.content}</Markdown> : null}
      {showCursor && !msg.content ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span className="stream-cursor" />
        </div>
      ) : null}
      {showCursor && msg.content ? <span className="stream-cursor" /> : null}

      {msg.auditReport ? <AuditReportView report={msg.auditReport} /> : null}

      {msg.hitl ? (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-zinc-300 pl-1">{msg.hitl.question}</div>
          <HITLChips options={msg.hitl.options} multi={msg.hitl.multi} />
        </div>
      ) : null}

      {msg.error ? (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {msg.error}
        </div>
      ) : null}

      <MetaFooter msg={msg} />
    </div>
  );
}