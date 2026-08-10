"use client";

import React from "react";
import { ArrowDown, ArrowUp, List, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KnowledgeProjectionEdge } from "@specforge/core";
import type { TraceArchitecturePathResult } from "@specforge/knowledge-query";
import { T } from "../language-provider";
import { runThreeAWebQuery } from "../../lib/3a/query-client";
import type { ThreeAQueryIdentity } from "./catalog-state";
import { ArchitectureGraphCanvas } from "./architecture-graph-canvas";
import { expansionKey, graphStateFromInitial, mergeGraphExpansion, type ArchitectureGraphState, type GraphFilters, type TraceDirection } from "./architecture-graph-state";
import { layoutArchitectureGraph } from "./architecture-graph-layout";
import { ArchitectureRelationshipInspector } from "./architecture-relationship-inspector";
import { ArchitecturePathList } from "./architecture-path-list";
import type { InitialGraphPage } from "../../lib/3a/workspace-loader";

export function ArchitectureGraphExplorer({ initialGraph, identity, onFocus }: { initialGraph: InitialGraphPage; identity: ThreeAQueryIdentity; onFocus: (assertionId: string) => void }) {
  const [graph, setGraph] = useState<ArchitectureGraphState>(() => graphStateFromInitial(initialGraph.focusId, initialGraph.trace));
  const [filters, setFilters] = useState<GraphFilters>({ relationTypes: [], layers: [] });
  const [direction, setDirection] = useState<TraceDirection>("both");
  const [selectedEdge, setSelectedEdge] = useState<KnowledgeProjectionEdge>();
  const [listOpen, setListOpen] = useState(false);
  const filterKey = JSON.stringify([direction, [...filters.relationTypes].sort(), [...filters.layers].sort()]);
  const firstFilterKey = useRef(filterKey);
  const layout = useMemo(() => layoutArchitectureGraph({ focusId: graph.rootFocusId, nodes: [...graph.nodesById.values()], edges: [...graph.edgesById.values()] }), [graph]);

  useEffect(() => { setGraph(graphStateFromInitial(initialGraph.focusId, initialGraph.trace)); setSelectedEdge(undefined); }, [initialGraph.focusId, initialGraph.trace.resultDigest]);
  useEffect(() => { if (firstFilterKey.current === filterKey) return; firstFilterKey.current = filterKey; setGraph(graphStateFromInitial(initialGraph.focusId, initialGraph.trace)); setSelectedEdge(undefined); }, [filterKey, initialGraph.focusId, initialGraph.trace]);

  const expand = async (nextDirection: TraceDirection, continueExisting: boolean) => {
    const selectedId = graph.selectedId;
    const key = expansionKey(selectedId, nextDirection, filters);
    const continuation = continueExisting ? graph.continuations.get(key) : undefined;
    setGraph((current) => ({ ...current, loadingKey: key, errorCode: undefined }));
    try {
      const trace = await runThreeAWebQuery<TraceArchitecturePathResult>({ operation: "trace", scope: identity.scope, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId, startAssertionId: selectedId, direction: nextDirection, relationTypes: [...filters.relationTypes], layers: [...filters.layers], ...(continuation ? { continuation } : {}) });
      setGraph((current) => mergeGraphExpansion(current, key, trace));
    } catch (error) {
      setGraph((current) => ({ ...current, loadingKey: undefined, errorCode: error instanceof Error ? error.message : "UNAVAILABLE" }));
    }
  };

  const resetFilters = () => { setFilters({ relationTypes: [], layers: [] }); setDirection("both"); setGraph(graphStateFromInitial(initialGraph.focusId, initialGraph.trace)); };
  const hasContinuation = graph.continuations.has(expansionKey(graph.selectedId, direction, filters));
  return <div className="space-y-3" data-testid="architecture-graph-explorer"><div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-white p-3 shadow-panel"><span className="text-xs font-semibold text-muted"><T k="threeA.graphFilters" /></span><label className="flex items-center gap-2 text-xs"><span className="sr-only"><T k="threeA.relationFilter" /></span><input className="h-8 w-40 rounded-md border border-border px-2" placeholder="CALLS, DEPENDS_ON" value={filters.relationTypes.join(", ")} onChange={(event) => setFilters({ ...filters, relationTypes: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label><select className="h-8 rounded-md border border-border px-2 text-xs" value={direction} onChange={(event) => setDirection(event.target.value as TraceDirection)}><option value="both">Both</option><option value="upstream">Upstream</option><option value="downstream">Downstream</option></select><button className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-semibold" onClick={resetFilters} type="button"><RotateCcw size={13} /><T k="threeA.resetGraph" /></button></div><div className="flex flex-wrap gap-2"><button className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={Boolean(graph.loadingKey)} onClick={() => { setDirection("upstream"); expand("upstream", false); }} type="button"><ArrowUp size={14} /><T k="threeA.expandUpstream" /></button><button className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-3 text-xs font-semibold text-white disabled:opacity-50" disabled={Boolean(graph.loadingKey)} onClick={() => { setDirection("downstream"); expand("downstream", false); }} type="button"><ArrowDown size={14} /><T k="threeA.expandDownstream" /></button>{hasContinuation ? <button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-semibold text-ink disabled:opacity-50" disabled={Boolean(graph.loadingKey)} onClick={() => expand(direction, true)} type="button"><T k="threeA.continueGraph" /></button> : null}<button className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-white px-3 text-xs font-semibold text-ink" onClick={() => setListOpen((open) => !open)} type="button"><List size={14} /><T k="threeA.listFallback" /></button></div>{graph.errorCode ? <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">{graph.errorCode}</p> : null}{graph.partialReasons.length ? <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><T k="threeA.partialGraph" /></p> : null}<ArchitectureGraphCanvas layout={layout} selectedId={graph.selectedId} onNodeSelect={(id) => { setGraph((current) => ({ ...current, selectedId: id })); onFocus(id); }} onEdgeSelect={setSelectedEdge} />{selectedEdge ? <ArchitectureRelationshipInspector edge={selectedEdge} onClose={() => setSelectedEdge(undefined)} /> : null}{listOpen ? <ArchitecturePathList edges={[...graph.edgesById.values()]} onFocus={(id) => { setGraph((current) => ({ ...current, selectedId: id })); onFocus(id); }} /> : null}</div>;
}
