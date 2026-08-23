"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import { GitCompareArrows, History, Layers3, ListChecks, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { T } from "../language-provider";
import { serializeThreeAUrlState, type ThreeAUrlState } from "../../lib/3a/url-state";
import { ArchitectureDetailDrawer } from "./architecture-detail-drawer";
import { ArchitectureMapWorkspace } from "./architecture-map-workspace";
import { AlignmentView } from "./alignment-view";
import { ArchitectureCatalog } from "./architecture-catalog";
import { ArchitectureNodeCard } from "./architecture-node-card";
import { ArchitecturePathList } from "./architecture-path-list";
import { BaselineToolbar, type BaselineOption, type ManifestOption } from "./baseline-toolbar";
import { PublishedBaselineDriftView } from "./published-baseline-drift-view";
import { ProjectionStateBanner } from "./projection-state-banner";
import { CoverageSummary } from "./coverage-summary";
import { CoverageDetail } from "./coverage-detail";
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
    {data.coverage && data.state.tab !== "coverage" ? <CoverageSummary compact report={data.coverage} /> : null}
    <div className="sticky top-[3.75rem] z-10 -mx-1 flex flex-wrap items-center gap-2 border-b border-border bg-surface/95 px-1 py-1 backdrop-blur" role="tablist" aria-label="3A views"><ViewTab active={data.state.tab === "architecture"} href={tabHref(data.state, "architecture")} icon={Layers3} labelKey="threeA.architecture" /><ViewTab active={data.state.tab === "alignment"} href={tabHref(data.state, "alignment")} icon={GitCompareArrows} labelKey="threeA.alignment" /><ViewTab active={data.state.tab === "drift"} href={tabHref(data.state, "drift")} icon={History} labelKey="threeA.drift" /><ViewTab active={data.state.tab === "coverage"} href={tabHref(data.state, "coverage")} icon={ListChecks} labelKey="threeA.coverageTab" /><span className="ml-auto hidden text-xs text-muted lg:inline"><T k="threeA.viewModeHint" /></span></div>
    {data.state.tab === "coverage" ? data.coverage ? <div className="space-y-3"><CoverageSummary report={data.coverage} /><CoverageDetail rows={data.coverage.rows} /></div> : <EmptyState /> : data.state.tab === "alignment" ? <AlignmentView edges={alignmentEdges} /> : data.state.tab === "drift" ? <PublishedBaselineDriftView drift={data.drift} /> : data.state.mode === "graph" ? (data.state.graphRepresentation === "map" && catalogIdentity && data.manifests.find((manifest) => manifest.id === data.state.projection)?.generationId ? <ArchitectureMapWorkspace state={data.state} identity={catalogIdentity} generationId={data.manifests.find((manifest) => manifest.id === data.state.projection)!.generationId!} initialMap={data.initialArchitectureMap} initialNeighborhood={data.initialArchitectureUnitNeighborhood} /> : catalogIdentity && data.manifests.find((manifest) => manifest.id === data.state.projection)?.generationId ? <ArchitectureGraphWorkspace state={data.state} identity={catalogIdentity} generationId={data.manifests.find((manifest) => manifest.id === data.state.projection)!.generationId!} initialGraph={data.initialGraph} fallbackNodes={nodes} fallbackEdges={data.initialGraphEdges ?? edges} coveredAssets={data.coverage?.manifest?.coveredCount ?? data.coverage?.rows.filter((row) => row.status === "COVERED").length ?? 0} onFocus={focusNode} /> : <section className="rounded-lg border border-border bg-white p-8 text-center shadow-panel"><p className="text-sm font-semibold text-ink"><T k={data.state.graphRepresentation === "map" ? "threeA.noProjection" : "threeA.selectGraphFocus"} /></p><Link className="mt-3 inline-flex text-sm font-semibold text-accent underline" href={tabHref({ ...data.state, mode: "lanes" }, "architecture")} scroll={false}><T k="threeA.lanes" /></Link></section>) : <>
      {data.state.mode === "lanes" && data.initialCatalog && catalogIdentity ? <ArchitectureCatalog initialCatalog={data.initialCatalog} identity={catalogIdentity} onFocus={focusNode} /> : <section className="grid gap-2 rounded-lg border border-border bg-white p-3 shadow-panel" data-testid="architecture-list">{nodes.length ? nodes.map((node) => <ArchitectureNodeCard key={node.assertionId} node={node} onFocus={focusNode} focused={node.assertionId === focusId} />) : <EmptyState />}</section>}
      <ArchitecturePathList edges={edges} onFocus={focusNode} />
    </>}
    {focused ? <ArchitectureDetailDrawer node={focused} edges={edges} onClose={() => setFocusId(undefined)} /> : null}
  </div>;
}

function ViewTab({ active, href, icon: Icon, labelKey }: { active: boolean; href: string; icon: LucideIcon; labelKey: "threeA.architecture" | "threeA.alignment" | "threeA.drift" | "threeA.coverageTab" }) {
  return <Link aria-current={active ? "page" : undefined} className={`inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition ${active ? "border-accent text-accent" : "border-transparent text-muted hover:border-slate-300 hover:text-ink"}`} href={href} role="tab" scroll={false}><Icon size={15} /><T k={labelKey} /></Link>;
}

function EmptyState() { return <div className="col-span-full py-12 text-center text-sm text-muted"><T k="threeA.emptyFacts" /></div>; }
function tabHref(state: ThreeAUrlState, tab: ThreeAUrlState["tab"]): string { return "/architecture/3a?" + serializeThreeAUrlState({ ...state, tab }); }
