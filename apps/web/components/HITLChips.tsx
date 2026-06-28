"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import { useChatStore } from "../stores/chatStore";
import { FULL_SUMMARY, joinSelection } from "../lib/hitl";

type HITLChipsProps = {
  options: string[];
  multi: boolean;
};

export default function HITLChips({ options, multi }: HITLChipsProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const streaming = useChatStore((s) => s.streaming);

  const toggle = (opt: string) => {
    if (!multi) {
      setSelected([opt]);
      return;
    }
    // Multi-select with "Full summary" exclusivity.
    if (opt === FULL_SUMMARY) {
      setSelected([FULL_SUMMARY]);
      return;
    }
    setSelected((cur) => {
      if (cur.includes(opt)) return cur.filter((o) => o !== opt);
      const next = cur.filter((o) => o !== FULL_SUMMARY);
      return [...next, opt];
    });
  };

  const send = () => {
    if (selected.length === 0) return;
    const message = joinSelection(selected);
    setSelected([]);
    void sendMessage(message, null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-1">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            disabled={streaming}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors shadow-sm flex items-center gap-1.5 disabled:opacity-50 ${
              active
                ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300 ring-1 ring-indigo-500/20"
                : "border-zinc-700/80 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {active ? <Icon icon="solar:check-circle-linear" className="text-indigo-400" /> : null}
            {opt}
          </button>
        );
      })}
      <button
        onClick={send}
        disabled={selected.length === 0 || streaming}
        className="ml-1 px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-100 text-zinc-950 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-100 transition-colors shadow-sm flex items-center gap-1.5"
      >
        {multi ? "Send reply" : "Send"}
        <Icon icon="solar:arrow-up-linear" />
      </button>
    </div>
  );
}