"use client";

import type { ArchitectureUnitNeighborhoodResult, ImpactArchitectureResult, OverviewArchitectureResult, GraphSummaryEdge, GraphSummaryNode, UnitGraphQueryResult } from "@specforge/knowledge-query";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { scopeById } from "@specforge/core";
import { Network, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { runImpactArchitectureQuery, runUnitGraphQuery } from "../../lib/3a/query-client";
import { serializeThreeAUrlState, type ThreeAUrlState } from "../../lib/3a/url-state";
import type { InitialGraphPage } from "../../lib/3a/workspace-loader";
import { T, useLanguage } from "../language-provider";
import { ArchitectureGraphRenderer } from "./architecture-graph-renderer";
import { ArchitectureGraphControls, type ArchitectureGraphLifecycle, type ArchitectureGraphView as GraphLayoutMode } from "./architecture-graph-controls";
import { ArchitectureGraphSearch } from "./architecture-graph-search";
import { ArchitectureGraphLegend } from "./architecture-graph-legend";
import { summarizeRelations, toggleRelationCode } from "./architecture-graph-relations";
import { ArchitectureViewActions } from "./architecture-view-actions";
import { createArchitectureGraphStore, type GraphStoreIdentity } from "./architecture-graph-store";
import { ArchitectureImpactPanel } from "./architecture-impact-panel";
import type { ThreeAQueryIdentity } from "./catalog-state";
import type { SigmaArchitectureGraphController } from "./sigma-architecture-graph";

export function ArchitectureGraphWorkspace({ state, identity, generationId, initialGraph, fallbackNodes = [], fallbackEdges = [], coveredAssets = 0, onFocus }: { state: ThreeAUrlState; identity: ThreeAQueryIdentity; generationId: string; initialGraph?: InitialGraphPage; fallbackNodes?: readonly KnowledgeProjectionNode[]; fallbackEdges?: readonly KnowledgeProjectionEdge[]; coveredAssets?: number; onFocus(id: string): void }) {
  const graphView = state.graphView ?? "overview";
  const { t } = useLanguage();
  const [graphLayout, setGraphLayout] = useState<GraphLayoutMode>(state.graphLayout ?? "force");
  const focusLoadKey = graphFocusLoadKey(graphView, state.focus);
  const layers = state.layers ?? [];
  const relationTypes = state.relationTypes ?? [];
  const storeIdentity = useMemo<GraphStoreIdentity>(() => ({ applicationServiceId: identity.scope, scopePath: scopeById(identity.scope)?.scopePath ?? identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId }), [identity]);
  const store = useMemo(() => createArchitectureGraphStore(storeIdentity), [storeIdentity]);
  const [version, setVersion] = useState(0);
  const [overview, setOverview] = useState<OverviewArchitectureResult>();
  const [impact, setImpact] = useState<ImpactArchitectureResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dataSource, setDataSource] = useState<ArchitectureGraphDataSource>("architecture-unit-projection");
  const [analysisAvailability, setAnalysisAvailability] = useState<UnitGraphQueryResult["analysisAvailability"]>("UNAVAILABLE");
  const [selectedId, setSelectedId] = useState<string | undefined>(state.focus ? `fact:${state.focus}` : undefined);
  const [layoutLifecycle, setLayoutLifecycle] = useState<ArchitectureGraphLifecycle>("seeded");
  const [hiddenRelations, setHiddenRelations] = useState<ReadonlySet<string>>(new Set());
  const [collapsedClusterIds, setCollapsedClusterIds] = useState<ReadonlySet<string>>(new Set());
  const controllerRef = useRef<SigmaArchitectureGraphController>(createNoopController());

  useEffect(() => { if (typeof window === "undefined") return; const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(media.matches); sync(); media.addEventListener?.("change", sync); return () => media.removeEventListener?.("change", sync); }, []);
  useEffect(() => { setGraphLayout(state.graphLayout ?? "force"); }, [state.graphLayout]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(undefined); setImpact(undefined); setOverview(undefined); setAnalysisAvailability("UNAVAILABLE"); setCollapsedClusterIds(new Set()); store.clear();
    const load = async () => {
      try {
        if (graphView === "explore" && initialGraph) {
          store.mergeNeighborhood(initialGraph.trace);
        } else if (graphView === "overview") {
          const result = await runUnitGraphQuery({ operation: "unitGraph", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, generationId, includeMembers: true, filter: { layers }, budget: { maxUnitsPerLayer: 12, maxMembers: 500, maxMappings: 60, timeoutMs: 2_000, maxPayloadBytes: 524_288 } }, controller.signal);
          if (!controller.signal.aborted) {
            const unitOverview = unitGraphOverview(result);
            setOverview(unitOverview);
            setDataSource("architecture-unit-projection");
            setAnalysisAvailability(result.analysisAvailability);
            store.mergeOverview(unitOverview);
          }
        } else if (graphView === "impact" && state.focus) {
          const result = await runImpactArchitectureQuery({ operation: "impact", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, focusAssertionId: state.focus, direction: state.direction, layers, relationTypes, budget: { maxNodes: 150, maxEdges: 300, maxPaths: 100, timeoutMs: 3_000, maxPayloadBytes: 1_048_576 } }, controller.signal);
          if (!controller.signal.aborted) { setImpact(result); store.mergeImpact(result); }
        }
        if (!controller.signal.aborted) { if (state.focus) store.select(`fact:${state.focus}`); setVersion((value) => value + 1); }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : "UNAVAILABLE");
        }
      }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => { controller.abort(); };
  }, [fallbackEdges, fallbackNodes, focusLoadKey, generationId, graphView, identity, initialGraph, layers, relationTypes, state.direction, store]);

  useEffect(() => {
    if (graphView === "impact") return;
    const nextSelectedId = state.focus ? `fact:${state.focus}` : undefined;
    setSelectedId(nextSelectedId);
    store.select(nextSelectedId);
    setVersion((value) => value + 1);
  }, [graphView, state.focus, store]);

  const snapshot = useMemo(() => store.snapshot(), [store, version]);
  const relations = useMemo(() => summarizeRelations(snapshot.edges.map((edge) => edge.attributes.relationCode)), [snapshot]);
  const projectionCounts = useMemo(() => overview ? graphProjectionCounts(overview, coveredAssets) : undefined, [coveredAssets, overview]);
  const toggleRelation = (code: string) => setHiddenRelations((current) => toggleRelationCode(current, code));
  const legendOverlay = <ArchitectureGraphLegend hiddenCodes={hiddenRelations} relations={relations} onToggle={toggleRelation} />;
  const resetViewHref = `/architecture/3a?${serializeThreeAUrlState({ ...state, mode: "graph", graphView: "overview", graphLayout: "force", focus: undefined, layers: [], relationTypes: [] })}`;
  const focus = (id: string) => {
    const assertionId = id.startsWith("fact:") ? id.slice(5) : undefined;
    const unitIdentity = id.startsWith("cluster:unit:") ? id.slice("cluster:".length) : undefined;
    const owningClusterId = snapshot.nodes.find((node) => node.id === id)?.attributes.clusterId;
    if (unitIdentity) {
      setCollapsedClusterIds((current) => {
        const next = new Set(current);
        if (next.has(unitIdentity)) next.delete(unitIdentity); else next.add(unitIdentity);
        return next;
      });
    } else if (owningClusterId) {
      setCollapsedClusterIds((current) => {
        if (!current.has(owningClusterId)) return current;
        const next = new Set(current);
        next.delete(owningClusterId);
        return next;
      });
    }
    setSelectedId(id); store.select(id); setVersion((value) => value + 1);
    if (assertionId) onFocus(assertionId);
  };
  const clearFocus = () => { setSelectedId(undefined); store.select(undefined); setVersion((value) => value + 1); if (typeof window !== "undefined") { const params = new URLSearchParams(window.location.search); params.delete("focus"); window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`); window.dispatchEvent(new Event("three-a-url-state-change")); } };
  const changeGraphLayout = (nextLayout: GraphLayoutMode) => { setGraphLayout(nextLayout); if (typeof window !== "undefined") { const nextState = { ...state, mode: "graph" as const, graphLayout: nextLayout }; window.history.replaceState(null, "", `/architecture/3a?${serializeThreeAUrlState(nextState)}`); window.dispatchEvent(new Event("three-a-url-state-change")); } };
  const viewHref = (nextView: NonNullable<ThreeAUrlState["graphView"]>) => `/architecture/3a?${serializeThreeAUrlState({ ...state, mode: "graph", graphView: nextView })}`;
  const controlLabels = { toolbar: t("threeA.graphControls"), viewGroup: t("threeA.graphViewGroup"), forceView: t("threeA.forceView"), treeView: t("threeA.treeView"), circleView: t("threeA.circleView"), cameraGroup: t("threeA.cameraControls"), zoomIn: t("threeA.zoomIn"), zoomOut: t("threeA.zoomOut"), resetCamera: t("threeA.resetCamera"), selectionGroup: t("threeA.selectionControls"), focusSelection: t("threeA.focusSelection"), clearSelection: t("threeA.clearSelection"), layoutGroup: t("threeA.layoutControls"), startLayout: t("threeA.startLayout"), stopLayout: t("threeA.stopLayout"), restartLayout: t("threeA.restartLayout") };
  const graphViewLabels = { overview: t("threeA.graphOverview"), explore: t("threeA.graphExplore"), impact: t("threeA.graphImpact") };
  return <section className="space-y-3" data-testid="architecture-graph-workspace">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3 shadow-panel"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><Network className="text-accent" size={17} /><T k="threeA.graphWorkspace" /></div><ArchitectureGraphSearch nodes={snapshot.nodes} onSelect={focus} /><div className="flex items-center gap-1 rounded-md border border-border bg-chrome p-1">{(["overview", "explore", "impact"] as const).map((view) => <a aria-current={graphView === view ? "page" : undefined} className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold ${graphView === view ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={viewHref(view)} key={view}><Sparkles size={13} />{graphViewLabels[view]}</a>)}</div><ArchitectureGraphControls view={graphLayout} lifecycle={layoutLifecycle} hasSelection={Boolean(selectedId)} labels={controlLabels} onViewChange={changeGraphLayout} onZoomIn={() => controllerRef.current.zoomIn()} onZoomOut={() => controllerRef.current.zoomOut()} onResetCamera={() => controllerRef.current.resetCamera()} onFocusSelection={() => controllerRef.current.focusSelectedNode()} onStartLayout={() => controllerRef.current.startLayout()} onStopLayout={() => controllerRef.current.stopLayout()} onRestartLayout={() => controllerRef.current.restartLayout()} onClearSelection={() => { controllerRef.current.clearSelection(); clearFocus(); }} /><ArchitectureViewActions resetHref={resetViewHref} /></div>
    {projectionCounts ? <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-md border border-border bg-white sm:grid-cols-4 sm:divide-y-0" data-testid="architecture-graph-counts"><GraphMeasure value={projectionCounts.units} labelKey="threeA.governedUnits" /><GraphMeasure value={projectionCounts.directMembers} labelKey="threeA.directMembers" /><GraphMeasure value={projectionCounts.coveredAssets} labelKey="threeA.coveredAssets" /><GraphMeasure value={projectionCounts.mappings} labelKey="threeA.graphUnitMappings" /></div> : null}
    <div className="flex flex-wrap gap-2 text-xs text-muted"><span><Search className="mr-1 inline-block" size={13} />{snapshot.nodes.length} <T k="threeA.loadedNodes" /></span><span>{snapshot.edges.length} <T k="threeA.loadedEdges" /></span>{overview ? <><span className="rounded-full border border-border bg-chrome px-2 py-0.5 font-medium text-ink">{dataSource === "architecture-unit-projection" ? <T k="threeA.graphSourceUnitProjection" /> : dataSource === "projection" ? <T k="threeA.graphSourceProjection" /> : <T k="threeA.graphSourceFallback" />}</span><span className="rounded-full border border-border bg-chrome px-2 py-0.5 font-medium text-muted"><T k="threeA.analysisAvailability" />: {analysisAvailability}</span></> : null}</div>
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <ArchitectureGraphRenderer store={store} view={graphView} layoutMode={graphLayout} selectedId={selectedId} reducedMotion={reducedMotion} hiddenRelations={hiddenRelations} collapsedClusterIds={collapsedClusterIds} overlay={legendOverlay} onNodeSelect={focus} onStageClick={clearFocus} onEdgeSelect={() => undefined} onRendererFailure={(reason) => { setLayoutLifecycle("failed"); setError(reason); }} onControllerReady={(controller) => { controllerRef.current = controller; }} onLayoutLifecycleChange={setLayoutLifecycle} />
    {graphView === "impact" ? <ArchitectureImpactPanel result={impact} loading={loading} error={error} /> : null}
  </section>;
}

export type ArchitectureGraphDataSource = "architecture-unit-projection" | "projection" | "postgres-fallback";

export function graphFocusLoadKey(view: "overview" | "explore" | "impact", focus?: string): string | undefined {
  return view === "impact" ? focus : undefined;
}

export function graphLayoutHref(state: ThreeAUrlState, graphLayout: GraphLayoutMode): string {
  return `/architecture/3a?${serializeThreeAUrlState({ ...state, mode: "graph", graphLayout })}`;
}

export function selectOverviewResult(derived: OverviewArchitectureResult | undefined, fallback: OverviewArchitectureResult | undefined): { result: OverviewArchitectureResult; source: ArchitectureGraphDataSource } {
  if (!derived || !derived.nodes.length || (derived.edges.length === 0 && Boolean(fallback?.edges.length))) {
    if (fallback) return { result: fallback, source: "postgres-fallback" };
  }
  if (derived) return { result: derived, source: "projection" };
  if (fallback) return { result: fallback, source: "postgres-fallback" };
  throw new Error("GRAPH_OVERVIEW_EMPTY");
}

export function unitGraphOverview(result: UnitGraphQueryResult): OverviewArchitectureResult {
  return {
    applicationServiceId: result.applicationServiceId,
    scopePath: result.scopePath,
    baselineId: result.baselineId,
    projectionManifestId: result.projectionManifestId,
    profileId: result.source,
    profileVersion: result.fidelity,
    relationshipVersion: result.relationshipVersion,
    resultDigest: result.resultDigest,
    nodes: result.nodes,
    edges: result.edges
  };
}

export function graphProjectionCounts(result: OverviewArchitectureResult, coveredAssets: number) {
  const units = result.nodes.filter((node) => node.kind === "cluster");
  return { units: units.length, directMembers: units.reduce((total, node) => total + node.memberCount, 0), coveredAssets, mappings: result.edges.filter((edge) => edge.relationCode !== "ARCHITECTURE_MEMBERSHIP").length };
}

export function unitNeighborhoodOverview(result: ArchitectureUnitNeighborhoodResult): OverviewArchitectureResult {
  const units = [result.unit, ...result.adjacentUnits];
  const nodes: GraphSummaryNode[] = [
    ...units.map((unit, index) => ({ applicationServiceId: unit.applicationServiceId, scopePath: unit.scopePath, id: unit.unitIdentity, kind: "cluster" as const, label: unit.canonicalName, layer: unit.layer, clusterId: unit.unitIdentity, memberCount: unit.memberCount, degree: result.mappings.filter((mapping) => mapping.sourceUnitIdentity === unit.unitIdentity || mapping.targetUnitIdentity === unit.unitIdentity).length, criticality: unit.criticality, positionSeed: { x: Math.cos((index / Math.max(units.length, 1)) * Math.PI * 2), y: Math.sin((index / Math.max(units.length, 1)) * Math.PI * 2) } })),
    ...result.members.map((member, index) => ({ applicationServiceId: member.applicationServiceId, scopePath: member.scopePath, id: member.assertionId, kind: "fact" as const, label: member.semanticIdentity, layer: result.unit.layer, clusterId: result.unit.unitIdentity, memberCount: 1, degree: 1, criticality: result.unit.criticality, positionSeed: { x: Math.cos((index / Math.max(result.members.length, 1)) * Math.PI * 2) * 0.35, y: Math.sin((index / Math.max(result.members.length, 1)) * Math.PI * 2) * 0.35 }, assertionId: member.assertionId }))
  ];
  const edges: GraphSummaryEdge[] = [
    ...result.mappings.map((mapping) => ({ applicationServiceId: mapping.applicationServiceId, scopePath: mapping.scopePath, id: mapping.mappingIdentity, sourceId: mapping.sourceUnitIdentity, targetId: mapping.targetUnitIdentity, relationCode: mapping.mappingFamily, confidence: mapping.confidence, bridge: mapping.sourceLayer !== mapping.targetLayer })),
    ...result.members.map((member) => ({ applicationServiceId: member.applicationServiceId, scopePath: member.scopePath, id: `membership:${result.unit.unitIdentity}:${member.assertionId}`, sourceId: result.unit.unitIdentity, targetId: member.assertionId, relationCode: "ARCHITECTURE_MEMBERSHIP", confidence: 1, bridge: false }))
  ];
  return { applicationServiceId: result.applicationServiceId, scopePath: result.scopePath, baselineId: result.baselineId, projectionManifestId: result.projectionManifestId, profileId: "architecture-unit-neighborhood", profileVersion: result.generationId, relationshipVersion: result.relationshipVersion, resultDigest: result.resultDigest, nodes, edges };
}

function fallbackOverview(identity: ThreeAQueryIdentity, nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[]): OverviewArchitectureResult {
  const scope = scopeById(identity.scope);
  const scopePath = scope?.scopePath ?? identity.scope;
  const summaryNodes: GraphSummaryNode[] = nodes.slice(0, 250).map((node, index) => ({ applicationServiceId: identity.scope, scopePath, id: node.assertionId, kind: "fact", label: node.semanticIdentity, layer: node.layer, clusterId: node.layer, memberCount: 1, degree: 0, criticality: 0, positionSeed: { x: Math.cos(index), y: Math.sin(index) }, assertionId: node.assertionId }));
  const ids = new Set(summaryNodes.map((node) => node.assertionId));
  const summaryEdges: GraphSummaryEdge[] = edges.filter((edge) => ids.has(edge.sourceAssertionId) && ids.has(edge.targetAssertionId)).slice(0, 500).map((edge) => ({ applicationServiceId: identity.scope, scopePath, id: edge.relationshipIdentity, sourceId: edge.sourceAssertionId, targetId: edge.targetAssertionId, relationCode: edge.relationCode, confidence: edge.confidence, bridge: true }));
  return { applicationServiceId: identity.scope, scopePath, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, profileId: "fallback", profileVersion: "fallback", relationshipVersion: "fallback", resultDigest: "fallback", nodes: summaryNodes, edges: summaryEdges };
}

function createNoopController(): SigmaArchitectureGraphController {
  return {
    zoomIn: () => undefined,
    zoomOut: () => undefined,
    resetCamera: () => undefined,
    focusSelectedNode: () => undefined,
    startLayout: () => undefined,
    stopLayout: () => undefined,
    restartLayout: () => undefined,
    clearSelection: () => undefined
  };
}

function GraphMeasure({ value, labelKey }: { value: number; labelKey: "threeA.governedUnits" | "threeA.directMembers" | "threeA.coveredAssets" | "threeA.graphUnitMappings" }) {
  return <div className="px-3 py-2.5"><strong className="block font-mono text-lg leading-none text-ink">{value}</strong><span className="mt-1 block text-[11px] text-muted"><T k={labelKey} /></span></div>;
}
