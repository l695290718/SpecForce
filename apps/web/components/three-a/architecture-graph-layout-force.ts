import { MultiDirectedGraph } from "graphology";
import forceAtlas2, { type ForceAtlas2Settings } from "graphology-layout-forceatlas2";
import noverlap from "graphology-layout-noverlap";
import type { LayoutLifecycle, LayoutWorkerEdge, LayoutWorkerNode, LayoutWorkerPosition } from "./architecture-graph-layout-worker";

export interface ForceLayoutRequest {
  nodes: readonly LayoutWorkerNode[];
  edges: readonly LayoutWorkerEdge[];
  seed: number;
  maxRuntimeMs: number;
  reducedMotion?: boolean;
  runNoverlap?: boolean;
}

export interface ForceLayoutResult {
  positions: LayoutWorkerPosition[];
  lifecycle: LayoutLifecycle;
  elapsedMs: number;
  reason?: "WORKER_ERROR" | "TIMEOUT";
}

interface ForceNodeAttributes {
  x: number;
  y: number;
  size: number;
}

interface ForceEdgeAttributes {
  weight: number;
}

const NOVERLAP_PARAMETERS = {
  maxIterations: 20,
  settings: {
    margin: 10,
    expansion: 1.05,
    ratio: 1.1
  }
} as const;

export function runForceArchitectureLayout(request: ForceLayoutRequest, now: () => number = monotonicNow): ForceLayoutResult {
  const startedAt = now();
  const fallback = createSeedPositions(request);
  const elapsed = () => Math.max(0, roundCoordinate(now() - startedAt));

  if (request.reducedMotion) return { positions: fallback, lifecycle: "stopped", elapsedMs: elapsed() };
  if (request.maxRuntimeMs <= 0) return { positions: fallback, lifecycle: "failed", elapsedMs: elapsed(), reason: "TIMEOUT" };
  if (fallback.length < 2) return { positions: fallback, lifecycle: "settled", elapsedMs: elapsed() };
  if (now() - startedAt > request.maxRuntimeMs) return { positions: fallback, lifecycle: "failed", elapsedMs: elapsed(), reason: "TIMEOUT" };

  const graph = createForceGraph(request, fallback);
  const settings = forceSettings(graph.order, request.seed);
  const iterations = boundedIterations(graph.order, request.maxRuntimeMs);
  const forcePositions = forceAtlas2(graph, { iterations, settings });
  if (now() - startedAt > request.maxRuntimeMs) return { positions: fallback, lifecycle: "failed", elapsedMs: elapsed(), reason: "TIMEOUT" };

  applyPositions(graph, forcePositions);
  if (request.runNoverlap !== false) {
    noverlap.assign(graph, NOVERLAP_PARAMETERS);
    if (now() - startedAt > request.maxRuntimeMs) return { positions: fallback, lifecycle: "failed", elapsedMs: elapsed(), reason: "TIMEOUT" };
  }

  const result = collectPositions(graph);
  if (!result) return { positions: fallback, lifecycle: "failed", elapsedMs: elapsed(), reason: "WORKER_ERROR" };
  return { positions: result, lifecycle: "settled", elapsedMs: elapsed() };
}

export function forceSettings(nodeCount: number, seed: number): ForceAtlas2Settings {
  const size = Math.max(1, nodeCount);
  const seedUnit = seededUnit(`${seed}:force`);
  return {
    ...forceAtlas2.inferSettings(size),
    gravity: nodeCount < 500 ? 0.8 : nodeCount < 2_000 ? 0.5 : 0.3,
    scalingRatio: (nodeCount < 500 ? 15 : nodeCount < 2_000 ? 30 : 60) + seedUnit * 2,
    slowDown: nodeCount < 500 ? 1 : nodeCount < 2_000 ? 2 : 3,
    barnesHutOptimize: nodeCount > 200,
    barnesHutTheta: nodeCount >= 2_000 ? 0.8 : 0.6,
    strongGravityMode: false,
    outboundAttractionDistribution: true,
    linLogMode: false,
    adjustSizes: true,
    edgeWeightInfluence: 1
  };
}

function createForceGraph(request: ForceLayoutRequest, fallback: readonly LayoutWorkerPosition[]): MultiDirectedGraph<ForceNodeAttributes, ForceEdgeAttributes> {
  const graph = new MultiDirectedGraph<ForceNodeAttributes, ForceEdgeAttributes>();
  const fallbackById = new Map(fallback.map((position) => [position.id, position]));
  for (const node of [...request.nodes].sort(compareNodes)) {
    const position = fallbackById.get(node.id)!;
    const degree = Number.isFinite(node.degree) ? Math.max(0, node.degree) : 0;
    graph.addNode(node.id, {
      x: position.x,
      y: position.y,
      size: Math.max(1, Math.min(28, 4 + Math.sqrt(degree + 1) * 2))
    });
  }

  const known = new Set(graph.nodes());
  [...request.edges]
    .filter((edge) => known.has(edge.source) && known.has(edge.target))
    .sort(compareEdges)
    .forEach((edge, index) => {
      const weight = Number.isFinite(edge.weight) ? Math.max(0.1, edge.weight) : 0.1;
      graph.addDirectedEdgeWithKey(`edge:${index}`, edge.source, edge.target, { weight });
    });
  return graph;
}

function createSeedPositions(request: ForceLayoutRequest): LayoutWorkerPosition[] {
  const occupied = new Map<string, number>();
  return [...request.nodes].sort(compareNodes).map((node) => {
    const x = Number.isFinite(node.x) ? node.x : seededCoordinate(`${request.seed}:${node.id}:x`);
    const y = Number.isFinite(node.y) ? node.y : seededCoordinate(`${request.seed}:${node.id}:y`);
    const key = `${x}:${y}`;
    const occurrence = occupied.get(key) ?? 0;
    occupied.set(key, occurrence + 1);
    const jitter = occurrence === 0 ? { x: 0, y: 0 } : deterministicJitter(`${request.seed}:${node.id}`, occurrence);
    return { id: node.id, x: roundCoordinate(x + jitter.x), y: roundCoordinate(y + jitter.y) };
  });
}

function applyPositions(graph: MultiDirectedGraph<ForceNodeAttributes, ForceEdgeAttributes>, positions: Record<string, { x: number; y: number }>): void {
  for (const id of graph.nodes()) {
    const position = positions[id];
    if (position) graph.mergeNodeAttributes(id, { x: position.x, y: position.y });
  }
}

function collectPositions(graph: MultiDirectedGraph<ForceNodeAttributes, ForceEdgeAttributes>): LayoutWorkerPosition[] | undefined {
  const result = graph.nodes().sort().map((id) => {
    const position = graph.getNodeAttributes(id);
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return undefined;
    return { id, x: roundCoordinate(position.x), y: roundCoordinate(position.y) };
  });
  return result.every((position): position is LayoutWorkerPosition => position !== undefined) ? result : undefined;
}

function boundedIterations(nodeCount: number, maxRuntimeMs: number): number {
  const budgetIterations = Math.floor(maxRuntimeMs / Math.max(1, Math.ceil(nodeCount / 24)));
  return Math.max(1, Math.min(64, budgetIterations));
}

function deterministicJitter(value: string, occurrence: number): { x: number; y: number } {
  const angle = seededUnit(`${value}:angle`) * Math.PI * 2;
  const radius = 0.01 * occurrence;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function seededCoordinate(value: string): number {
  return (seededUnit(value) - 0.5) * 1_000;
}

function seededUnit(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

function compareNodes(left: LayoutWorkerNode, right: LayoutWorkerNode): number {
  return left.id.localeCompare(right.id);
}

function compareEdges(left: LayoutWorkerEdge, right: LayoutWorkerEdge): number {
  return left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
    || left.weight - right.weight;
}

function roundCoordinate(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1_000) / 1_000;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}
