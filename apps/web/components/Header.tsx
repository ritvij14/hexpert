"use client";

import { Icon } from "@iconify/react";
import { useChatStore } from "../stores/chatStore";

export default function Header() {
  const openSettings = useChatStore((s) => s.openSettings);
  const settingsOpen = useChatStore((s) => s.settingsOpen);
  const designSystemOpen = useChatStore((s) => s.designSystemOpen);
  const openDesignSystem = useChatStore((s) => s.openDesignSystem);

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md absolute top-0 w-full z-10">
      <div className="flex items-center gap-3">
        <button
          className="md:hidden text-zinc-400 hover:text-zinc-200"
          onClick={() => openDesignSystem(false)}
          aria-label="Menu"
        >
          <Icon icon="solar:hamburger-menu-linear" className="text-xl" />
        </button>
        <button
          onClick={() => openDesignSystem(false)}
          className="tracking-tighter font-semibold text-base md:text-lg text-zinc-100 select-none flex items-center gap-2"
        >
          HEXPERT
          {designSystemOpen ? (
            <span className="text-xs font-medium text-zinc-500 tracking-normal px-2 py-0.5 rounded-full border border-zinc-800 bg-zinc-900/50">
              Design System
            </span>
          ) : null}
        </button>
      </div>
      <button
        onClick={() => openSettings(!settingsOpen)}
        className={`p-1.5 rounded-md transition-colors flex items-center gap-2 ${
          settingsOpen ? "text-zinc-200 bg-zinc-800/50" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50"
        }`}
      >
        <Icon icon="solar:settings-linear" className="text-lg" />
        <span className="text-xs font-medium hidden sm:inline-block">Settings</span>
      </button>
    </header>
  );
}