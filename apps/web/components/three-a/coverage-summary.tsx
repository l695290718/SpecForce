"use client";

import { Activity, AlertTriangle, CheckCircle2, Clock3 } from "lucide-react";
import { T } from "../language-provider";
import type { ThreeACoverageReport } from "../../lib/3a/workspace-loader";

export function CoverageSummary({ report, compact = false }: { report: ThreeACoverageReport; compact?: boolean }) {
  const manifest = report.manifest;
  const metrics = [
    ["threeA.coverageCovered", manifest?.coveredCount ?? 0, "text-emerald-700", CheckCircle2],
    ["threeA.coverageBlocked", manifest?.blockedCount ?? 0, "text-rose-700", AlertTriangle],
    ["threeA.coverageNotEvaluated", manifest?.notEvaluatedCount ?? 0, "text-amber-700", Clock3],
    ["threeA.coverageTotal", manifest?.rowCount ?? report.rows.length, "text-slate-700", Activity]
  ] as const;
  if (compact) return <section className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border bg-white px-3 py-2.5" data-testid="coverage-summary">
    <div className="mr-auto flex min-w-48 items-center gap-2"><span className={`h-2 w-2 rounded-full ${report.freshness === "CURRENT" ? "bg-emerald-500" : "bg-amber-500"}`} /><span className="text-xs font-semibold text-ink"><T k="threeA.assetMappingTitle" /></span><span className="text-[11px] text-muted"><T k={report.freshness === "CURRENT" ? "threeA.coverageCurrent" : "threeA.coverageStale"} /></span></div>
    {metrics.map(([label, value, color, Icon]) => <div key={label} className="flex items-center gap-1.5"><Icon size={14} className={color} /><strong className="font-mono text-sm text-ink">{value}</strong><span className="text-[11px] text-muted"><T k={label} /></span></div>)}
  </section>;
  return <section className="rounded-lg border border-border bg-white p-4 shadow-panel" data-testid="coverage-summary">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[11px] font-semibold uppercase text-rule"><T k="threeA.assetMappingEyebrow" /></p><h2 className="mt-1 text-lg font-semibold text-ink"><T k="threeA.assetMappingTitle" /></h2><p className="mt-1 text-sm text-muted"><T k="threeA.assetMappingDescription" /></p></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${report.freshness === "CURRENT" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" /><T k={report.freshness === "CURRENT" ? "threeA.coverageCurrent" : "threeA.coverageStale"} /></span></div>
    <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">{metrics.map(([label, value, color, Icon]) => <div key={label} className="rounded-md border border-border bg-slate-50 p-3"><div className="flex items-center justify-between"><span className="text-xs text-muted"><T k={label} /></span><Icon size={15} className={color} /></div><strong className="mt-2 block text-2xl text-ink">{value}</strong></div>)}</div>
  </section>;
}
