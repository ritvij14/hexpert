"use client";

import { Icon } from "@iconify/react";
import type { AuditFinding, AuditReport, AuditSeverity } from "@hexpert/shared";

const SEVERITY_ORDER: AuditSeverity[] = ["high", "medium", "low", "info"];

const SEVERITY_META: Record<
  AuditSeverity,
  { label: string; badge: string; dot: string; ring: string }
> = {
  high: {
    label: "High Risk",
    badge: "bg-red-500 text-white shadow-sm shadow-red-500/20",
    dot: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]",
    ring: "ring-red-500/20",
  },
  medium: {
    label: "Medium Risk",
    badge: "bg-amber-500 text-white shadow-sm shadow-amber-500/20",
    dot: "bg-amber-500",
    ring: "ring-amber-500/20",
  },
  low: {
    label: "Low Risk",
    badge: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/20",
    dot: "bg-emerald-500",
    ring: "ring-emerald-500/20",
  },
  info: {
    label: "Info",
    badge: "bg-zinc-600 text-white",
    dot: "bg-zinc-500",
    ring: "ring-zinc-500/20",
  },
};

function FindingRow({ finding }: { finding: AuditFinding }) {
  const meta = SEVERITY_META[finding.severity];
  return (
    <div className="p-4 flex gap-3.5 hover:bg-zinc-800/20 transition-colors">
      <div className="mt-0.5 shrink-0">
        <div className={`size-2 rounded-full ${meta.dot} ring-2 ${meta.ring}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="text-sm font-medium text-zinc-200 truncate">{finding.title}</div>
          {finding.lineReference ? (
            <div className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800 shrink-0">
              {finding.lineReference}
            </div>
          ) : null}
        </div>
        {finding.description ? (
          <div className="text-xs text-zinc-400 leading-relaxed pr-4">{finding.description}</div>
        ) : null}
      </div>
    </div>
  );
}

function SeverityCard({ severity, findings }: { severity: AuditSeverity; findings: AuditFinding[] }) {
  if (findings.length === 0) return null;
  const meta = SEVERITY_META[severity];
  return (
    <div className="w-full bg-[#121214] border border-zinc-800/80 rounded-lg overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${meta.badge}`}>
            {meta.label}
          </span>
        </div>
        <span className="text-xs text-zinc-500 font-mono">
          {findings.length} {findings.length === 1 ? "Finding" : "Findings"}
        </span>
      </div>
      <div className="flex flex-col divide-y divide-zinc-800/60">
        {findings.map((f, i) => (
          <FindingRow key={i} finding={f} />
        ))}
      </div>
    </div>
  );
}

export default function AuditReportView({ report }: { report: AuditReport }) {
  const grouped = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    findings: report.findings.filter((f) => f.severity === sev),
  }));
  const total = report.findings.length;
  const overall = SEVERITY_META[report.overallRisk as AuditSeverity] ?? SEVERITY_META.info;

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full bg-[#121214] border border-zinc-800/80 rounded-lg overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-zinc-800/60 bg-zinc-900/30 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${overall.badge}`}>
              {overall.label}
            </span>
            <span className="text-sm font-medium text-zinc-200">
              {report.contractName ? `${report.contractName} Scan` : "Audit Scan"}
            </span>
          </div>
          <span className="text-xs text-zinc-500 font-mono">
            {total} {total === 1 ? "Finding" : "Findings"}
          </span>
        </div>
        {report.summary ? (
          <div className="px-4 py-3 text-xs text-zinc-400 leading-relaxed border-b border-zinc-800/60">
            {report.summary}
          </div>
        ) : null}
      </div>
      {grouped.map((g) => (
        <SeverityCard key={g.severity} severity={g.severity} findings={g.findings} />
      ))}
      {total === 0 ? (
        <div className="w-full bg-[#121214] border border-emerald-500/20 rounded-lg p-5 flex items-center gap-3">
          <Icon icon="solar:check-circle-linear" className="text-emerald-500 text-lg" />
          <span className="text-sm text-zinc-300">No issues found in this contract.</span>
        </div>
      ) : null}
    </div>
  );
}