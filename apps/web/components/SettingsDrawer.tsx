"use client";

import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { useChatStore } from "../stores/chatStore";
import type { Provider } from "@hexpert/shared";

const PROVIDERS: { value: Provider; label: string }[] = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama" },
];

const PROVIDER_MODEL_HINTS: Record<Provider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  openrouter: "anthropic/claude-3.5-sonnet",
  ollama: "llama3.1",
};

function SecretInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2.5">
      <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{label}</label>
      <div className="relative group">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-[#121214] border border-zinc-800/80 rounded-md py-2.5 pl-3 pr-10 text-sm text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
        />
        <button
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1.5 rounded-md hover:bg-zinc-800/80 transition-colors"
          aria-label={show ? "Hide" : "Show"}
        >
          <Icon icon={show ? "solar:eye-closed-linear" : "solar:eye-linear"} className="text-base" />
        </button>
      </div>
    </div>
  );
}

export default function SettingsDrawer() {
  const open = useChatStore((s) => s.settingsOpen);
  const openSettings = useChatStore((s) => s.openSettings);
  const saveSettings = useChatStore((s) => s.saveSettings);

  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [searchKey, setSearchKey] = useState("");

  // Sync the form from the (sessionStorage-backed) store whenever the drawer
  // opens — init() may not have run at mount time.
  useEffect(() => {
    if (!open) return;
    const s = useChatStore.getState();
    setProvider(s.provider);
    setApiKey(s.apiKey);
    setModel(s.model);
    setSearchKey(s.searchKey);
  }, [open]);

  return (
    <>
      <div
        onClick={() => openSettings(false)}
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-[400px] bg-[#09090b] border-l border-zinc-800/80 z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-800/60 bg-[#121214]/50">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
            <Icon icon="solar:settings-linear" className="text-zinc-400" /> Configuration
          </h2>
          <button
            onClick={() => openSettings(false)}
            className="text-zinc-500 hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-800/80 transition-colors"
          >
            <Icon icon="solar:close-square-linear" className="text-xl" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-7 scroll-smooth">
          <div className="space-y-2.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Provider</label>
            <div className="grid grid-cols-2 gap-1.5 bg-[#121214] p-1.5 rounded-lg border border-zinc-800/80 shadow-inner">
              {PROVIDERS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setProvider(p.value)}
                  className={`text-xs font-medium py-2 rounded-md transition-all border ${
                    provider === p.value
                      ? "bg-zinc-800 text-zinc-100 border-zinc-700/80 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 border-transparent"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">Model</label>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={PROVIDER_MODEL_HINTS[provider]}
              className="w-full bg-[#121214] border border-zinc-800/80 rounded-md py-2.5 px-3 text-sm text-zinc-200 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
            />
          </div>

          <SecretInput label="LLM API Key" value={apiKey} onChange={setApiKey} placeholder="sk-..." />
          <SecretInput label="Tavily Search Key" value={searchKey} onChange={setSearchKey} placeholder="tvly-..." />

          <p className="text-xs text-zinc-500 leading-relaxed">
            Your keys are sent over HTTPS and never stored on our servers. They are cleared when you close this tab.
          </p>
        </div>

        <div className="p-6 border-t border-zinc-800/60 bg-[#121214]/50 shrink-0">
          <button
            onClick={() => saveSettings({ provider, apiKey, model, searchKey })}
            className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm py-2.5 rounded-md transition-colors shadow-sm flex items-center justify-center gap-2"
          >
            Save configuration
          </button>
        </div>
      </div>
    </>
  );
}