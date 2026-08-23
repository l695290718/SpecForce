"use client";

import React from "react";
import { ChevronDown, Columns3, List, Network, Route, Waypoints } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { T } from "../language-provider";
import { parseThreeAUrlState, serializeThreeAUrlState, type ThreeAUrlState } from "../../lib/3a/url-state";

export interface BaselineOption { id: string; publishedAt: string; status: string; }
export interface ManifestOption { id: string; profileVersion: string; publishedAt: string; }

export function BaselineToolbar({ state, baselines, manifests }: { state: ThreeAUrlState; baselines: BaselineOption[]; manifests: ManifestOption[] }) {
  const [liveState, setLiveState] = React.useState(state);
  const router = useRouter();
  React.useEffect(() => {
    const sync = () => setLiveState(parseThreeAUrlState(new URLSearchParams(window.location.search)));
    sync();
    window.addEventListener("three-a-url-state-change", sync);
    return () => window.removeEventListener("three-a-url-state-change", sync);
  }, [state]);
  const href = (changes: Partial<ThreeAUrlState>) => {
    const next = { ...liveState, ...changes };
    return `/architecture/3a?${serializeThreeAUrlState(next)}`;
  };
  const navigate = (changes: Partial<ThreeAUrlState>) => { router.push(href(changes), { scroll: false }); };
  return <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 shadow-panel lg:flex-row lg:items-end lg:justify-between">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted"><span><T k="threeA.baseline" /></span><span className="relative"><select aria-label="Baseline" className="h-9 w-full min-w-56 appearance-none rounded-md border border-border bg-white px-3 pr-8 text-sm font-medium normal-case text-ink" value={liveState.baseline ?? ""} onChange={(event) => { navigate({ baseline: event.target.value || undefined, projection: undefined, focus: undefined }); }}><option value=""><T k="threeA.selectBaseline" /></option>{baselines.map((baseline) => <option key={baseline.id} value={baseline.id}>{baseline.id} · {baseline.status}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted" size={15} /></span></label>
      <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted"><span><T k="threeA.projection" /></span><span className="relative"><select aria-label="Projection manifest" className="h-9 w-full min-w-56 appearance-none rounded-md border border-border bg-white px-3 pr-8 text-sm font-medium normal-case text-ink" value={liveState.projection ?? ""} onChange={(event) => { navigate({ projection: event.target.value || undefined, focus: undefined }); }}><option value=""><T k="threeA.selectProjection" /></option>{manifests.map((manifest) => <option key={manifest.id} value={manifest.id}>{manifest.id} · v{manifest.profileVersion}</option>)}</select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 text-muted" size={15} /></span></label>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-border bg-chrome p-1" aria-label="Architecture view mode"><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${liveState.mode === "lanes" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ mode: "lanes" })} scroll={false}><Columns3 size={14} /><T k="threeA.lanes" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${liveState.mode === "graph" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ mode: "graph" })} scroll={false}><Network size={14} /><T k="threeA.graph" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${liveState.mode === "list" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ mode: "list" })} scroll={false}><List size={14} /><T k="threeA.list" /></Link></div>
      <div className="inline-flex rounded-md border border-border bg-chrome p-1" aria-label="Trace direction"><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${liveState.direction === "both" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ direction: "both" })} scroll={false}><Waypoints size={14} /><T k="threeA.both" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${liveState.direction === "upstream" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ direction: "upstream" })} scroll={false}><Route size={14} /><T k="threeA.upstream" /></Link><Link className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold ${liveState.direction === "downstream" ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={href({ direction: "downstream" })} scroll={false}><Route className="rotate-180" size={14} /><T k="threeA.downstream" /></Link></div>
    </div>
  </div>;
}
