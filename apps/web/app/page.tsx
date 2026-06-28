"use client";

import { useEffect } from "react";
import { useChatStore } from "../stores/chatStore";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import ChatStream from "../components/ChatStream";
import ChatInput from "../components/ChatInput";
import SettingsDrawer from "../components/SettingsDrawer";
import DesignSystem from "../components/DesignSystem";

export default function Home() {
  const init = useChatStore((s) => s.init);
  const designSystemOpen = useChatStore((s) => s.designSystemOpen);

  // One-time browser-boundary init: hydrate settings + active session from
  // sessionStorage. Runs after mount to avoid SSR/hydration mismatch.
  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="antialiased selection:bg-indigo-500/30 selection:text-indigo-100 flex h-screen w-full overflow-hidden text-sm">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 relative bg-[#09090b]">
        <Header />
        {designSystemOpen ? <DesignSystem /> : <ChatStream />}
        {!designSystemOpen ? <ChatInput /> : null}
      </main>
      <SettingsDrawer />
    </div>
  );
}