"use client";

import React from "react";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode, PublishedBaselineDrift } from "@specforge/core";
import { ArrowRight, Layers3, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { T } from "../language-provider";
import type { ThreeAUrlState } from "../../lib/3a/url-state";
import { ArchitectureDetailDrawer } from "./architecture-detail-drawer";
import { AlignmentView } from "./alignment-view";
import { ArchitectureLanes, NodeCard } from "./architecture-lanes";
import { ArchitecturePathList } from "./architecture-path-list";
import { BaselineToolbar, type BaselineOption, type ManifestOption } from "./baseline-toolbar";
import { PublishedBaselineDriftView } from "./published-baseline-drift-view";
import { ProjectionStateBanner } from "./projection-state-banner";

export interface ThreeAWorkspaceData {
  state: ThreeAUrlState;
  nodes: KnowledgeProjectionNode[];
  edges: KnowledgeProjectionEdge[];
  alignmentEdges: KnowledgeProjectionEdge[];
  drift?: PublishedBaselineDrift;
  baselines: BaselineOption[];
  manifests: ManifestOption[];
  errorCode?: string;
}

export function ThreeAWorkspace({ data }: { data: ThreeAWorkspaceData }) {
  const [focusId, setFocusId] = useState(data.state.focus);
  const [query, setQuery] = useState("");
  const focused = useMemo(() => data.nodes.find((node) => node.assertionId === focusId), [data.nodes, focusId]);
  const visibleNodes = useMemo(() => query ? data.nodes.filter((node) => node.semanticIdentity.toLowerCase().includes(query.toLowerCase())) : data.nodes, [data.nodes, query]);
  const hasManifest = data.manifests.length > 0;

  return <div className="space-y-4 pb-8" data-testid="three-a-workspace">
    <BaselineToolbar state={data.state} baselines={data.baselines} manifests={data.manifests} />
    <ProjectionStateBanner code={data.errorCode} hasManifest={hasManifest} />
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 shadow-panel md:flex-row md:items-center md:justify-between"><div><p className="font-mono text-[11px] font-semibold uppercase text-rule"><T k="threeA.publishedCatalog" /></p><p className="mt-1 text-sm text-muted"><T k="threeA.catalogDescription" /></p></div><label className="relative block w-full md:w-72"><Search className="pointer-events-none absolute left-3 top-2.5 text-muted" size={16} /><span className="sr-only"><T k="threeA.search" /></span><input className="h-9 w-full rounded-md border border-border bg-white pl-9 pr-3 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-blue-100" onChange={(event) => setQuery(event.target.value)} placeholder="Search published facts" value={query} /></label></div>
    <div className="flex flex-wrap items-center gap-2 border-b border-border" role="tablist" aria-label="3A views"><ViewTab active={data.state.tab === "architecture"} href={tabHref(data.state, "architecture")} labelKey="threeA.architecture" /><ViewTab active={data.state.tab === "alignment"} href={tabHref(data.state, "alignment")} labelKey="threeA.alignment" /><ViewTab active={data.state.tab === "drift"} href={tabHref(data.state, "drift")} labelKey="threeA.drift" /></div>
    {data.state.tab === "alignment" ? <AlignmentView edges={data.alignmentEdges} /> : data.state.tab === "drift" ? <PublishedBaselineDriftView drift={data.drift} /> : <>
      {data.state.mode === "lanes" ? <ArchitectureLanes nodes={visibleNodes} onFocus={setFocusId} /> : <section className="grid gap-2 rounded-lg border border-border bg-white p-3 shadow-panel" data-testid="architecture-list">{visibleNodes.length ? visibleNodes.map((node) => <NodeCard key={node.assertionId} node={node} onFocus={setFocusId} />) : <EmptyState />}</section>}
      <ArchitecturePathList edges={data.edges} onFocus={setFocusId} />
    </>}
    {focused ? <ArchitectureDetailDrawer node={focused} edges={data.edges} onClose={() => setFocusId(undefined)} /> : null}
  </div>;
}

function ViewTab({ active, href, labelKey }: { active: boolean; href: string; labelKey: "threeA.architecture" | "threeA.alignment" | "threeA.drift" }) {
  return <a aria-current={active ? "page" : undefined} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition ${active ? "border-accent text-accent" : "border-transparent text-muted hover:border-slate-300 hover:text-ink"}`} href={href} role="tab"><Layers3 size={15} /><T k={labelKey} /></a>;
}

function EmptyState() { return <div className="col-span-full py-12 text-center text-sm text-muted"><T k="threeA.emptyFacts" /></div>; }
function tabHref(state: ThreeAUrlState, tab: ThreeAUrlState["tab"]): string { const params = new URLSearchParams({ scope: state.scope, tab, mode: state.mode, direction: state.direction }); if (state.baseline) params.set("baseline", state.baseline); if (state.projection) params.set("projection", state.projection); return `/architecture/3a?${params.toString()}`; }
