import React from "react";
import type { PublishedBaselineDrift, PublishedBaselineDriftItem } from "@specforge/core";
import { GitCompareArrows } from "lucide-react";
import { Badge } from "../ui";
import { T } from "../language-provider";

export function PublishedBaselineDriftView({ drift }: { drift?: PublishedBaselineDrift }) {
  if (!drift) return <section className="rounded-lg border border-border bg-white p-5 shadow-panel"><Empty /></section>;
  return <section className="rounded-lg border border-border bg-white p-5 shadow-panel" aria-labelledby="three-a-drift-title"><div className="flex items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-base font-semibold text-ink" id="three-a-drift-title"><GitCompareArrows className="text-accent" size={18} /><T k="threeA.drift" /></h2><p className="mt-1 text-sm text-muted">{drift.baseBaselineId} → {drift.targetBaselineId}</p></div><span className="font-mono text-xs text-muted">{drift.items.length}</span></div>{drift.items.length ? <ul className="mt-5 divide-y divide-border rounded-md border border-border">{drift.items.map((item) => <DriftRow item={item} key={`${item.entityKind}:${item.stableKey}`} />)}</ul> : <p className="py-12 text-center text-sm text-muted"><T k="threeA.noDrift" /></p>}</section>;
}

function DriftRow({ item }: { item: PublishedBaselineDriftItem }) {
  const tone = item.change === "ADDED" ? "green" : item.change === "REMOVED" ? "red" : item.change === "CHANGED" ? "amber" : "neutral";
  return <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm"><div className="flex min-w-0 items-center gap-2"><Badge tone={tone}><T k={`threeA.${item.change.toLowerCase()}` as "threeA.added"} /></Badge><span className="font-mono text-[11px] text-muted">{item.entityKind}</span><span className="truncate font-medium text-ink">{item.stableKey}</span></div><span className="text-xs text-muted">{item.targetContentDigest?.slice(0, 12) ?? item.baseContentDigest?.slice(0, 12)}</span></li>;
}

function Empty() { return <div className="py-12 text-center text-sm text-muted"><T k="threeA.noDrift" /></div>; }
