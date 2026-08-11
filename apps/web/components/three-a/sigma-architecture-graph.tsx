"use client";

import type Sigma from "sigma";
import type { EdgeProgramType } from "sigma/rendering";
import { useEffect, useMemo, useRef } from "react";
import { GRAPH_CAMERA_TRANSITION_MS, GRAPH_LAYOUT_TRANSITION_MS, GRAPH_PULSE_MS, interpolateGraphPositions, type GraphPulseState } from "./architecture-graph-motion";
import { deterministicLayout, refineArchitectureGraphLayout, type LayoutLifecycle, type LayoutRunMode, type LayoutWorkerRequest, type LayoutWorkerResponse } from "./architecture-graph-layout-worker";
import { nodeColor, nodeSize, oneHopNeighborhood, visibleLabel, type ArchitectureGraphStore, type GraphEdgeAttributes, type GraphNodeAttributes } from "./architecture-graph-store";
import type { ArchitectureGraphSemanticState } from "./architecture-graph-state";

export type ArchitectureGraphView = "overview" | "explore" | "impact";
export type RendererFailureReason = "WEBGL_UNAVAILABLE" | "WEBGL_CONTEXT_LOST" | "SIGMA_ERROR" | "WORKER_ERROR";

export interface SigmaArchitectureGraphController {
  zoomIn(): void;
  zoomOut(): void;
  resetCamera(): void;
  focusSelectedNode(): void;
  startLayout(): void;
  stopLayout(): void;
  restartLayout(): void;
  clearSelection(): void;
}

export interface SigmaArchitectureGraphLayoutActions {
  start(): void;
  stop(): void;
  restart(): void;
}

export function createSigmaArchitectureGraphController({
  sigma,
  store,
  selectedRef,
  reducedMotion,
  lifecycleRef,
  layoutActions,
  clearSelection
}: {
  sigma: Pick<SigmaInstance, "getCamera">;
  store: ArchitectureGraphStore;
  selectedRef: React.RefObject<string | undefined>;
  reducedMotion: boolean;
  lifecycleRef: React.RefObject<LayoutLifecycle>;
  layoutActions: React.RefObject<SigmaArchitectureGraphLayoutActions>;
  clearSelection(): void;
}): SigmaArchitectureGraphController {
  return {
    zoomIn: () => { void sigma.getCamera().animatedZoom({ duration: 160 }); },
    zoomOut: () => { void sigma.getCamera().animatedUnzoom({ duration: 160 }); },
    resetCamera: () => {
      if (reducedMotion) sigma.getCamera().setState({ x: 0, y: 0, ratio: 1, angle: 0 });
      else void sigma.getCamera().animatedReset({ duration: GRAPH_CAMERA_TRANSITION_MS });
    },
    focusSelectedNode: () => focusSelectedNode(sigma, store, selectedRef.current, reducedMotion),
    startLayout: () => { if (lifecycleRef.current !== "running") layoutActions.current.start(); },
    stopLayout: () => { if (lifecycleRef.current === "running") layoutActions.current.stop(); },
    restartLayout: () => layoutActions.current.restart(),
    clearSelection
  };
}

export interface SigmaArchitectureGraphProps {
  store: ArchitectureGraphStore;
  view: ArchitectureGraphView;
  layoutMode: LayoutRunMode;
  selectedId?: string;
  reducedMotion: boolean;
  semanticState?: ArchitectureGraphSemanticState;
  retryKey?: number;
  onNodeSelect(id: string): void;
  onNodeHover?(id?: string): void;
  onStageClick?(): void;
  onEdgeSelect(id: string): void;
  onRendererFailure(reason: RendererFailureReason): void;
  onRendererReady?(): void;
  onControllerReady?(controller: SigmaArchitectureGraphController): void;
  onLayoutLifecycleChange?(lifecycle: LayoutLifecycle): void;
}

type SigmaInstance = Sigma<GraphNodeAttributes, GraphEdgeAttributes>;
type SigmaEdgeProgram = EdgeProgramType<GraphNodeAttributes, GraphEdgeAttributes>;
type GraphVisualSelection = Pick<ArchitectureGraphSemanticState, "selectedId" | "hoveredId" | "neighborhoodIds">;
type GraphNodeInput = GraphNodeAttributes & Partial<{ size: number }>;
type GraphEdgeInput =
  | { source: string; target: string; attributes: GraphEdgeAttributes }
  | (GraphEdgeAttributes & { source: string; target: string });

export interface GraphNodeVisualState {
  x: number;
  y: number;
  color: string;
  size: number;
  label: string | null;
  forceLabel: boolean;
  highlighted: boolean;
  hidden: boolean;
  zIndex: number;
  opacity: number;
}

export interface GraphEdgeVisualState {
  color: string;
  size: number;
  hidden: boolean;
  highlighted: boolean;
  zIndex: number;
  opacity: number;
}

export function createNodeVisualState(nodeId: string, data: GraphNodeInput, state: Partial<GraphVisualSelection> = {}): GraphNodeVisualState {
  const selected = state.selectedId === nodeId;
  const hovered = state.hoveredId === nodeId;
  const neighborhoodIds = state.neighborhoodIds ?? new Set<string>();
  const neighbor = !selected && neighborhoodIds.has(nodeId);
  const hasSelection = Boolean(state.selectedId);
  const unrelated = hasSelection && !selected && !hovered && !neighbor;
  const baseSize = typeof data.size === "number" ? data.size : nodeSize({ ...data, stableId: data.stableId ?? nodeId });
  const labelState = state.selectedId || state.hoveredId || neighborhoodIds.size ? state : 0.72;
  const label = visibleLabel({ ...data, stableId: data.stableId ?? nodeId }, labelState as ArchitectureGraphSemanticState | number, { selected, hovered });

  return {
    x: data.x,
    y: data.y,
    color: unrelated ? "rgba(100,116,139,0.24)" : nodeColor(data),
    size: selected ? baseSize * 1.32 : hovered ? baseSize * 1.12 : neighbor ? baseSize * 1.08 : unrelated ? Math.max(3, baseSize * 0.58) : baseSize,
    label: label ?? null,
    forceLabel: selected || hovered,
    highlighted: selected || hovered || neighbor || (!hasSelection && data.highlighted === true),
    hidden: false,
    zIndex: selected ? 3 : hovered ? 2 : neighbor ? 1 : 0,
    opacity: unrelated ? 0.24 : 1
  };
}

export function createEdgeVisualState(edge: GraphEdgeInput, state: Partial<GraphVisualSelection> = {}, layoutAnimating = false): GraphEdgeVisualState {
  const attributes = "attributes" in edge ? edge.attributes : edge;
  const focusId = state.selectedId ?? state.hoveredId;
  const neighborhoodIds = state.neighborhoodIds ?? new Set<string>();
  const highlighted = neighborhoodIds.has(edge.source) && neighborhoodIds.has(edge.target);
  const connected = Boolean(focusId && (edge.source === focusId || edge.target === focusId)) || highlighted;
  const active = Boolean(state.selectedId || state.hoveredId || neighborhoodIds.size);
  const opacity = active ? (connected ? 0.94 : 0.08) : attributes.opacity ?? 0.72;
  const size = active
    ? (connected ? Math.max(1.4, Math.min(4.2, attributes.weight * 1.2)) : 0.35)
    : Math.max(0.45, Math.min(3.2, attributes.weight * 0.75));

  return {
    color: edgeColor(attributes, opacity),
    size,
    hidden: layoutAnimating,
    highlighted: connected || attributes.highlighted === true,
    zIndex: connected && active ? 3 : attributes.highlighted ? 2 : 0,
    opacity
  };
}

export function drawArchitectureNodeHover(
  context: CanvasRenderingContext2D,
  data: { x: number; y: number; size: number; label: string | null; color: string },
  settings: { labelSize: number; labelFont: string; labelWeight: string }
): void {
  const size = data.size || 8;
  const color = data.color || "#6366f1";
  context.save();
  context.beginPath();
  context.arc(data.x, data.y, size + 4, 0, Math.PI * 2);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.globalAlpha = 0.5;
  context.stroke();
  context.globalAlpha = 1;

  if (data.label) {
    const fontSize = settings.labelSize || 11;
    context.font = `${settings.labelWeight || "500"} ${fontSize}px ${settings.labelFont || "sans-serif"}`;
    const width = context.measureText(data.label).width + 16;
    const height = fontSize + 10;
    const left = data.x - width / 2;
    const top = data.y - size - height - 8;
    context.fillStyle = "#12121c";
    context.beginPath();
    if (typeof context.roundRect === "function") context.roundRect(left, top, width, height, 4);
    else context.rect(left, top, width, height);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = "#f5f5f7";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(data.label, data.x, top + height / 2);
  }
  context.restore();
}

const LAYOUT_RUNTIME_MS = 1_500;

async function loadEdgeCurveProgram(): Promise<SigmaEdgeProgram | undefined> {
  try {
    return (await import("@sigma/edge-curve")).default as unknown as SigmaEdgeProgram;
  } catch {
    return undefined;
  }
}

export function SigmaArchitectureGraph({ store, view, layoutMode, selectedId, reducedMotion, semanticState, retryKey = 0, onNodeSelect, onNodeHover, onStageClick, onEdgeSelect, onRendererFailure, onRendererReady, onControllerReady, onLayoutLifecycleChange }: SigmaArchitectureGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<SigmaInstance | undefined>(undefined);
  const callbacksRef = useRef({ onNodeSelect, onNodeHover, onStageClick, onEdgeSelect, onRendererFailure, onRendererReady, onControllerReady, onLayoutLifecycleChange });
  const selectedRef = useRef(selectedId);
  const hoverRef = useRef<string | undefined>(undefined);
  const highlightedRef = useRef<ReadonlySet<string> | undefined>(undefined);
  const semanticStateRef = useRef(semanticState);
  const layoutFrameRef = useRef<number | undefined>(undefined);
  const layoutAnimatingRef = useRef(false);
  const pulseFrameRef = useRef<number | undefined>(undefined);
  const pulseRef = useRef<GraphPulseState | undefined>(undefined);
  const layoutWorkerRef = useRef<Worker | undefined>(undefined);
  const layoutRunIdRef = useRef(0);
  const layoutLifecycleRef = useRef<LayoutLifecycle>("seeded");
  const layoutActionsRef = useRef<SigmaArchitectureGraphLayoutActions>({ start: () => undefined, stop: () => undefined, restart: () => undefined });
  callbacksRef.current = { onNodeSelect, onNodeHover, onStageClick, onEdgeSelect, onRendererFailure, onRendererReady, onControllerReady, onLayoutLifecycleChange };
  semanticStateRef.current = semanticState;
  const graphShape = `${store.graph.order}:${store.graph.size}`;
  const layoutRequest = useMemo(() => createLayoutRequest(store, view, layoutMode, reducedMotion), [store, view, layoutMode, reducedMotion, graphShape]);

  const notifyLayoutLifecycle = (lifecycle: LayoutLifecycle) => {
    layoutLifecycleRef.current = lifecycle;
    callbacksRef.current.onLayoutLifecycleChange?.(lifecycle);
  };

  const cancelLayoutAnimation = () => {
    if (layoutFrameRef.current !== undefined) cancelAnimationFrame(layoutFrameRef.current);
    layoutFrameRef.current = undefined;
    layoutAnimatingRef.current = false;
  };

  const cancelLayoutRun = () => {
    layoutRunIdRef.current += 1;
    layoutWorkerRef.current?.terminate();
    layoutWorkerRef.current = undefined;
    cancelLayoutAnimation();
  };

  const cancelPulse = () => {
    if (pulseFrameRef.current !== undefined) cancelAnimationFrame(pulseFrameRef.current);
    pulseFrameRef.current = undefined;
    pulseRef.current = undefined;
  };

  const startPulse = (nodeId: string) => {
    cancelPulse();
    if (reducedMotion) return;
    pulseRef.current = { nodeId };
    const tick = (timestamp: number) => {
      const pulse = pulseRef.current;
      const sigma = sigmaRef.current;
      if (!pulse) return;
      if (!sigma) {
        pulseFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      pulse.startedAt ??= timestamp;
      if (timestamp - pulse.startedAt >= GRAPH_PULSE_MS) {
        cancelPulse();
        sigma.refresh();
        return;
      }
      sigma.refresh();
      pulseFrameRef.current = requestAnimationFrame(tick);
    };
    pulseFrameRef.current = requestAnimationFrame(tick);
  };

  const animateLayout = (positions: readonly { id: string; x: number; y: number }[], onComplete?: () => void) => {
    cancelLayoutAnimation();
    const current = store.snapshot().nodes.map(({ id, attributes }) => ({ id, x: attributes.x, y: attributes.y }));
    if (reducedMotion) {
      applyLayoutPositions(store, positions);
      sigmaRef.current?.refresh();
      onComplete?.();
      return;
    }
    layoutAnimatingRef.current = true;
    const startedAt = performance.now();
    const tick = (timestamp: number) => {
      const progress = Math.min(1, (timestamp - startedAt) / GRAPH_LAYOUT_TRANSITION_MS);
      applyLayoutPositions(store, interpolateGraphPositions(current, positions, progress));
      sigmaRef.current?.refresh();
      if (progress >= 1) {
        layoutFrameRef.current = undefined;
        layoutAnimatingRef.current = false;
        if (!selectedRef.current) void sigmaRef.current?.getCamera().animatedReset({ duration: GRAPH_CAMERA_TRANSITION_MS });
        sigmaRef.current?.refresh();
        onComplete?.();
        return;
      }
      layoutFrameRef.current = requestAnimationFrame(tick);
    };
    layoutFrameRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      cancelLayoutRun();
      const runId = layoutRunIdRef.current;
      notifyLayoutLifecycle("running");
      const apply = (response: LayoutWorkerResponse) => {
        if (cancelled || runId !== layoutRunIdRef.current) return;
        layoutWorkerRef.current = undefined;
        if (response.type === "failed") {
          animateLayout(response.positions, () => notifyLayoutLifecycle("failed"));
          callbacksRef.current.onRendererFailure("WORKER_ERROR");
          return;
        }
        animateLayout(response.positions, () => notifyLayoutLifecycle(response.lifecycle ?? "settled"));
      };
      if (reducedMotion) {
        apply({ type: "complete", positions: deterministicLayout(layoutRequest), lifecycle: "stopped" });
        return;
      }
      try {
        const worker = new Worker(new URL("./architecture-graph-layout-worker.ts", import.meta.url));
        layoutWorkerRef.current = worker;
        worker.addEventListener("message", (event: MessageEvent<LayoutWorkerResponse>) => apply(event.data), { once: true });
        worker.addEventListener("error", () => apply({ type: "failed", positions: deterministicLayout(layoutRequest), lifecycle: "failed", reason: "WORKER_ERROR" }), { once: true });
        worker.postMessage(layoutRequest);
      } catch {
        apply(refineArchitectureGraphLayout(layoutRequest));
      }
    };
    const stop = () => {
      cancelLayoutRun();
      notifyLayoutLifecycle("stopped");
    };
    const restart = () => {
      stop();
      run();
    };
    layoutActionsRef.current = { start: run, stop, restart };
    run();
    return () => {
      cancelled = true;
      cancelLayoutRun();
      if (layoutActionsRef.current.start === run) layoutActionsRef.current = { start: () => undefined, stop: () => undefined, restart: () => undefined };
    };
  }, [layoutRequest, reducedMotion, store]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window === "undefined") return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let contextLossHandler: ((event: Event) => void) | undefined;
    const teardown = () => { observer?.disconnect(); sigmaRef.current?.kill(); sigmaRef.current = undefined; };
    void import("sigma").then(async ({ default: SigmaRenderer }) => {
      if (disposed) return;
      const edgeCurveProgram = await loadEdgeCurveProgram();
      if (disposed) return;
      const sigma = new SigmaRenderer(store.graph, container, createSigmaSettings(store, selectedRef, hoverRef, semanticStateRef, layoutAnimatingRef, pulseRef, highlightedRef, edgeCurveProgram));
      sigmaRef.current = sigma;
      const clearSelection = () => {
        selectedRef.current = undefined;
        hoverRef.current = undefined;
        highlightedRef.current = new Set();
        store.select(undefined);
        cancelPulse();
        callbacksRef.current.onNodeHover?.();
        callbacksRef.current.onStageClick?.();
        sigma.refresh();
      };
      const controller = createSigmaArchitectureGraphController({ sigma, store, selectedRef, reducedMotion, lifecycleRef: layoutLifecycleRef, layoutActions: layoutActionsRef, clearSelection });
      callbacksRef.current.onControllerReady?.(controller);
      sigma.on("clickNode", ({ node }) => {
        selectedRef.current = node;
        highlightedRef.current = oneHopNeighborhood(store.graph, node);
        store.select(node);
        startPulse(node);
        focusSelectedNode(sigma, store, node, reducedMotion);
        sigma.refresh();
        callbacksRef.current.onNodeSelect(node);
      });
      sigma.on("clickEdge", ({ edge }) => callbacksRef.current.onEdgeSelect(edge));
      sigma.on("enterNode", ({ node }) => { hoverRef.current = node; startPulse(node); callbacksRef.current.onNodeHover?.(node); sigma.refresh(); });
      sigma.on("leaveNode", () => { hoverRef.current = undefined; cancelPulse(); callbacksRef.current.onNodeHover?.(); sigma.refresh(); });
      sigma.on("clickStage", () => {
        clearSelection();
      });
      observer = new ResizeObserver(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) sigma.resize();
      });
      observer.observe(container);
      contextLossHandler = (event) => { event.preventDefault(); teardown(); callbacksRef.current.onRendererFailure("WEBGL_CONTEXT_LOST"); };
      container.addEventListener("webglcontextlost", contextLossHandler, true);
      focusSelectedNode(sigma, store, selectedRef.current, reducedMotion);
      callbacksRef.current.onRendererReady?.();
    }).catch(() => callbacksRef.current.onRendererFailure("WEBGL_UNAVAILABLE"));
    return () => { disposed = true; if (contextLossHandler) container.removeEventListener("webglcontextlost", contextLossHandler, true); cancelPulse(); cancelLayoutAnimation(); teardown(); };
  }, [retryKey, store, reducedMotion]);

  useEffect(() => {
    selectedRef.current = selectedId;
    highlightedRef.current = selectedId ? oneHopNeighborhood(store.graph, selectedId) : new Set();
    store.select(selectedId);
    const sigma = sigmaRef.current;
    if (!sigma) return;
    focusSelectedNode(sigma, store, selectedId, reducedMotion);
    sigma.refresh();
  }, [selectedId, store, reducedMotion]);

  useEffect(() => {
    if (semanticState?.neighborhoodIds.size) highlightedRef.current = semanticState.neighborhoodIds;
    else if (selectedRef.current) highlightedRef.current = oneHopNeighborhood(store.graph, selectedRef.current);
    else highlightedRef.current = new Set();
    sigmaRef.current?.refresh();
  }, [semanticState, store]);
  return <div className="h-[clamp(36rem,calc(100dvh-12rem),52rem)] min-h-0 w-full overflow-hidden" data-testid="sigma-architecture-graph" ref={containerRef} />;
}

export function createLayoutRequest(store: ArchitectureGraphStore, _view: ArchitectureGraphView, layoutMode: LayoutRunMode, reducedMotion: boolean): LayoutWorkerRequest {
  const snapshot = store.snapshot();
  return { type: "refine", layout: layoutMode, nodes: snapshot.nodes.map(({ id, attributes }) => ({ id, x: attributes.x, y: attributes.y, degree: attributes.degree, layer: attributes.layer })), edges: snapshot.edges.map(({ source, target, attributes }) => ({ source, target, weight: attributes.weight })), seed: stableSeed(`${store.identity.applicationServiceId}:${store.identity.baselineId}:${store.identity.projectionManifestId}:${layoutMode}`), maxRuntimeMs: LAYOUT_RUNTIME_MS, reducedMotion };
}

export function applyLayoutPositions(store: ArchitectureGraphStore, positions: readonly { id: string; x: number; y: number }[]): void {
  for (const position of positions) if (store.graph.hasNode(position.id)) store.graph.mergeNodeAttributes(position.id, { x: position.x, y: position.y });
}

export function createSigmaSettings(
  store: ArchitectureGraphStore,
  selectedRef: React.RefObject<string | undefined>,
  hoverRef: React.RefObject<string | undefined>,
  semanticStateRef: React.RefObject<ArchitectureGraphSemanticState | undefined>,
  layoutAnimatingRef: React.RefObject<boolean> = { current: false },
  pulseRef: React.RefObject<GraphPulseState | undefined> = { current: undefined },
  highlightedRef: React.RefObject<ReadonlySet<string> | undefined> = { current: undefined },
  edgeCurveProgram?: SigmaEdgeProgram
) {
  const edgeProgramClasses: Record<string, SigmaEdgeProgram> = edgeCurveProgram ? { curved: edgeCurveProgram } : {};
  return {
    allowInvalidContainer: false,
    renderLabels: true,
    renderEdgeLabels: false,
    defaultEdgeType: edgeCurveProgram ? "curved" : "line",
    edgeProgramClasses,
    defaultDrawNodeHover: drawArchitectureNodeHover,
    labelRenderedSizeThreshold: 10,
    zIndex: true,
    nodeReducer: (nodeId: string, data: GraphNodeAttributes) => {
      const semantic = semanticStateRef.current;
      const neighborhoodIds = highlightedRef.current ?? semantic?.neighborhoodIds ?? new Set<string>();
      const visual = createNodeVisualState(nodeId, data, { selectedId: selectedRef.current, hoveredId: hoverRef.current, neighborhoodIds });
      const pulse = pulseRef.current;
      const pulseProgress = pulse?.nodeId === nodeId && pulse.startedAt !== undefined ? Math.min(1, Math.max(0, (performance.now() - pulse.startedAt) / GRAPH_PULSE_MS)) : 0;
      const pulseScale = pulseProgress ? 1 + Math.sin(pulseProgress * Math.PI) * 0.28 : 1;
      return { ...data, ...visual, size: visual.size * pulseScale };
    },
    edgeReducer: (edgeId: string, data: GraphEdgeAttributes) => {
      const source = store.graph.source(edgeId);
      const target = store.graph.target(edgeId);
      const semantic = semanticStateRef.current;
      const neighborhoodIds = highlightedRef.current ?? semantic?.neighborhoodIds ?? new Set<string>();
      const visual = createEdgeVisualState({ source, target, attributes: data }, { selectedId: selectedRef.current, hoveredId: hoverRef.current, neighborhoodIds }, layoutAnimatingRef.current === true);
      return { ...data, ...visual };
    }
  };
}

export function focusSelectedNode(sigma: Pick<SigmaInstance, "getCamera">, store: ArchitectureGraphStore, selectedId: string | undefined, reducedMotion: boolean): void {
  if (!selectedId || !store.graph.hasNode(selectedId)) return;
  const attributes = store.graph.getNodeAttributes(selectedId);
  const state = { x: attributes.x, y: attributes.y, ratio: 0.72 };
  const camera = sigma.getCamera();
  if (reducedMotion) camera.setState(state);
  else void camera.animate(state, { duration: 180 });
}

function edgeColor(edge: GraphEdgeAttributes, opacity: number): string { return `rgba(${edge.bridge ? "77,97,122" : "100,116,139"},${Math.max(0.08, Math.min(1, opacity))})`; }
function stableSeed(value: string): number { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return hash >>> 0; }
