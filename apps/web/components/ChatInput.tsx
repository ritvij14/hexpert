"use client";

import { useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useChatStore } from "../stores/chatStore";
import { readSolText, validateSolFile, type SolFile } from "../lib/file";

export default function ChatInput() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<SolFile | null>(null);
  const [error, setError] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sendMessage = useChatStore((s) => s.sendMessage);
  const stopStream = useChatStore((s) => s.stopStream);
  const streaming = useChatStore((s) => s.streaming);
  const configured = useChatStore((s) => s.configured);
  const openSettings = useChatStore((s) => s.openSettings);

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };

  const submit = () => {
    if (streaming) return;
    if (!configured) {
      openSettings(true);
      return;
    }
    const t = text.trim();
    if (!t && !file) return;
    void sendMessage(t, file);
    setText("");
    setFile(null);
    setError("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    const result = validateSolFile(picked);
    if (!result.ok) {
      setError(result.error);
      setFile(null);
      return;
    }
    try {
      const content = await readSolText(picked);
      setFile({ name: picked.name, content });
      setError("");
    } catch {
      setError("Could not read the file.");
    }
  };

  return (
    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#09090b] via-[#09090b] to-transparent pt-10 pb-6 px-4 md:px-8 pointer-events-none z-10">
      <div className="max-w-3xl mx-auto pointer-events-auto flex flex-col relative">
        {file ? (
          <div className="mb-2 inline-flex self-start items-center gap-2 bg-zinc-900 px-2.5 py-1.5 rounded-md border border-zinc-800 shadow-sm">
            <Icon icon="solar:file-code-linear" className="text-indigo-400 text-sm" />
            <span className="text-xs font-mono text-zinc-300">{file.name}</span>
            <button
              onClick={() => setFile(null)}
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <Icon icon="solar:close-circle-linear" />
            </button>
          </div>
        ) : null}
        <div className="bg-[#121214] border border-zinc-800/80 rounded-xl shadow-2xl focus-within:border-indigo-500/40 focus-within:ring-1 focus-within:ring-indigo-500/10 transition-all flex flex-col relative">
          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={configured ? "Message Hexpert or attach a .sol file..." : "Complete setup in Settings to start chatting..."}
            className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 border-none focus:ring-0 resize-none py-3.5 px-4 max-h-32 outline-none scroll-smooth"
          />
          <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/50 bg-[#121214]/50 rounded-b-xl">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 rounded-md transition-colors flex items-center justify-center relative group"
              aria-label="Attach .sol file"
            >
              <Icon icon="solar:paperclip-linear" className="text-[20px]" />
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-800 text-zinc-200 text-[10px] font-medium px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-zinc-700">
                Attach .sol
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sol"
              onChange={onPickFile}
              className="hidden"
            />
            {streaming ? (
              <button
                onClick={stopStream}
                className="bg-zinc-100 hover:bg-white text-zinc-950 p-1.5 rounded-lg transition-colors shadow-sm flex items-center justify-center"
                aria-label="Stop"
              >
                <Icon icon="solar:stop-square-linear" className="text-[20px]" />
              </button>
            ) : (
              <button
                onClick={submit}
                className="bg-zinc-100 hover:bg-white text-zinc-950 p-1.5 rounded-lg transition-colors shadow-sm flex items-center justify-center group disabled:opacity-40"
                disabled={!text.trim() && !file}
                aria-label="Send"
              >
                <Icon icon="solar:arrow-up-linear" className="text-[20px] group-active:translate-y-[-1px] transition-transform" />
              </button>
            )}
          </div>
        </div>
        {error ? (
          <div className="text-[10px] text-red-400 mt-2 px-1">{error}</div>
        ) : (
          <div className="text-center mt-3 mb-1">
            <span className="text-[10px] text-zinc-500 font-medium tracking-wide">
              Hexpert is an AI teaching tool. Always verify on-chain data and audit findings.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}