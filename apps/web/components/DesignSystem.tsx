"use client";

import { Icon } from "@iconify/react";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-zinc-100 border-b border-zinc-800/80 pb-3 uppercase tracking-wider">
      {children}
    </h2>
  );
}

export default function DesignSystem() {
  return (
    <div className="absolute inset-0 overflow-y-auto bg-[#09090b] z-0 pt-20 pb-20 px-4 md:px-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-16 w-full">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-zinc-100">
            Design System &amp; Component UI Kit
          </h1>
          <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-2xl">
            A comprehensive library of all UI components, typography, and colors used across Hexpert&apos;s threads.
            Built entirely with Tailwind CSS utilities.
          </p>
        </div>

        <section className="flex flex-col gap-6">
          <SectionTitle>1. Foundations: Colors</SectionTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-[#09090b] border border-zinc-800 flex flex-col justify-end h-28">
              <div className="text-xs text-zinc-500 mb-1 font-medium">App Background</div>
              <div className="text-xs font-mono text-zinc-300">bg-[#09090b]</div>
              <div className="text-[10px] font-mono text-zinc-500">zinc-950 equivalent</div>
            </div>
            <div className="p-4 rounded-xl bg-[#121214] border border-zinc-800 flex flex-col justify-end h-28">
              <div className="text-xs text-zinc-500 mb-1 font-medium">Surface / Card</div>
              <div className="text-xs font-mono text-zinc-300">bg-[#121214]</div>
              <div className="text-[10px] font-mono text-zinc-500">zinc-900 variant</div>
            </div>
            <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col justify-end h-28">
              <div className="text-xs text-zinc-500 mb-1 font-medium">Elevated / Bubble</div>
              <div className="text-xs font-mono text-zinc-300">bg-zinc-900</div>
            </div>
            <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col justify-end h-28 relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-indigo-500" />
              <div className="text-xs text-indigo-400 mb-1 font-medium">Primary Active</div>
              <div className="text-xs font-mono text-indigo-300">indigo-500/10</div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 flex items-center gap-3">
              <div className="size-4 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]" />
              <div>
                <div className="text-xs font-medium text-emerald-400">Success / ETH</div>
                <div className="text-[10px] font-mono text-emerald-500/70">emerald-500</div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-3">
              <div className="size-4 rounded-full bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.4)]" />
              <div>
                <div className="text-xs font-medium text-amber-400">Warning / Medium</div>
                <div className="text-[10px] font-mono text-amber-500/70">amber-500</div>
              </div>
            </div>
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-3">
              <div className="size-4 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]" />
              <div>
                <div className="text-xs font-medium text-red-400">Danger / High Risk</div>
                <div className="text-[10px] font-mono text-red-500/70">red-500</div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle>2. Foundations: Typography</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[#121214] p-6 rounded-xl border border-zinc-800/80 shadow-sm flex flex-col gap-5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">UI Font: Inter</div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">text-2xl / semibold / tracking-tight</div>
                  <div className="text-2xl font-semibold tracking-tight text-zinc-100">Page Header</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">text-sm / normal / leading-relaxed</div>
                  <div className="text-sm text-zinc-300 leading-relaxed">
                    Primary body text used for chat messages and general reading.
                  </div>
                </div>
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">text-xs / font-medium</div>
                  <div className="text-xs font-medium text-zinc-400">Secondary text for smaller labels and hints.</div>
                </div>
              </div>
            </div>
            <div className="bg-[#121214] p-6 rounded-xl border border-zinc-800/80 shadow-sm flex flex-col gap-5">
              <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                Code &amp; Data: Geist Mono
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">text-[10px] / uppercase / tracking-widest</div>
                  <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">Metadata Label</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">text-xs / normal</div>
                  <div className="text-xs font-mono text-emerald-400/80">0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045</div>
                </div>
                <div>
                  <div className="text-xs font-mono text-zinc-500 mb-1">Inline Code Snippet</div>
                  <div className="text-xs font-mono text-zinc-300 bg-[#09090b] px-2 py-1 rounded border border-zinc-800 inline-block">
                    function execute()
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle>3. Components: Chat Elements</SectionTitle>
          <div className="bg-black/20 p-6 rounded-xl border border-zinc-800/40 border-dashed flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">User Message Bubble</div>
              <div className="self-start max-w-[85%] bg-zinc-900 rounded-xl rounded-tl-sm px-4 py-3 text-sm text-zinc-200 border border-zinc-800/50 shadow-sm leading-relaxed">
                Can you take a look at vitalik.eth?
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">User Message with Attachment</div>
              <div className="self-start flex flex-col gap-2">
                <div className="self-start inline-flex items-center gap-2 bg-zinc-900/80 px-2.5 py-1.5 rounded-md border border-zinc-800 shadow-sm w-max mb-1">
                  <Icon icon="solar:file-code-linear" className="text-indigo-400 text-sm" />
                  <span className="text-xs font-mono text-zinc-300">Reentrancy.sol</span>
                </div>
                <div className="bg-zinc-900 rounded-xl rounded-tl-sm px-4 py-3 text-sm text-zinc-200 border border-zinc-800/50 shadow-sm leading-relaxed">
                  Now audit this contract I&apos;m working on.
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">AI Response Headers (Tags)</div>
              <div className="flex gap-3">
                {["Wallet", "Audit", "Explanation"].map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-sm bg-zinc-800/50 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400 uppercase tracking-widest border border-zinc-700/50 select-none"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle>4. Components: Structured Data Cards</SectionTitle>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">Wallet Profile Card</div>
              <div className="w-full bg-[#121214] border border-zinc-800/80 rounded-lg p-5 flex flex-col gap-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-emerald-500/20 border border-zinc-700/80 flex items-center justify-center shrink-0">
                    <Icon icon="solar:wallet-linear" className="text-zinc-300 text-lg" />
                  </div>
                  <div>
                    <div className="font-medium text-sm text-zinc-100 flex items-center gap-2">
                      vitalik.eth
                      <Icon icon="solar:check-circle-linear" className="text-emerald-500 text-xs" />
                    </div>
                    <div className="font-mono text-xs text-emerald-400/80 mt-0.5">0xd8dA6…96045</div>
                  </div>
                </div>
                <div className="h-px w-full bg-zinc-800/60" />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">ETH Balance</span>
                    <span className="font-mono text-zinc-300 text-xs">845.21 ETH</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">ERC20 Value</span>
                    <span className="font-mono text-zinc-300 text-xs">$1.2M+</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">Audit Findings List</div>
              <div className="w-full bg-[#121214] border border-zinc-800/80 rounded-lg overflow-hidden shadow-sm">
                <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500 text-white uppercase tracking-wider shadow-sm shadow-red-500/20">
                      High Risk
                    </span>
                  </div>
                  <span className="text-xs text-zinc-500 font-mono">1 Finding</span>
                </div>
                <div className="flex flex-col divide-y divide-zinc-800/60">
                  <div className="p-4 flex gap-3.5">
                    <div className="mt-0.5 shrink-0">
                      <div className="size-2 rounded-full bg-red-500 ring-2 ring-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="text-sm font-medium text-zinc-200 truncate">Reentrancy in withdraw()</div>
                        <div className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                          L42-55
                        </div>
                      </div>
                      <div className="text-xs text-zinc-400 leading-relaxed pr-4">
                        State variable updates occur after external call.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <SectionTitle>5. Components: Controls &amp; Interactive Elements</SectionTitle>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">Buttons</div>
              <button className="w-full bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-sm py-2.5 rounded-md transition-colors shadow-sm">
                Primary Action
              </button>
              <button className="w-full flex items-center justify-center gap-2 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 rounded-md py-2 px-3 text-sm font-medium transition-colors shadow-sm">
                <Icon icon="solar:pen-new-square-linear" className="text-base" />
                Secondary Outline
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div className="text-[10px] font-mono text-zinc-500 mb-1">Human-in-the-Loop (HITL) Chips</div>
              <div className="flex flex-wrap gap-2">
                <button className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700/80 text-zinc-300 hover:bg-zinc-800 transition-colors shadow-sm">
                  Default Option
                </button>
                <button className="px-3 py-1.5 text-xs font-medium rounded-md border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 flex items-center gap-1.5 ring-1 ring-indigo-500/20 shadow-sm">
                  <Icon icon="solar:check-circle-linear" className="text-indigo-400" />
                  Selected Option
                </button>
                <button className="px-3 py-1.5 text-xs font-medium rounded-md border border-zinc-700/50 text-zinc-500 opacity-60 pointer-events-none flex items-center gap-1.5">
                  <Icon icon="solar:check-circle-linear" className="text-zinc-500" />
                  Disabled
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}