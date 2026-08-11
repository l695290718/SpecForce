export type ArchitectureGraphLayoutKind = "overview" | "explore";

export interface LayoutWorkerNode {
  id: string;
  x: number;
  y: number;
  degree: number;
  layer?: "BIZ" | "SYS" | "TECH";
}

export interface LayoutWorkerEdge {
  source: string;
  target: string;
  weight: number;
}

export interface LayoutWorkerRequest {
  type: "refine";
  layout: ArchitectureGraphLayoutKind;
  nodes: LayoutWorkerNode[];
  edges: LayoutWorkerEdge[];
  seed: number;
  maxRuntimeMs: number;
  reducedMotion?: boolean;
}

export interface LayoutWorkerPosition {
  id: string;
  x: number;
  y: number;
}

export interface LayoutWorkerResponse {
  type: "complete" | "failed";
  positions: LayoutWorkerPosition[];
  reason?: "WORKER_ERROR" | "TIMEOUT";
}

export interface LayoutWorkerRuntime {
  addEventListener(type: "message", listener: (event: MessageEvent<LayoutWorkerRequest>) => void): void;
  postMessage(message: LayoutWorkerResponse): void;
}

export interface LayoutIdentity {
  applicationServiceId: string;
  scopePath: string;
  baselineId: string;
  projectionManifestId: string;
}

export function refineArchitectureGraphLayout(request: LayoutWorkerRequest, now: () => number = Date.now): LayoutWorkerResponse {
  const fallback = deterministicLayout(request);
  if (request.maxRuntimeMs <= 0) return { type: "failed", positions: fallback, reason: "TIMEOUT" };
  if (request.reducedMotion || request.nodes.length < 2) return { type: "complete", positions: fallback };

  const startedAt = now();
  const positions = new Map(fallback.map((position) => [position.id, { ...position }]));
  const nodeIds = [...positions.keys()].sort();
  const adjacency = buildAdjacency(request.edges, nodeIds);
  const iterations = request.layout === "overview" ? 20 : 32;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    if (now() - startedAt > request.maxRuntimeMs) return { type: "failed", positions: fallback, reason: "TIMEOUT" };
    const next = new Map<string, LayoutWorkerPosition>();
    for (const nodeId of nodeIds) {
      const position = positions.get(nodeId)!;
      const neighbors = adjacency.get(nodeId) ?? [];
      if (neighbors.length === 0) {
        next.set(nodeId, position);
        continue;
      }
      const center = neighbors.reduce(
        (total, neighbor) => {
          const target = positions.get(neighbor.id);
          const weight = Math.max(0.1, neighbor.weight);
          return target ? { x: total.x + target.x * weight, y: total.y + target.y * weight, weight: total.weight + weight } : total;
        },
        { x: 0, y: 0, weight: 0 }
      );
      const anchor = fallback.find((candidate) => candidate.id === nodeId)!;
      const attraction = request.layout === "overview" ? 0.08 : 0.14;
      const anchorWeight = request.layout === "overview" ? 0.14 : 0.05;
      const repulsion = calculateRepulsion(nodeId, position, positions, nodeIds, request.layout, request.seed);
      const target = center.weight ? { x: center.x / center.weight, y: center.y / center.weight } : anchor;
      next.set(nodeId, {
        id: nodeId,
        x: position.x * (1 - attraction - anchorWeight) + target.x * attraction + anchor.x * anchorWeight + repulsion.x,
        y: position.y * (1 - attraction - anchorWeight) + target.y * attraction + anchor.y * anchorWeight + repulsion.y
      });
    }
    for (const [nodeId, position] of next) positions.set(nodeId, position);
  }
  return { type: "complete", positions: nodeIds.map((nodeId) => positions.get(nodeId)!) };
}

export function deterministicLayout(request: Pick<LayoutWorkerRequest, "layout" | "nodes" | "seed">): LayoutWorkerPosition[] {
  const nodes = [...request.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const useInputCoordinates = request.layout !== "overview"
    && nodes.length > 0
    && nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Math.hypot(node.x, node.y) >= 64);
  if (useInputCoordinates) return nodes.map((node) => ({ id: node.id, x: roundCoordinate(node.x), y: roundCoordinate(node.y) }));

  const grouped = new Map<LayoutLayer, LayoutWorkerNode[]>(LAYERS.map((layer) => [layer, []]));
  for (const node of nodes) grouped.get(normalizeLayer(node.layer))!.push(node);
  const positions = new Map<string, LayoutWorkerPosition>();
  for (const layer of LAYERS) {
    const group = grouped.get(layer)!;
    const radius = Math.max(request.layout === "overview" ? 280 : 220, Math.sqrt(Math.max(1, group.length)) * (request.layout === "overview" ? 42 : 34));
    const bandY = request.layout === "overview" ? LAYER_BAND_Y[layer] : 0;
    group.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, group.length) + (seededUnit(`${request.seed}:${node.id}`) - 0.5) * 0.28;
      const radialOffset = Math.min(180, Math.max(0, node.degree) * 7) + seededUnit(`${node.id}:${request.seed}`) * 18;
      positions.set(node.id, {
        id: node.id,
        x: roundCoordinate(Math.cos(angle) * (radius + radialOffset)),
        y: roundCoordinate(bandY + Math.sin(angle) * (radius * 0.62 + radialOffset * 0.4))
      });
    });
  }
  return nodes.map((node) => positions.get(node.id)!);
}

export function shouldTerminateLayout(previous: LayoutIdentity, next: LayoutIdentity): boolean {
  return previous.applicationServiceId !== next.applicationServiceId
    || previous.scopePath !== next.scopePath
    || previous.baselineId !== next.baselineId
    || previous.projectionManifestId !== next.projectionManifestId;
}

export function installArchitectureGraphLayoutWorker(runtime: LayoutWorkerRuntime): void {
  runtime.addEventListener("message", (event) => {
    try {
      runtime.postMessage(refineArchitectureGraphLayout(event.data));
    } catch {
      runtime.postMessage({ type: "failed", positions: deterministicLayout(event.data), reason: "WORKER_ERROR" });
    }
  });
}

function buildAdjacency(edges: readonly LayoutWorkerEdge[], nodeIds: readonly string[]): Map<string, Array<{ id: string; weight: number }>> {
  const known = new Set(nodeIds);
  const adjacency = new Map(nodeIds.map((nodeId) => [nodeId, [] as Array<{ id: string; weight: number }> ]));
  for (const edge of [...edges].sort((left, right) => `${left.source}|${left.target}`.localeCompare(`${right.source}|${right.target}`))) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    adjacency.get(edge.source)!.push({ id: edge.target, weight: edge.weight });
    adjacency.get(edge.target)!.push({ id: edge.source, weight: edge.weight });
  }
  return adjacency;
}

function calculateRepulsion(
  nodeId: string,
  position: LayoutWorkerPosition,
  positions: ReadonlyMap<string, LayoutWorkerPosition>,
  nodeIds: readonly string[],
  layout: ArchitectureGraphLayoutKind,
  seed: number
): { x: number; y: number } {
  const minimumDistance = layout === "overview" ? 220 : 140;
  const strength = layout === "overview" ? 34 : 18;
  let x = 0;
  let y = 0;
  for (const otherId of nodeIds) {
    if (otherId === nodeId) continue;
    const other = positions.get(otherId);
    if (!other) continue;
    let deltaX = position.x - other.x;
    let deltaY = position.y - other.y;
    let distance = Math.hypot(deltaX, deltaY);
    if (distance === 0) {
      const angle = seededUnit(`${seed}:${nodeId}:${otherId}`) * Math.PI * 2;
      deltaX = Math.cos(angle);
      deltaY = Math.sin(angle);
      distance = 1;
    }
    if (distance >= minimumDistance) continue;
    const push = ((minimumDistance - distance) / minimumDistance) * strength;
    x += (deltaX / distance) * push;
    y += (deltaY / distance) * push;
  }
  return { x: clamp(x, -52, 52), y: clamp(y, -52, 52) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function seededUnit(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

type LayoutLayer = "BIZ" | "SYS" | "TECH";
const LAYERS: readonly LayoutLayer[] = ["BIZ", "SYS", "TECH"];
const LAYER_BAND_Y: Record<LayoutLayer, number> = { BIZ: -420, SYS: 0, TECH: 420 };

function normalizeLayer(layer: LayoutWorkerNode["layer"]): LayoutLayer {
  return layer && LAYERS.includes(layer) ? layer : "SYS";
}

function roundCoordinate(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1_000) / 1_000;
}

const workerScope = typeof self !== "undefined" && !("document" in self) ? self as unknown as LayoutWorkerRuntime : undefined;
if (workerScope) installArchitectureGraphLayoutWorker(workerScope);
