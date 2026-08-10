"use client";

import React from "react";
import { ChevronDown, Columns3, List, Route, Waypoints } from "lucide-react";
import Link from "next/link";
import { T } from "../language-provider";
import type { ThreeAUrlState } from "../../lib/3a/url-state";

export interface BaselineOption { id: string; publishedAt: string; status: string; }
export interface ManifestOption { id: string; profileVersion: string; publishedAt: string; }

export function BaselineToolbar({ state, baselines, manifests }: { state: ThreeAUrlState; baselines: BaselineOption[]; manifests: ManifestOption[] }) {
  const href = (changes: Partial<ThreeAUrlState>) => {
    const next = { ...state, ...changes };
    const params = new URLSearchParams({ scope: next.scope, tab: next.tab, mode: next.mode, direction: next.direction });
    if (next.baseline) params.set("baseline", next.baseline);
    if (next.projection) params.set("projection", next.projection);
    if (next.focus) params.set("focus", next.focus);
    return `/architecture/3a?${params.toString()}`;
  };
  return <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 shadow-panel lg:flex-row lg:items-end lg:justify-between">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted"><span><T k="threeA.baseline" /></span><span className="relative"><select aria-label="Baseline" className="h-9 w-full min-w-56 appearance-none rounded-md border border-border bg-white px-3 pr-8 text-sm font-medium normal-case text-ink" value={state.baseline ?? ""} onChange={(event) => { window.location.href = href({ baseline: event.target.value || undefined, projection: undefined, focus: undefined }); }}><option value=""><T k="threeA.selectBaseline" /></option>{baselines.map((baseline) => <option key={baseline.id} value={baseline.id}>{baseline.id} · {baseline.status}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted" size={15} /></span></label>
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted"><span><T k="threeA.projection" /></span><span className="relative"><select aria-label="Projection manifest" className="h-9 w-full min-w-56 appearance-none rounded-md border border-border bg-white px-3 pr-8 text-sm font-medium normal-case text-ink" value={state.projection ?? ""} onChange={(event) => { window.location.href = href({ projection: event.target.value || undefined, focus: undefined }); }}><option value=""><T k="threeA.selectProjection" /></option>{manifests.map((manifest) => <option key={manifest.id} value={manifest.id}>{manifest.id} · v{manifest.profileVersion}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted" size={15} /></span></label>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-border bg-chrome p-1" aria-label="Architecture view mode"><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${state.mode === "lanes" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ mode: "lanes" })}><Columns3 size={14} /><T k="threeA.lanes" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${state.mode === "list" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ mode: "list" })}><List size={14} /><T k="threeA.list" /></Link></div>
      <div className="inline-flex rounded-md border border-border bg-chrome p-1" aria-label="Trace direction"><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${state.direction === "both" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ direction: "both" })}><Waypoints size={14} /><T k="threeA.both" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${state.direction === "upstream" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ direction: "upstream" })}><Route size={14} /><T k="threeA.upstream" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${state.direction === "downstream" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ direction: "downstream" })}><Route className="rotate-180" size={14} /><T k="threeA.downstream" /></Link></div>
    </div>
  </div>;
}
