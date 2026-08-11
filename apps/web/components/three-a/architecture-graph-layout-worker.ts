import { runForceArchitectureLayout } from "./architecture-graph-layout-force";

export type ArchitectureGraphLayoutKind = "overview" | "explore";
export type LayoutRunMode = "force" | "tree" | "circles";
export type LayoutLifecycle = "seeded" | "running" | "settled" | "stopped" | "failed";
type LayoutRequestKind = ArchitectureGraphLayoutKind | LayoutRunMode;

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
  layout: LayoutRequestKind;
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
  lifecycle?: LayoutLifecycle;
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
  if (request.reducedMotion) return { type: "complete", positions: fallback, lifecycle: "stopped" };
  if (request.maxRuntimeMs <= 0) return { type: "failed", positions: fallback, lifecycle: "failed", reason: "TIMEOUT" };
  if (request.nodes.length < 2 || request.layout === "tree" || request.layout === "circles") return { type: "complete", positions: fallback, lifecycle: "settled" };

  const fallbackById = new Map(fallback.map((position) => [position.id, position]));
  const seededNodes = request.nodes.map((node) => ({ ...node, ...(fallbackById.get(node.id) ?? { x: 0, y: 0 }) }));
  const result = runForceArchitectureLayout({
    nodes: seededNodes,
    edges: request.edges,
    seed: request.seed,
    maxRuntimeMs: request.maxRuntimeMs,
    runNoverlap: true
  }, now);
  if (result.lifecycle === "failed") return { type: "failed", positions: fallback, lifecycle: "failed", reason: result.reason ?? "WORKER_ERROR" };
  return { type: "complete", positions: result.positions, lifecycle: result.lifecycle };
}

export function deterministicLayout(request: Pick<LayoutWorkerRequest, "layout" | "nodes" | "seed">): LayoutWorkerPosition[] {
  const nodes = [...request.nodes].sort((left, right) => left.id.localeCompare(right.id));
  if (request.layout === "tree") return deterministicTreeLayout(nodes, request.seed);
  if (request.layout === "circles") return deterministicCircleLayout(nodes, request.seed);
  const seedLayout = request.layout === "overview" ? "overview" : "explore";
  const useInputCoordinates = seedLayout !== "overview"
    && nodes.length > 0
    && nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y) && Math.hypot(node.x, node.y) >= 64);
  if (useInputCoordinates) return nodes.map((node) => ({ id: node.id, x: roundCoordinate(node.x), y: roundCoordinate(node.y) }));

  const grouped = new Map<LayoutLayer, LayoutWorkerNode[]>(LAYERS.map((layer) => [layer, []]));
  for (const node of nodes) grouped.get(normalizeLayer(node.layer))!.push(node);
  const positions = new Map<string, LayoutWorkerPosition>();
  for (const layer of LAYERS) {
    const group = grouped.get(layer)!;
    const radius = Math.max(seedLayout === "overview" ? 280 : 220, Math.sqrt(Math.max(1, group.length)) * (seedLayout === "overview" ? 42 : 34));
    const bandY = seedLayout === "overview" ? LAYER_BAND_Y[layer] : 0;
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

function deterministicTreeLayout(nodes: readonly LayoutWorkerNode[], seed: number): LayoutWorkerPosition[] {
  const grouped = new Map<LayoutLayer, LayoutWorkerNode[]>(LAYERS.map((layer) => [layer, []]));
  for (const node of nodes) grouped.get(normalizeLayer(node.layer))!.push(node);
  const positions = new Map<string, LayoutWorkerPosition>();
  for (const layer of LAYERS) {
    const group = grouped.get(layer)!;
    const spacing = Math.max(150, Math.min(260, 1_100 / Math.max(1, group.length)));
    const startX = -((group.length - 1) * spacing) / 2;
    group.forEach((node, index) => {
      const jitter = (seededUnit(`${seed}:tree:${node.id}`) - 0.5) * Math.min(22, spacing * 0.08);
      positions.set(node.id, { id: node.id, x: roundCoordinate(startX + index * spacing + jitter), y: LAYER_BAND_Y[layer] });
    });
  }
  return nodes.map((node) => positions.get(node.id)!);
}

function deterministicCircleLayout(nodes: readonly LayoutWorkerNode[], seed: number): LayoutWorkerPosition[] {
  const grouped = new Map<LayoutLayer, LayoutWorkerNode[]>(LAYERS.map((layer) => [layer, []]));
  for (const node of nodes) grouped.get(normalizeLayer(node.layer))!.push(node);
  const positions = new Map<string, LayoutWorkerPosition>();
  const radii: Record<LayoutLayer, number> = { BIZ: 230, SYS: 430, TECH: 630 };
  for (const layer of LAYERS) {
    const group = grouped.get(layer)!;
    const radius = radii[layer];
    group.forEach((node, index) => {
      const angle = (Math.PI * 2 * index) / Math.max(1, group.length) + (seededUnit(`${seed}:circle:${node.id}`) - 0.5) * 0.16;
      positions.set(node.id, { id: node.id, x: roundCoordinate(Math.cos(angle) * radius), y: roundCoordinate(Math.sin(angle) * radius) });
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
      runtime.postMessage({ type: "failed", positions: deterministicLayout(event.data), lifecycle: "failed", reason: "WORKER_ERROR" });
    }
  });
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
