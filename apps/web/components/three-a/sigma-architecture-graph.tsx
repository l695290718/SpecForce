"use client";

import type Sigma from "sigma";
import { useEffect, useMemo, useRef, useState } from "react";
import { deterministicLayout, refineArchitectureGraphLayout, type LayoutWorkerRequest, type LayoutWorkerResponse } from "./architecture-graph-layout-worker";
import { edgeOpacity, nodeColor, nodeSize, visibleLabel, type ArchitectureGraphStore, type GraphEdgeAttributes, type GraphNodeAttributes } from "./architecture-graph-store";
import type { ArchitectureGraphSemanticState } from "./architecture-graph-state";

export type ArchitectureGraphView = "overview" | "explore" | "impact";
export type RendererFailureReason = "WEBGL_UNAVAILABLE" | "WEBGL_CONTEXT_LOST" | "SIGMA_ERROR" | "WORKER_ERROR";

export interface SigmaArchitectureGraphProps {
  store: ArchitectureGraphStore;
  view: ArchitectureGraphView;
  selectedId?: string;
  reducedMotion: boolean;
  semanticState?: ArchitectureGraphSemanticState;
  retryKey?: number;
  onNodeSelect(id: string): void;
  onNodeHover?(id?: string): void;
  onEdgeSelect(id: string): void;
  onRendererFailure(reason: RendererFailureReason): void;
  onRendererReady?(): void;
}

type SigmaInstance = Sigma<GraphNodeAttributes, GraphEdgeAttributes>;
const LAYOUT_RUNTIME_MS = 1_500;

export function SigmaArchitectureGraph({ store, view, selectedId, reducedMotion, semanticState, retryKey = 0, onNodeSelect, onNodeHover, onEdgeSelect, onRendererFailure, onRendererReady }: SigmaArchitectureGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<SigmaInstance | undefined>(undefined);
  const callbacksRef = useRef({ onNodeSelect, onNodeHover, onEdgeSelect, onRendererFailure, onRendererReady });
  const selectedRef = useRef(selectedId);
  const hoverRef = useRef<string | undefined>(undefined);
  const semanticStateRef = useRef(semanticState);
  const [layoutVersion, setLayoutVersion] = useState(0);
  callbacksRef.current = { onNodeSelect, onNodeHover, onEdgeSelect, onRendererFailure, onRendererReady };
  selectedRef.current = selectedId;
  semanticStateRef.current = semanticState;
  const layoutRequest = useMemo(() => createLayoutRequest(store, view, reducedMotion), [store, view, reducedMotion, layoutVersion]);

  useEffect(() => {
    let cancelled = false;
    let worker: Worker | undefined;
    const apply = (response: LayoutWorkerResponse) => {
      if (cancelled) return;
      applyLayoutPositions(store, response.positions);
      if (response.type === "failed") callbacksRef.current.onRendererFailure("WORKER_ERROR");
      sigmaRef.current?.refresh();
      setLayoutVersion((version) => version + 1);
    };
    if (reducedMotion) {
      apply({ type: "complete", positions: deterministicLayout(layoutRequest) });
      return () => { cancelled = true; };
    }
    try {
      worker = new Worker(new URL("./architecture-graph-layout-worker.ts", import.meta.url));
      worker.addEventListener("message", (event: MessageEvent<LayoutWorkerResponse>) => apply(event.data), { once: true });
      worker.addEventListener("error", () => apply({ type: "failed", positions: deterministicLayout(layoutRequest), reason: "WORKER_ERROR" }), { once: true });
      worker.postMessage(layoutRequest);
    } catch {
      apply(refineArchitectureGraphLayout(layoutRequest));
    }
    return () => { cancelled = true; worker?.terminate(); };
  }, [layoutRequest, reducedMotion, store]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let contextLossHandler: ((event: Event) => void) | undefined;
    const teardown = () => { observer?.disconnect(); sigmaRef.current?.kill(); sigmaRef.current = undefined; };
    void import("sigma").then(({ default: SigmaRenderer }) => {
      if (disposed) return;
      const sigma = new SigmaRenderer(store.graph, container, createSigmaSettings(store, selectedRef, hoverRef, semanticStateRef));
      sigmaRef.current = sigma;
      sigma.on("clickNode", ({ node }) => callbacksRef.current.onNodeSelect(node));
      sigma.on("clickEdge", ({ edge }) => callbacksRef.current.onEdgeSelect(edge));
      sigma.on("enterNode", ({ node }) => { hoverRef.current = node; callbacksRef.current.onNodeHover?.(node); sigma.refresh(); });
      sigma.on("leaveNode", () => { hoverRef.current = undefined; callbacksRef.current.onNodeHover?.(); sigma.refresh(); });
      observer = new ResizeObserver(() => sigma.resize());
      observer.observe(container);
      contextLossHandler = (event) => { event.preventDefault(); teardown(); callbacksRef.current.onRendererFailure("WEBGL_CONTEXT_LOST"); };
      container.addEventListener("webglcontextlost", contextLossHandler, true);
      focusSelectedNode(sigma, store, selectedRef.current, reducedMotion);
      callbacksRef.current.onRendererReady?.();
    }).catch(() => callbacksRef.current.onRendererFailure("WEBGL_UNAVAILABLE"));
    return () => { disposed = true; if (contextLossHandler) container.removeEventListener("webglcontextlost", contextLossHandler, true); teardown(); };
  }, [retryKey, store, reducedMotion]);

  useEffect(() => { const sigma = sigmaRef.current; if (!sigma) return; focusSelectedNode(sigma, store, selectedId, reducedMotion); sigma.refresh(); }, [selectedId, store, reducedMotion, semanticState]);
  return <div className="h-[clamp(36rem,calc(100dvh-12rem),52rem)] min-h-0 w-full overflow-hidden" data-testid="sigma-architecture-graph" ref={containerRef} />;
}

export function createLayoutRequest(store: ArchitectureGraphStore, view: ArchitectureGraphView, reducedMotion: boolean): LayoutWorkerRequest {
  const snapshot = store.snapshot();
  return { type: "refine", layout: view === "overview" ? "overview" : "explore", nodes: snapshot.nodes.map(({ id, attributes }) => ({ id, x: attributes.x, y: attributes.y, degree: attributes.degree })), edges: snapshot.edges.map(({ source, target, attributes }) => ({ source, target, weight: attributes.weight })), seed: stableSeed(`${store.identity.applicationServiceId}:${store.identity.baselineId}:${store.identity.projectionManifestId}:${view}`), maxRuntimeMs: LAYOUT_RUNTIME_MS, reducedMotion };
}

export function applyLayoutPositions(store: ArchitectureGraphStore, positions: readonly { id: string; x: number; y: number }[]): void {
  for (const position of positions) if (store.graph.hasNode(position.id)) store.graph.mergeNodeAttributes(position.id, { x: position.x, y: position.y });
}

export function createSigmaSettings(store: ArchitectureGraphStore, selectedRef: React.RefObject<string | undefined>, hoverRef: React.RefObject<string | undefined>, semanticStateRef: React.RefObject<ArchitectureGraphSemanticState | undefined>) {
  return {
    allowInvalidContainer: false,
    renderEdgeLabels: false,
    labelRenderedSizeThreshold: 10,
    zIndex: true,
    nodeReducer: (nodeId: string, data: GraphNodeAttributes) => {
      const semantic = semanticStateRef.current;
      const selected = selectedRef.current === nodeId;
      const hovered = hoverRef.current === nodeId;
      return { ...data, color: nodeColor(data), size: nodeSize({ ...data, stableId: nodeId }, semantic), label: visibleLabel({ ...data, stableId: nodeId }, semantic ?? 1, { selected, hovered }) ?? null, forceLabel: selected || hovered, highlighted: selected || hovered || data.highlighted === true, zIndex: selected ? 3 : hovered ? 2 : 1, hidden: false };
    },
    edgeReducer: (edgeId: string, data: GraphEdgeAttributes) => {
      const source = store.graph.source(edgeId);
      const target = store.graph.target(edgeId);
      return { ...data, color: edgeColor(data, edgeOpacity({ source, target, attributes: data }, semanticStateRef.current)), size: Math.max(0.45, Math.min(3.2, data.weight * 0.75)), hidden: false, zIndex: data.highlighted ? 2 : 0 };
    }
  };
}

export function focusSelectedNode(sigma: Pick<SigmaInstance, "getCamera" | "getNodeDisplayData">, store: ArchitectureGraphStore, selectedId: string | undefined, reducedMotion: boolean): void {
  if (!selectedId || !store.graph.hasNode(selectedId)) return;
  const attributes = store.graph.getNodeAttributes(selectedId);
  const state = { x: attributes.x, y: attributes.y, ratio: 0.72 };
  const camera = sigma.getCamera();
  if (reducedMotion) camera.setState(state);
  else void camera.animate(state, { duration: 180 });
}

function edgeColor(edge: GraphEdgeAttributes, opacity: number): string { return `rgba(${edge.bridge ? "77,97,122" : "100,116,139"},${Math.max(0.08, Math.min(1, opacity))})`; }
function stableSeed(value: string): number { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return hash >>> 0; }
