"use client";

import type { ImpactArchitectureResult, OverviewArchitectureResult, GraphSummaryEdge, GraphSummaryNode } from "@specforge/knowledge-query";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import { scopeById } from "@specforge/core";
import { Network, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { runImpactArchitectureQuery, runOverviewArchitectureQuery } from "../../lib/3a/query-client";
import { serializeThreeAUrlState, type ThreeAUrlState } from "../../lib/3a/url-state";
import type { InitialGraphPage } from "../../lib/3a/workspace-loader";
import { T } from "../language-provider";
import { ArchitectureGraphRenderer } from "./architecture-graph-renderer";
import { ArchitectureGraphSearch } from "./architecture-graph-search";
import { createArchitectureGraphStore, type GraphStoreIdentity } from "./architecture-graph-store";
import { ArchitectureImpactPanel } from "./architecture-impact-panel";
import type { ThreeAQueryIdentity } from "./catalog-state";

export function ArchitectureGraphWorkspace({ state, identity, initialGraph, fallbackNodes = [], fallbackEdges = [], onFocus }: { state: ThreeAUrlState; identity: ThreeAQueryIdentity; initialGraph?: InitialGraphPage; fallbackNodes?: readonly KnowledgeProjectionNode[]; fallbackEdges?: readonly KnowledgeProjectionEdge[]; onFocus(id: string): void }) {
  const graphView = state.graphView ?? "overview";
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
  const [dataSource, setDataSource] = useState<ArchitectureGraphDataSource>("postgres-fallback");

  useEffect(() => { if (typeof window === "undefined") return; const media = window.matchMedia("(prefers-reduced-motion: reduce)"); const sync = () => setReducedMotion(media.matches); sync(); media.addEventListener?.("change", sync); return () => media.removeEventListener?.("change", sync); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(undefined); setImpact(undefined); setOverview(undefined); store.clear();
    const hasFallbackSeed = graphView === "overview" && fallbackNodes.length > 0;
    if (hasFallbackSeed) {
      const fallback = fallbackOverview(identity, fallbackNodes, fallbackEdges);
      setOverview(fallback);
      setDataSource("postgres-fallback");
      store.mergeOverview(fallback);
      setVersion((value) => value + 1);
    }
    const load = async () => {
      try {
        if (graphView === "explore" && initialGraph) {
          store.mergeNeighborhood(initialGraph.trace);
        } else if (graphView === "overview") {
          const result = await runOverviewArchitectureQuery({ operation: "overview", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, layers, assetTypes: [], relationTypes, budget: { maxNodes: 250, maxEdges: 500, maxPaths: 100, timeoutMs: 3_000, maxPayloadBytes: 1_048_576 } }, controller.signal);
          if (!controller.signal.aborted) {
            const fallback = hasFallbackSeed ? fallbackOverview(identity, fallbackNodes, fallbackEdges) : undefined;
            const selected = selectOverviewResult(result, fallback);
            if (selected.source === "postgres-fallback") store.clear();
            setOverview(selected.result);
            setDataSource(selected.source);
            store.mergeOverview(selected.result);
          }
        } else if (graphView === "impact" && state.focus) {
          const result = await runImpactArchitectureQuery({ operation: "impact", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, focusAssertionId: state.focus, direction: state.direction, layers, relationTypes, budget: { maxNodes: 150, maxEdges: 300, maxPaths: 100, timeoutMs: 3_000, maxPayloadBytes: 1_048_576 } }, controller.signal);
          if (!controller.signal.aborted) { setImpact(result); store.mergeImpact(result); }
        }
        if (!controller.signal.aborted) { if (state.focus) store.select(`fact:${state.focus}`); setVersion((value) => value + 1); }
      } catch (cause) {
        if (!controller.signal.aborted) {
          if (graphView === "overview" && fallbackNodes.length) {
            const fallback = fallbackOverview(identity, fallbackNodes, fallbackEdges);
            setOverview(fallback); setDataSource("postgres-fallback"); store.clear(); store.mergeOverview(fallback);
            setVersion((value) => value + 1);
          } else setError(cause instanceof Error ? cause.message : "UNAVAILABLE");
        }
      }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [fallbackEdges, fallbackNodes, graphView, identity, initialGraph, layers, relationTypes, state.direction, state.focus, store]);

  const snapshot = useMemo(() => store.snapshot(), [store, version]);
  const focus = (id: string) => { const assertionId = id.startsWith("fact:") ? id.slice(5) : undefined; store.select(id); setVersion((value) => value + 1); if (assertionId) onFocus(assertionId); };
  const viewHref = (nextView: NonNullable<ThreeAUrlState["graphView"]>) => `/architecture/3a?${serializeThreeAUrlState({ ...state, mode: "graph", graphView: nextView })}`;
  return <section className="space-y-3" data-testid="architecture-graph-workspace">
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3 shadow-panel"><div className="flex items-center gap-2 text-sm font-semibold text-ink"><Network className="text-accent" size={17} /><T k="threeA.graphWorkspace" /></div><ArchitectureGraphSearch nodes={snapshot.nodes} onSelect={focus} /><div className="flex items-center gap-1 rounded-md border border-border bg-chrome p-1">{(["overview", "explore", "impact"] as const).map((view) => <a className={`inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-semibold ${graphView === view ? "bg-white text-ink shadow-sm" : "text-muted"}`} href={viewHref(view)} key={view}><Sparkles size={13} />{view}</a>)}</div></div>
    <div className="flex flex-wrap gap-2 text-xs text-muted"><span><Search className="mr-1 inline-block" size={13} />{snapshot.nodes.length} <T k="threeA.loadedNodes" /></span>{overview ? <><span>{overview.edges.length} <T k="threeA.loadedEdges" /></span><span className="rounded-full border border-border bg-chrome px-2 py-0.5 font-medium text-ink">{dataSource === "projection" ? <T k="threeA.graphSourceProjection" /> : <T k="threeA.graphSourceFallback" />}</span></> : null}</div>
    {error ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
    <ArchitectureGraphRenderer store={store} view={graphView} selectedId={state.focus ? `fact:${state.focus}` : undefined} reducedMotion={reducedMotion} onNodeSelect={focus} onEdgeSelect={() => undefined} onRendererFailure={(reason) => setError(reason)} />
    {graphView === "impact" ? <ArchitectureImpactPanel result={impact} loading={loading} error={error} /> : null}
  </section>;
}

export type ArchitectureGraphDataSource = "projection" | "postgres-fallback";

export function selectOverviewResult(derived: OverviewArchitectureResult | undefined, fallback: OverviewArchitectureResult | undefined): { result: OverviewArchitectureResult; source: ArchitectureGraphDataSource } {
  if (!derived || !derived.nodes.length || (derived.edges.length === 0 && Boolean(fallback?.edges.length))) {
    if (fallback) return { result: fallback, source: "postgres-fallback" };
  }
  if (derived) return { result: derived, source: "projection" };
  if (fallback) return { result: fallback, source: "postgres-fallback" };
  throw new Error("GRAPH_OVERVIEW_EMPTY");
}

function fallbackOverview(identity: ThreeAQueryIdentity, nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[]): OverviewArchitectureResult {
  const scope = scopeById(identity.scope);
  const scopePath = scope?.scopePath ?? identity.scope;
  const summaryNodes: GraphSummaryNode[] = nodes.slice(0, 250).map((node, index) => ({ applicationServiceId: identity.scope, scopePath, id: node.assertionId, kind: "fact", label: node.semanticIdentity, layer: node.layer, clusterId: node.layer, memberCount: 1, degree: 0, criticality: 0, positionSeed: { x: Math.cos(index), y: Math.sin(index) }, assertionId: node.assertionId }));
  const ids = new Set(summaryNodes.map((node) => node.assertionId));
  const summaryEdges: GraphSummaryEdge[] = edges.filter((edge) => ids.has(edge.sourceAssertionId) && ids.has(edge.targetAssertionId)).slice(0, 500).map((edge) => ({ applicationServiceId: identity.scope, scopePath, id: edge.relationshipIdentity, sourceId: edge.sourceAssertionId, targetId: edge.targetAssertionId, relationCode: edge.relationCode, confidence: edge.confidence, bridge: true }));
  return { applicationServiceId: identity.scope, scopePath, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, profileId: "fallback", profileVersion: "fallback", relationshipVersion: "fallback", resultDigest: "fallback", nodes: summaryNodes, edges: summaryEdges };
}
