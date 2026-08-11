export type ArchitectureGraphLayoutKind = "overview" | "explore";

export interface LayoutWorkerNode {
  id: string;
  x: number;
  y: number;
  degree: number;
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
      next.set(nodeId, {
        id: nodeId,
        x: position.x * (1 - attraction) + (center.weight ? center.x / center.weight : anchor.x) * attraction,
        y: position.y * (1 - attraction) + (center.weight ? center.y / center.weight : anchor.y) * attraction
      });
    }
    for (const [nodeId, position] of next) positions.set(nodeId, position);
  }
  return { type: "complete", positions: nodeIds.map((nodeId) => positions.get(nodeId)!) };
}

export function deterministicLayout(request: Pick<LayoutWorkerRequest, "layout" | "nodes" | "seed">): LayoutWorkerPosition[] {
  const nodes = [...request.nodes].sort((left, right) => left.id.localeCompare(right.id));
  const radius = request.layout === "overview" ? 340 : 220;
  return nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, nodes.length) + seededUnit(`${request.seed}:${node.id}`) * 0.36;
    const radialOffset = Math.min(160, Math.max(0, node.degree) * 8) + seededUnit(`${node.id}:${request.seed}`) * 24;
    return {
      id: node.id,
      x: Math.round((node.x || Math.cos(angle) * (radius + radialOffset)) * 1_000) / 1_000,
      y: Math.round((node.y || Math.sin(angle) * (radius + radialOffset)) * 1_000) / 1_000
    };
  });
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

function seededUnit(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 0xffff_ffff;
}

const workerScope = typeof self !== "undefined" && !("document" in self) ? self as unknown as LayoutWorkerRuntime : undefined;
if (workerScope) installArchitectureGraphLayoutWorker(workerScope);
