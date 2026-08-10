"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { T } from "../language-provider";
import type { ArchitectureLayer } from "../../lib/3a/workspace-loader";
import type { CatalogLayerState } from "./catalog-state";
import { ArchitectureNodeCard } from "./architecture-node-card";

const copy = { BIZ: "threeA.business", SYS: "threeA.system", TECH: "threeA.technology" } as const;

export function ArchitectureLane({ layer, state, Icon, tone, onFocus, onLoadMore }: { layer: ArchitectureLayer; state: CatalogLayerState; Icon: LucideIcon; tone: string; onFocus: (assertionId: string) => void; onLoadMore: () => void }) {
  return <section className={`flex min-h-0 flex-col rounded-lg border ${tone}`} aria-labelledby={`lane-${layer}`}>
    <header className="sticky top-0 z-10 flex items-center justify-between border-b border-black/10 bg-inherit px-3 py-3"><h2 id={`lane-${layer}`} className="flex items-center gap-2 text-sm font-bold text-ink"><Icon size={16} /><T k={copy[layer]} /></h2><span className="text-xs text-muted">{state.nodes.length}{state.nextCursor ? "+" : ""}</span></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3" data-testid={`three-a-lane-scroll-${layer}`}><div className="grid gap-2">{state.nodes.length ? state.nodes.map((node) => <ArchitectureNodeCard key={node.assertionId} node={node} onFocus={onFocus} />) : <p className="px-2 py-6 text-center text-xs text-muted"><T k="threeA.emptyLayer" /></p>}</div>{state.errorCode ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700"><T k="threeA.queryFailed" /><button className="ml-2 font-semibold underline" onClick={onLoadMore} type="button"><T k="threeA.retry" /></button></div> : null}{state.nextCursor ? <button className="mt-3 h-9 rounded-md border border-border bg-white text-xs font-semibold text-ink disabled:opacity-50" disabled={state.loading} onClick={onLoadMore} type="button">{state.loading ? <T k="threeA.loading" /> : <T k="threeA.loadMore" />}</button> : null}</div>
  </section>;
}
