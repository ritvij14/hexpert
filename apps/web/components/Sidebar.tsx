"use client";

import { Icon } from "@iconify/react";
import { useChatStore } from "../stores/chatStore";

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "Yesterday";
  return `${day}d ago`;
}

export default function Sidebar() {
  const threads = useChatStore((s) => s.threads);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const newChat = useChatStore((s) => s.newChat);
  const selectThread = useChatStore((s) => s.selectThread);
  const deleteThread = useChatStore((s) => s.deleteThread);
  const openDesignSystem = useChatStore((s) => s.openDesignSystem);
  const designSystemOpen = useChatStore((s) => s.designSystemOpen);

  return (
    <aside className="w-64 border-r border-zinc-800/60 bg-[#09090b] hidden md:flex flex-col z-20 shrink-0 relative">
      <div className="p-4 border-b border-transparent shrink-0">
        <button
          onClick={newChat}
          className="w-full flex items-center justify-center gap-2 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 rounded-md py-1.5 px-3 text-sm font-medium transition-colors shadow-sm shadow-indigo-500/5"
        >
          <Icon icon="solar:pen-new-square-linear" className="text-base" />
          New chat
        </button>
      </div>

      <div className="px-3 pb-2 pt-1 text-[10px] font-semibold text-zinc-500 uppercase tracking-widest shrink-0">
        Threads
      </div>

      <nav className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-4">
        {threads.length === 0 ? (
          <div className="text-[10px] text-zinc-600 px-2 py-4 text-center">No threads yet</div>
        ) : (
          threads.map((t) => {
            const active = t.sessionId === activeSessionId && !designSystemOpen;
            return (
              <button
                key={t.sessionId}
                onClick={() => selectThread(t.sessionId)}
                className={`w-full flex flex-col gap-1 p-2 rounded-md text-left relative group transition-colors ${
                  active
                    ? "bg-zinc-900 text-zinc-100 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-500 before:rounded-r-full"
                    : "hover:bg-zinc-900/50 text-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between min-w-0">
                  <span className="truncate text-xs font-medium pl-1">{t.title}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteThread(t.sessionId);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        deleteThread(t.sessionId);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity p-0.5"
                  >
                    <Icon icon="solar:close-circle-linear" />
                  </span>
                </div>
                <span className="text-[10px] text-zinc-600 pl-1">{relativeTime(t.lastActivity)}</span>
              </button>
            );
          })
        )}
      </nav>

      <div className="p-3 border-t border-zinc-800/60 mt-auto shrink-0 bg-[#09090b]">
        <button
          onClick={() => openDesignSystem(!designSystemOpen)}
          className={`w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors group relative overflow-hidden ${
            designSystemOpen ? "text-indigo-300 bg-zinc-800/50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
          }`}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          <Icon icon="solar:palette-linear" className="text-lg group-hover:text-indigo-400 transition-colors relative z-10" />
          <span className="relative z-10">Design System &amp; Docs</span>
        </button>
      </div>
    </aside>
  );
}