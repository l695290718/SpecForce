"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import React from "react";
import { useMemo, useState } from "react";
import type { ArchitectureGraphStore, GraphSemanticEdge, GraphSemanticNode } from "./architecture-graph-store";
import { SigmaArchitectureGraph, type ArchitectureGraphView, type RendererFailureReason, type SigmaArchitectureGraphController } from "./sigma-architecture-graph";
import type { LayoutLifecycle, LayoutRunMode } from "./architecture-graph-layout-worker";
import { ArchitectureRelationshipInspector } from "./architecture-relationship-inspector";
import { ArchitecturePathList } from "./architecture-path-list";

export interface ArchitectureGraphRendererProps {
  store: ArchitectureGraphStore;
  view: ArchitectureGraphView;
  layoutMode: LayoutRunMode;
  selectedId?: string;
  reducedMotion: boolean;
  onNodeSelect(id: string): void;
  onEdgeSelect(id: string): void;
  onRendererFailure(reason: Exclude<RendererFailureReason, "WORKER_ERROR">): void;
  onStageClick?(): void;
  onControllerReady?(controller: SigmaArchitectureGraphController): void;
  onLayoutLifecycleChange?(lifecycle: LayoutLifecycle): void;
}

export function ArchitectureGraphRenderer({ store, view, layoutMode, selectedId, reducedMotion, onNodeSelect, onEdgeSelect, onRendererFailure, onStageClick, onControllerReady, onLayoutLifecycleChange }: ArchitectureGraphRendererProps) {
  const [failure, setFailure] = useState<RendererFailureReason>();
  const [retryKey, setRetryKey] = useState(0);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string>();
  const snapshot = store.snapshot();
  const selectedEdge = useMemo(() => snapshot.edges.find((edge) => edge.id === selectedEdgeId), [selectedEdgeId, snapshot.edges]);
  const fail = (reason: RendererFailureReason) => { if (reason === "WORKER_ERROR") return; setFailure(reason); onRendererFailure(reason); };
  const selectEdge = (edgeId: string) => { setSelectedEdgeId(edgeId); onEdgeSelect(edgeId); };
  return <section className="min-w-0" data-testid="architecture-graph-renderer">
    {failure ? <ArchitectureGraphListFallback reason={failure} nodes={snapshot.nodes} edges={snapshot.edges} onNodeSelect={onNodeSelect} onEdgeSelect={selectEdge} onRetry={() => { setFailure(undefined); setRetryKey((key) => key + 1); }} /> : <SigmaArchitectureGraph store={store} view={view} layoutMode={layoutMode} selectedId={selectedId} reducedMotion={reducedMotion} retryKey={retryKey} onNodeSelect={onNodeSelect} onStageClick={onStageClick} onEdgeSelect={selectEdge} onRendererFailure={fail} onControllerReady={onControllerReady} onLayoutLifecycleChange={onLayoutLifecycleChange} />}
    {selectedEdge ? <div className="mt-3"><ArchitectureRelationshipInspector edge={selectedEdge} onClose={() => setSelectedEdgeId(undefined)} /></div> : null}
  </section>;
}

export function ArchitectureGraphListFallback({ reason, nodes, edges, onNodeSelect, onEdgeSelect, onRetry }: { reason: RendererFailureReason; nodes: readonly GraphSemanticNode[]; edges: readonly GraphSemanticEdge[]; onNodeSelect(id: string): void; onEdgeSelect(id: string): void; onRetry(): void; }) {
  const visibleNodes = nodes.slice(0, 80);
  return <div className="h-[clamp(36rem,calc(100dvh-12rem),52rem)] min-h-0 overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-4" data-testid="architecture-graph-fallback" role="status"><div className="flex items-start justify-between gap-4 border-b border-amber-200 pb-3"><div className="flex gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-700" size={18} /><div><p className="text-sm font-semibold text-amber-950">WebGL renderer unavailable</p><p className="mt-1 text-xs text-amber-800">{rendererFailureDescription(reason)}. The loaded graph remains available as a semantic list.</p></div></div><button className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2 text-xs font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-700" onClick={onRetry} type="button"><RefreshCw size={14} />Retry renderer</button></div><ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Architecture graph nodes">{visibleNodes.map(({ id, attributes }) => <li key={id}><button className="w-full rounded-md border border-amber-200 bg-white p-3 text-left text-sm text-ink focus:outline-none focus:ring-2 focus:ring-amber-700" onClick={() => onNodeSelect(id)} type="button"><span className="block truncate font-semibold">{attributes.label}</span><span className="mt-1 block font-mono text-[11px] text-muted">{attributes.layer ?? attributes.kind} · {id}</span></button></li>)}</ul>{nodes.length > visibleNodes.length ? <p className="mt-3 text-xs text-amber-800">Showing the first {visibleNodes.length} of {nodes.length} loaded graph nodes.</p> : null}<div className="mt-4"><ArchitecturePathList edges={edges} onFocus={onNodeSelect} onEdgeSelect={onEdgeSelect} /></div></div>;
}

export function rendererFailureDescription(reason: RendererFailureReason): string {
  switch (reason) { case "WEBGL_CONTEXT_LOST": return "The browser lost its WebGL context"; case "WEBGL_UNAVAILABLE": return "WebGL is not available in this browser"; case "SIGMA_ERROR": return "The Sigma renderer could not be initialized"; case "WORKER_ERROR": return "Layout refinement failed; deterministic positions are in use"; }
}
