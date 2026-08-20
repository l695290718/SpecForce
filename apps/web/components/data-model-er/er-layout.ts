import type { ErGraphEdge, ErGraphNode } from "./er-graph-store";

export interface ErLayoutNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  node: ErGraphNode;
}

export interface ErLayoutEdge {
  id: string;
  source: string;
  target: string;
  points: Array<{ x: number; y: number }>;
  edge: ErGraphEdge;
}

export interface ErLayoutResult {
  nodes: ErLayoutNode[];
  edges: ErLayoutEdge[];
  degraded: boolean;
  error?: string;
}

export interface ErLayoutRequest {
  nodes: ErGraphNode[];
  edges: ErGraphEdge[];
  width?: number;
  height?: number;
}

const CARD_WIDTH = 260;
const CARD_HEADER = 48;
const FIELD_ROW = 28;
const GAP_X = 88;
const GAP_Y = 64;

export function erCardSize(node: ErGraphNode): { width: number; height: number } {
  const fieldCount = Number(node.fieldCount ?? node.metadata.fieldCount ?? 0);
  return { width: CARD_WIDTH, height: CARD_HEADER + Math.max(1, fieldCount) * FIELD_ROW + 16 };
}

export function layoutErGraph(request: ErLayoutRequest): ErLayoutResult {
  const nodes = [...request.nodes].sort((left, right) => left.id.localeCompare(right.id, "en"));
  const columns = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const positions = new Map<string, ErLayoutNode>();
  for (const [index, node] of nodes.entries()) {
    const size = erCardSize(node);
    const column = index % columns;
    const row = Math.floor(index / columns);
    positions.set(node.id, { id: node.id, x: column * (CARD_WIDTH + GAP_X) + 32, y: row * (size.height + GAP_Y) + 32, ...size, node });
  }
  const edges = request.edges.filter((edge) => positions.has(edge.source) && positions.has(edge.target)).sort((left, right) => left.id.localeCompare(right.id, "en")).map((edge) => {
    const source = positions.get(edge.source)!;
    const target = positions.get(edge.target)!;
    const start = { x: source.x + source.width, y: source.y + source.height / 2 };
    const end = { x: target.x, y: target.y + target.height / 2 };
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    return { id: edge.id, source: edge.source, target: edge.target, points: [start, midpoint, end], edge };
  });
  return { nodes: [...positions.values()], edges, degraded: false };
}

export function layoutErGraphWithFallback(request: ErLayoutRequest): ErLayoutResult {
  try {
    return layoutErGraph(request);
  } catch (error) {
    const fallback = layoutErGraph({ nodes: request.nodes, edges: [] });
    return { ...fallback, degraded: true, error: error instanceof Error ? error.message : "LAYOUT_DEGRADED" };
  }
}

export function toElkGraph(request: ErLayoutRequest): { id: string; layoutOptions: Record<string, string>; children: Array<{ id: string; width: number; height: number }>; edges: Array<{ id: string; sources: string[]; targets: string[] }> } {
  return {
    id: "er-root",
    layoutOptions: { "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.spacing.nodeNode": String(GAP_Y), "elk.layered.spacing.nodeNodeBetweenLayers": String(GAP_X) },
    children: request.nodes.slice().sort((left, right) => left.id.localeCompare(right.id, "en")).map((node) => ({ id: node.id, ...erCardSize(node) })),
    edges: request.edges.slice().sort((left, right) => left.id.localeCompare(right.id, "en")).map((edge) => ({ id: edge.id, sources: [edge.source], targets: [edge.target] }))
  };
}

export function fromElkGraph(request: ErLayoutRequest, result: { children?: Array<{ id: string; x?: number; y?: number; width?: number; height?: number }> }): ErLayoutResult {
  const byId = new Map(request.nodes.map((node) => [node.id, node]));
  const laidOut = (result.children ?? []).filter((child) => byId.has(child.id)).map((child) => {
    const node = byId.get(child.id)!;
    const size = erCardSize(node);
    return { id: node.id, x: child.x ?? 0, y: child.y ?? 0, width: child.width ?? size.width, height: child.height ?? size.height, node };
  });
  return layoutEdges({ nodes: laidOut, edges: request.edges });
}

function layoutEdges(input: { nodes: ErLayoutNode[]; edges: ErGraphEdge[] }): ErLayoutResult {
  const nodes = new Map(input.nodes.map((node) => [node.id, node]));
  const edges = input.edges.filter((edge) => nodes.has(edge.source) && nodes.has(edge.target)).sort((left, right) => left.id.localeCompare(right.id, "en")).map((edge) => {
    const source = nodes.get(edge.source)!;
    const target = nodes.get(edge.target)!;
    const start = { x: source.x + source.width, y: source.y + source.height / 2 };
    const end = { x: target.x, y: target.y + target.height / 2 };
    return { id: edge.id, source: edge.source, target: edge.target, points: [start, { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }, end], edge };
  });
  return { nodes: input.nodes, edges, degraded: false };
}
