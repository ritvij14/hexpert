"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { useChatStore, selectActiveThread } from "../stores/chatStore";
import MessageBubble from "./MessageBubble";

const SUGGESTIONS = [
  "What is Ethereum gas?",
  "What is EIP-4844?",
  "Analyze vitalik.eth",
  "What is a reentrancy attack?",
];

export default function ChatStream() {
  const thread = useChatStore(selectActiveThread);
  const configured = useChatStore((s) => s.configured);
  const openSettings = useChatStore((s) => s.openSettings);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new content, but only if the user is already
  // near the bottom (don't fight manual scroll-up). Browser-boundary effect.
  const lastLen = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const messages = thread?.messages ?? [];
    const last = messages[messages.length - 1];
    const len = last ? last.content.length + messages.length : 0;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (nearBottom || len < lastLen.current) {
      el.scrollTop = el.scrollHeight;
    }
    lastLen.current = len;
  }, [thread?.messages]);

  if (!thread || thread.messages.length === 0) {
    return (
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 pt-20 pb-56">
        <div className="max-w-3xl mx-auto h-full flex flex-col items-center justify-center text-center gap-6">
          <div className="size-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-zinc-700/80 flex items-center justify-center">
            <Icon icon="solar:chat-round-dots-linear" className="text-2xl text-zinc-300" />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-zinc-100">Ask Hexpert</h2>
            <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
              An Ethereum AI assistant. Ask a question, analyze a wallet, or attach a{" "}
              <span className="font-mono text-zinc-300">.sol</span> file to audit.
            </p>
          </div>
          {!configured ? (
            <button
              onClick={() => openSettings(true)}
              className="bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm py-2.5 px-4 rounded-md transition-colors shadow-sm flex items-center gap-2"
            >
              <Icon icon="solar:settings-linear" />
              Complete setup
            </button>
          ) : (
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => void sendMessage(s, null)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700/80 text-zinc-300 hover:bg-zinc-800 transition-colors shadow-sm"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <p className="text-[10px] text-zinc-600 font-medium tracking-wide max-w-sm">
            We remember your conversations, never your credentials. Keys are cleared when you close this tab.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-8 pt-20 pb-56 scroll-smooth">
      <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
        {thread.messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
      </div>
    </div>
  );
}