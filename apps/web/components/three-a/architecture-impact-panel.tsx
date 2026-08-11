"use client";

import type { ImpactArchitectureResult } from "@specforge/knowledge-query";
import { AlertTriangle, Gauge, Route } from "lucide-react";
import { T } from "../language-provider";

export function ArchitectureImpactPanel({ result, loading, error }: { result?: ImpactArchitectureResult; loading: boolean; error?: string }) {
  if (loading) return <section className="rounded-lg border border-border bg-white p-4 text-sm text-muted shadow-panel" data-testid="architecture-impact-panel"><T k="threeA.loadingImpact" /></section>;
  if (error) return <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" data-testid="architecture-impact-panel"><AlertTriangle className="mr-2 inline-block" size={16} />{error}</section>;
  if (!result) return <section className="rounded-lg border border-border bg-white p-4 text-sm text-muted shadow-panel" data-testid="architecture-impact-panel"><T k="threeA.selectImpactFocus" /></section>;
  return <section className="rounded-lg border border-border bg-white p-4 shadow-panel" data-testid="architecture-impact-panel">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-rule"><T k="threeA.impactAnalysis" /></p><h2 className="mt-1 text-base font-semibold text-ink"><T k="threeA.impactFor" /> <span className="font-mono text-sm">{result.focusAssertionId}</span></h2></div>
      <span className="inline-flex items-center gap-1 rounded-full bg-chrome px-2 py-1 text-xs font-semibold text-muted"><Gauge size={14} />{result.policyVersion}</span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-4">
      {(["DIRECT", "LIKELY", "EXTENDED", "UNRESOLVED"] as const).map((band) => <div className="rounded-md border border-border bg-chrome p-3" key={band}><p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{band}</p><p className="mt-1 text-xl font-semibold text-ink">{result.countsByBand[band]}</p></div>)}
    </div>
    <div className="mt-4 grid gap-2 text-sm text-muted sm:grid-cols-2"><p><Route className="mr-2 inline-block text-accent" size={15} />{result.items.length} <T k="threeA.impactItems" /></p><p><T k="threeA.impactPaths" /> {result.paths.length}</p></div>
    {result.partial ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800"><T k="threeA.partialGraph" /></p> : null}
  </section>;
}
