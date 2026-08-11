"use client";

import React from "react";
import dynamic from "next/dynamic";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import { Layers3 } from "lucide-react";
import { useMemo, useState } from "react";
import { T } from "../language-provider";
import type { ThreeAUrlState } from "../../lib/3a/url-state";
import { ArchitectureDetailDrawer } from "./architecture-detail-drawer";
import { AlignmentView } from "./alignment-view";
import { ArchitectureCatalog } from "./architecture-catalog";
import { ArchitectureNodeCard } from "./architecture-node-card";
import { ArchitecturePathList } from "./architecture-path-list";
import { BaselineToolbar, type BaselineOption, type ManifestOption } from "./baseline-toolbar";
import { PublishedBaselineDriftView } from "./published-baseline-drift-view";
import { ProjectionStateBanner } from "./projection-state-banner";
import type { ThreeAWorkspaceData } from "../../lib/3a/workspace-loader";
import type { ThreeAQueryIdentity } from "./catalog-state";
export type { ThreeAWorkspaceData } from "../../lib/3a/workspace-loader";

const ArchitectureGraphWorkspace = dynamic(() => import("./architecture-graph-workspace").then((module) => module.ArchitectureGraphWorkspace), { ssr: false });

export function ThreeAWorkspace({ data }: { data: ThreeAWorkspaceData }) {
  const [focusId, setFocusId] = useState(data.state.focus);
  const nodes = useMemo(() => data.initialGraph ? data.initialGraph.trace.nodes : data.initialCatalog ? Object.values(data.initialCatalog).flatMap((page) => page.nodes) : data.nodes ?? [], [data.initialCatalog, data.initialGraph, data.nodes]);
  const edges = data.initialGraph?.trace.edges ?? data.edges ?? [];
  const alignmentEdges = data.alignmentEdges ?? [];
  const focused = useMemo(() => nodes.find((node) => node.assertionId === focusId) ?? data.initialGraph?.detail.node, [data.initialGraph, nodes, focusId]);
  const hasManifest = data.manifests.length > 0;
  const catalogIdentity: ThreeAQueryIdentity | undefined = data.state.baseline && data.state.projection ? { scope: data.state.scope, baselineId: data.state.baseline, projectionManifestId: data.state.projection } : undefined;
  const focusNode = (assertionId: string) => {
    setFocusId(assertionId);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      params.set("focus", assertionId);
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
      window.dispatchEvent(new Event("three-a-url-state-change"));
    }
  };

  return <div className="space-y-4 pb-8" data-testid="three-a-workspace">
    <BaselineToolbar state={data.state} baselines={data.baselines} manifests={data.manifests} />
    <ProjectionStateBanner code={data.errorCode} hasManifest={hasManifest} />
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 shadow-panel"><div><p className="font-mono text-[11px] font-semibold uppercase text-rule"><T k="threeA.publishedCatalog" /></p><p className="mt-1 text-sm text-muted"><T k="threeA.catalogDescription" /></p></div></div>
    <div className="flex flex-wrap items-center gap-2 border-b border-border" role="tablist" aria-label="3A views"><ViewTab active={data.state.tab === "architecture"} href={tabHref(data.state, "architecture")} labelKey="threeA.architecture" /><ViewTab active={data.state.tab === "alignment"} href={tabHref(data.state, "alignment")} labelKey="threeA.alignment" /><ViewTab active={data.state.tab === "drift"} href={tabHref(data.state, "drift")} labelKey="threeA.drift" /></div>
    {data.state.tab === "alignment" ? <AlignmentView edges={alignmentEdges} /> : data.state.tab === "drift" ? <PublishedBaselineDriftView drift={data.drift} /> : data.state.mode === "graph" ? (catalogIdentity ? <ArchitectureGraphWorkspace state={data.state} identity={catalogIdentity} initialGraph={data.initialGraph} fallbackNodes={nodes} fallbackEdges={data.initialGraphEdges ?? edges} onFocus={focusNode} /> : <section className="rounded-lg border border-border bg-white p-8 text-center shadow-panel"><p className="text-sm font-semibold text-ink"><T k="threeA.selectGraphFocus" /></p><a className="mt-3 inline-flex text-sm font-semibold text-accent underline" href={tabHref({ ...data.state, mode: "lanes" }, "architecture")}><T k="threeA.lanes" /></a></section>) : <>
      {data.state.mode === "lanes" && data.initialCatalog && catalogIdentity ? <ArchitectureCatalog initialCatalog={data.initialCatalog} identity={catalogIdentity} onFocus={focusNode} /> : <section className="grid gap-2 rounded-lg border border-border bg-white p-3 shadow-panel" data-testid="architecture-list">{nodes.length ? nodes.map((node) => <ArchitectureNodeCard key={node.assertionId} node={node} onFocus={focusNode} focused={node.assertionId === focusId} />) : <EmptyState />}</section>}
      <ArchitecturePathList edges={edges} onFocus={focusNode} />
    </>}
    {focused ? <ArchitectureDetailDrawer node={focused} edges={edges} onClose={() => setFocusId(undefined)} /> : null}
  </div>;
}

function ViewTab({ active, href, labelKey }: { active: boolean; href: string; labelKey: "threeA.architecture" | "threeA.alignment" | "threeA.drift" }) {
  return <a aria-current={active ? "page" : undefined} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition ${active ? "border-accent text-accent" : "border-transparent text-muted hover:border-slate-300 hover:text-ink"}`} href={href} role="tab"><Layers3 size={15} /><T k={labelKey} /></a>;
}

function EmptyState() { return <div className="col-span-full py-12 text-center text-sm text-muted"><T k="threeA.emptyFacts" /></div>; }
function tabHref(state: ThreeAUrlState, tab: ThreeAUrlState["tab"]): string { const params = new URLSearchParams({ scope: state.scope, tab, mode: state.mode, direction: state.direction }); if (state.baseline) params.set("baseline", state.baseline); if (state.projection) params.set("projection", state.projection); return `/architecture/3a?${params.toString()}`; }
