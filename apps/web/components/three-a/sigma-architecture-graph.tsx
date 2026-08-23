"use client";

import type Sigma from "sigma";
import type { EdgeProgramType } from "sigma/rendering";
import { MultiDirectedGraph } from "graphology";
import FA2LayoutSupervisor from "graphology-layout-forceatlas2/worker";
import noverlap from "graphology-layout-noverlap";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { GRAPH_CAMERA_TRANSITION_MS, GRAPH_PULSE_MS, type GraphPulseState } from "./architecture-graph-motion";
import { deterministicLayout, type LayoutLifecycle, type LayoutRunMode, type LayoutWorkerRequest } from "./architecture-graph-layout-worker";
import { NOVERLAP_PARAMETERS, forceSettings, runForceArchitectureLayout } from "./architecture-graph-layout-force";
import { nodeColor, nodeSize, oneHopNeighborhood, visibleLabel, type ArchitectureGraphStore, type GraphEdgeAttributes, type GraphNodeAttributes } from "./architecture-graph-store";
import { relationColor } from "./architecture-graph-relations";
import { ArchitectureGraphMinimap } from "./architecture-graph-minimap";
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
  hiddenRelations?: ReadonlySet<string>;
  collapsedClusterIds?: ReadonlySet<string>;
  visibleNodeIds?: ReadonlySet<string>;
  visibleEdgeIds?: ReadonlySet<string>;
  overlay?: ReactNode;
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
const EMPTY_RELATION_FILTER: ReadonlySet<string> = new Set<string>();
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

export function createEdgeVisualState(edge: GraphEdgeInput, state: Partial<GraphVisualSelection> & { hiddenRelations?: ReadonlySet<string> } = {}, layoutAnimating = false): GraphEdgeVisualState {
  const attributes = "attributes" in edge ? edge.attributes : edge;
  if (state.hiddenRelations?.has(attributes.relationCode)) return { color: "transparent", size: 0, hidden: true, highlighted: false, zIndex: 0, opacity: 0 };
  const focusId = state.selectedId ?? state.hoveredId;
  const neighborhoodIds = state.neighborhoodIds ?? new Set<string>();
  const highlighted = neighborhoodIds.has(edge.source) && neighborhoodIds.has(edge.target);
  const connected = Boolean(focusId && (edge.source === focusId || edge.target === focusId)) || highlighted;
  const active = Boolean(state.selectedId || state.hoveredId || neighborhoodIds.size);
  const opacity = active ? (connected ? 0.94 : 0.08) : attributes.opacity ?? 0.72;
  const size = active
    ? (connected ? Math.max(1.4, Math.min(4.2, attributes.weight * 1.2)) : 0.35)
    : Math.max(0.45, Math.min(3.2, attributes.weight * 0.75));
  const moving = layoutAnimating && !active;
  const effectiveOpacity = moving ? Math.max(0.14, opacity * 0.6) : opacity;

  return {
    color: relationColor(attributes.relationCode, effectiveOpacity),
    size: moving ? size * 0.8 : size,
    hidden: false,
    highlighted: connected || attributes.highlighted === true,
    zIndex: connected && active ? 3 : attributes.highlighted ? 2 : 0,
    opacity: effectiveOpacity
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

export function SigmaArchitectureGraph({ store, view, layoutMode, selectedId, reducedMotion, semanticState, retryKey = 0, hiddenRelations, collapsedClusterIds, visibleNodeIds, visibleEdgeIds, overlay, onNodeSelect, onNodeHover, onStageClick, onEdgeSelect, onRendererFailure, onRendererReady, onControllerReady, onLayoutLifecycleChange }: SigmaArchitectureGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<SigmaInstance | undefined>(undefined);
  const callbacksRef = useRef({ onNodeSelect, onNodeHover, onStageClick, onEdgeSelect, onRendererFailure, onRendererReady, onControllerReady, onLayoutLifecycleChange });
  const selectedRef = useRef(selectedId);
  const hoverRef = useRef<string | undefined>(undefined);
  const highlightedRef = useRef<ReadonlySet<string> | undefined>(undefined);
  const semanticStateRef = useRef(semanticState);
  const layoutAnimatingRef = useRef(false);
  const pulseFrameRef = useRef<number | undefined>(undefined);
  const pulseRef = useRef<GraphPulseState | undefined>(undefined);
  const supervisorRef = useRef<FA2LayoutSupervisor<GraphNodeAttributes, GraphEdgeAttributes> | undefined>(undefined);
  const layoutGraphRef = useRef<MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes> | undefined>(undefined);
  const layoutRefreshRef = useRef<number | undefined>(undefined);
  const layoutRunIdRef = useRef(0);
  const layoutLifecycleRef = useRef<LayoutLifecycle>("seeded");
  const layoutActionsRef = useRef<SigmaArchitectureGraphLayoutActions>({ start: () => undefined, stop: () => undefined, restart: () => undefined });
  const hiddenRelationsRef = useRef<ReadonlySet<string>>(hiddenRelations ?? EMPTY_RELATION_FILTER);
  hiddenRelationsRef.current = hiddenRelations ?? EMPTY_RELATION_FILTER;
  const collapsedClusterIdsRef = useRef<ReadonlySet<string>>(collapsedClusterIds ?? EMPTY_RELATION_FILTER);
  collapsedClusterIdsRef.current = collapsedClusterIds ?? EMPTY_RELATION_FILTER;
  const visibleNodeIdsRef = useRef<ReadonlySet<string> | undefined>(visibleNodeIds);
  visibleNodeIdsRef.current = visibleNodeIds;
  const visibleEdgeIdsRef = useRef<ReadonlySet<string> | undefined>(visibleEdgeIds);
  visibleEdgeIdsRef.current = visibleEdgeIds;
  callbacksRef.current = { onNodeSelect, onNodeHover, onStageClick, onEdgeSelect, onRendererFailure, onRendererReady, onControllerReady, onLayoutLifecycleChange };
  semanticStateRef.current = semanticState;
  const graphShape = `${store.graph.order}:${store.graph.size}`;
  const layoutRequest = useMemo(() => createLayoutRequest(store, view, layoutMode, reducedMotion, visibleNodeIds, visibleEdgeIds), [store, view, layoutMode, reducedMotion, graphShape, visibleNodeIds, visibleEdgeIds]);

  const notifyLayoutLifecycle = (lifecycle: LayoutLifecycle) => {
    layoutLifecycleRef.current = lifecycle;
    callbacksRef.current.onLayoutLifecycleChange?.(lifecycle);
  };

  const cancelLayoutRun = () => {
    layoutRunIdRef.current += 1;
    if (layoutRefreshRef.current !== undefined) {
      window.clearInterval(layoutRefreshRef.current);
      layoutRefreshRef.current = undefined;
    }
    const supervisor = supervisorRef.current;
    supervisorRef.current = undefined;
    if (supervisor) {
      try {
        supervisor.kill();
      } catch {
        // The supervisor worker may already be gone; killing is best-effort.
      }
    }
    layoutAnimatingRef.current = false;
  };

  const settleLayout = (lifecycle: LayoutLifecycle) => {
    const layoutGraph = layoutGraphRef.current;
    cancelLayoutRun();
    try {
      if (layoutGraph) {
        noverlap.assign(layoutGraph, NOVERLAP_PARAMETERS);
        applyLayoutGraphPositions(store, layoutGraph);
      }
    } catch {
      // Noverlap is a readability cleanup; settled force positions remain usable.
    }
    layoutGraphRef.current = undefined;
    sigmaRef.current?.refresh();
    if (!selectedRef.current) void sigmaRef.current?.getCamera().animatedReset({ duration: GRAPH_CAMERA_TRANSITION_MS });
    notifyLayoutLifecycle(lifecycle);
  };

  const startLayoutRun = () => {
    cancelLayoutRun();
    const runId = layoutRunIdRef.current;
    notifyLayoutLifecycle("running");
    const deterministic = deterministicLayout(layoutRequest);
    if (reducedMotion || layoutRequest.layout === "tree" || layoutRequest.layout === "circles" || layoutRequest.nodes.length < 2) {
      applyLayoutPositions(store, deterministic);
      layoutAnimatingRef.current = false;
      sigmaRef.current?.refresh();
      notifyLayoutLifecycle(reducedMotion ? "stopped" : "settled");
      return;
    }
    layoutAnimatingRef.current = true;
    try {
      const layoutGraph = createLayoutGraph(layoutRequest);
      layoutGraphRef.current = layoutGraph;
      const supervisor = new FA2LayoutSupervisor<GraphNodeAttributes, GraphEdgeAttributes>(layoutGraph, {
        settings: forceSettings(layoutGraph.order, layoutRequest.seed)
      });
      if (runId !== layoutRunIdRef.current) {
        supervisor.kill();
        return;
      }
      supervisorRef.current = supervisor;
      layoutRefreshRef.current = window.setInterval(() => { applyLayoutGraphPositions(store, layoutGraph); sigmaRef.current?.refresh(); }, 60);
      sigmaRef.current?.refresh();
      supervisor.start();
      if (!selectedRef.current) void sigmaRef.current?.getCamera().animatedReset({ duration: GRAPH_CAMERA_TRANSITION_MS });
    } catch {
      const fallback = runForceArchitectureLayout({
        nodes: layoutRequest.nodes,
        edges: layoutRequest.edges,
        seed: layoutRequest.seed,
        maxRuntimeMs: layoutRequest.maxRuntimeMs,
        runNoverlap: true
      });
      applyLayoutPositions(store, fallback.positions);
      layoutAnimatingRef.current = false;
      sigmaRef.current?.refresh();
      notifyLayoutLifecycle("failed");
      callbacksRef.current.onRendererFailure("WORKER_ERROR");
    }
  };

  const stopLayoutRun = () => {
    const supervisor = supervisorRef.current;
    if (!supervisor) {
      notifyLayoutLifecycle("settled");
      return;
    }
    try {
      supervisor.stop();
    } catch {
      // A stopped or killed supervisor is already terminal; settling proceeds.
    }
    settleLayout("settled");
  };

  const restartLayoutRun = () => {
    cancelLayoutRun();
    startLayoutRun();
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

  useEffect(() => {
    layoutActionsRef.current = { start: startLayoutRun, stop: stopLayoutRun, restart: restartLayoutRun };
    startLayoutRun();
    return () => {
      cancelLayoutRun();
      if (layoutActionsRef.current.start === startLayoutRun) layoutActionsRef.current = { start: () => undefined, stop: () => undefined, restart: () => undefined };
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
      const sigma = new SigmaRenderer(store.graph, container, createSigmaSettings(store, selectedRef, hoverRef, semanticStateRef, layoutAnimatingRef, pulseRef, highlightedRef, edgeCurveProgram, hiddenRelationsRef, collapsedClusterIdsRef, visibleNodeIdsRef, visibleEdgeIdsRef));
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
    return () => { disposed = true; if (contextLossHandler) container.removeEventListener("webglcontextlost", contextLossHandler, true); cancelPulse(); cancelLayoutRun(); teardown(); };
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
  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [collapsedClusterIds, hiddenRelations, visibleNodeIds, visibleEdgeIds]);
  const minimapCameraProvider = () => {
    const camera = sigmaRef.current?.getCamera();
    return camera ? { getState: () => camera.getState(), animate: (state: { x?: number; y?: number }, options?: { duration?: number }) => void camera.animate(state as never, options as never) } : undefined;
  };
  return (
    <div className="relative h-[clamp(36rem,calc(100dvh-12rem),52rem)] min-h-0 w-full overflow-hidden" data-testid="sigma-architecture-graph">
      <div className="h-full w-full" ref={containerRef} />
      <ArchitectureGraphMinimap store={store} cameraProvider={minimapCameraProvider} />
      {overlay ? <div className="pointer-events-none absolute inset-0">{overlay}</div> : null}
    </div>
  );
}

export function createLayoutRequest(
  store: ArchitectureGraphStore,
  _view: ArchitectureGraphView,
  layoutMode: LayoutRunMode,
  reducedMotion: boolean,
  visibleNodeIds?: ReadonlySet<string>,
  visibleEdgeIds?: ReadonlySet<string>
): LayoutWorkerRequest {
  const snapshot = store.snapshot();
  const nodeIds = visibleNodeIds ?? new Set(snapshot.nodes.map(({ id }) => id));
  const nodes = snapshot.nodes
    .filter(({ id }) => nodeIds.has(id))
    .map(({ id, attributes }) => ({ id, x: attributes.x, y: attributes.y, degree: attributes.degree, layer: attributes.layer }));
  const edges = snapshot.edges
    .filter(({ id, source, target }) => (!visibleEdgeIds || visibleEdgeIds.has(id)) && nodeIds.has(source) && nodeIds.has(target))
    .map(({ source, target, attributes }) => ({ source, target, weight: attributes.weight }));
  return { type: "refine", layout: layoutMode, nodes, edges, seed: stableSeed(`${store.identity.applicationServiceId}:${store.identity.baselineId}:${store.identity.projectionManifestId}:${layoutMode}`), maxRuntimeMs: LAYOUT_RUNTIME_MS, reducedMotion };
}

export function applyLayoutPositions(store: ArchitectureGraphStore, positions: readonly { id: string; x: number; y: number }[]): void {
  for (const position of positions) if (store.graph.hasNode(position.id)) store.graph.mergeNodeAttributes(position.id, { x: position.x, y: position.y });
}

function createLayoutGraph(request: LayoutWorkerRequest): MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes> {
  const graph = new MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>();
  for (const node of request.nodes) graph.addNode(node.id, { stableId: node.id, kind: "fact", label: node.id, layer: node.layer, memberCount: 1, degree: node.degree, criticality: 0, x: node.x, y: node.y });
  request.edges.forEach((edge, index) => graph.addDirectedEdgeWithKey(`layout:${index}:${edge.source}:${edge.target}`, edge.source, edge.target, { stableId: `layout:${index}`, relationCode: "LAYOUT", confidence: 1, bridge: false, weight: edge.weight }));
  return graph;
}

function applyLayoutGraphPositions(store: ArchitectureGraphStore, graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>): void {
  applyLayoutPositions(store, graph.nodes().map((id) => {
    const { x, y } = graph.getNodeAttributes(id);
    return { id, x, y };
  }));
}

export function createSigmaSettings(
  store: ArchitectureGraphStore,
  selectedRef: React.RefObject<string | undefined>,
  hoverRef: React.RefObject<string | undefined>,
  semanticStateRef: React.RefObject<ArchitectureGraphSemanticState | undefined>,
  layoutAnimatingRef: React.RefObject<boolean> = { current: false },
  pulseRef: React.RefObject<GraphPulseState | undefined> = { current: undefined },
  highlightedRef: React.RefObject<ReadonlySet<string> | undefined> = { current: undefined },
  edgeCurveProgram?: SigmaEdgeProgram,
  hiddenRelationsRef: React.RefObject<ReadonlySet<string>> = { current: EMPTY_RELATION_FILTER },
  collapsedClusterIdsRef: React.RefObject<ReadonlySet<string>> = { current: EMPTY_RELATION_FILTER },
  visibleNodeIdsRef: React.RefObject<ReadonlySet<string> | undefined> = { current: undefined },
  visibleEdgeIdsRef: React.RefObject<ReadonlySet<string> | undefined> = { current: undefined }
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
      if (visibleNodeIdsRef.current && !visibleNodeIdsRef.current.has(nodeId)) return { ...data, ...visual, hidden: true, size: 0, label: null, opacity: 0 };
      if (data.kind === "fact" && data.clusterId && collapsedClusterIdsRef.current.has(data.clusterId)) {
        return { ...data, ...visual, hidden: true, size: 0, label: null, opacity: 0 };
      }
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
      const visual = createEdgeVisualState({ source, target, attributes: data }, { selectedId: selectedRef.current, hoveredId: hoverRef.current, neighborhoodIds, hiddenRelations: hiddenRelationsRef.current }, layoutAnimatingRef.current === true);
      if ((visibleEdgeIdsRef.current && !visibleEdgeIdsRef.current.has(edgeId)) || (visibleNodeIdsRef.current && (!visibleNodeIdsRef.current.has(source) || !visibleNodeIdsRef.current.has(target)))) {
        return { ...data, ...visual, hidden: true, size: 0, opacity: 0 };
      }
      const sourceAttributes = store.graph.getNodeAttributes(source);
      const targetAttributes = store.graph.getNodeAttributes(target);
      const membershipCollapsed = data.relationCode === "ARCHITECTURE_MEMBERSHIP" && Boolean(
        (sourceAttributes.clusterId && collapsedClusterIdsRef.current.has(sourceAttributes.clusterId)) ||
        (targetAttributes.clusterId && collapsedClusterIdsRef.current.has(targetAttributes.clusterId))
      );
      if (membershipCollapsed) return { ...data, ...visual, hidden: true, size: 0, opacity: 0 };
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

function stableSeed(value: string): number { let hash = 2_166_136_261; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 16_777_619); } return hash >>> 0; }
