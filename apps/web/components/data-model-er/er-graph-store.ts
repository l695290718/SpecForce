import type { DataModelGraphEdge, DataModelGraphNode, DataModelGraphResponse } from "@specforge/core";

export type ErGraphMode = "MODEL" | "SCOPE";
export type ErLod = "FULL" | "COMPACT" | "SKELETON";

export interface ErGraphNode extends DataModelGraphNode {
  label: string;
  fieldCount?: number;
}

export interface ErGraphEdge extends DataModelGraphEdge {
  relationId?: string;
  mappingIndex?: number;
  mappingCount?: number;
  relationGroupId: string;
}

export interface ErGraphSnapshot {
  mode: ErGraphMode;
  nodes: ErGraphNode[];
  edges: ErGraphEdge[];
  waterlines: DataModelGraphResponse["waterlines"];
  partial: boolean;
  errors: DataModelGraphResponse["errors"];
  hasMore: boolean;
  nextCursor?: string;
}

export interface ErGraphState {
  snapshot: ErGraphSnapshot;
  selectedId?: string;
  search: string;
  nodeTypes: DataModelGraphNode["nodeType"][];
  relationshipCodes: string[];
  lod: ErLod;
}

export interface ErLodState {
  lod: ErLod;
  showFields: boolean;
  showLabels: boolean;
  visibleNodeCount: number;
  visibleEdgeCount: number;
  reason?: "CAPACITY" | "ZOOM" | "DEFAULT";
}

function stableCompare(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id, "en");
}

function edgeGroupId(edge: DataModelGraphEdge): string {
  const metadata = edge.metadata ?? {};
  const relationId = typeof metadata.relationId === "string" ? metadata.relationId : undefined;
  return relationId ? `relation:${relationId}` : `edge:${edge.relationshipCode}:${edge.source}:${edge.target}`;
}

function enrichEdge(edge: DataModelGraphEdge): ErGraphEdge {
  const metadata = edge.metadata ?? {};
  return {
    ...edge,
    relationId: typeof metadata.relationId === "string" ? metadata.relationId : undefined,
    mappingIndex: typeof metadata.mappingIndex === "number" ? metadata.mappingIndex : undefined,
    mappingCount: typeof metadata.mappingCount === "number" ? metadata.mappingCount : undefined,
    relationGroupId: edgeGroupId(edge)
  };
}

function enrichNode(node: DataModelGraphNode): ErGraphNode {
  const fieldCount = typeof node.metadata.fieldCount === "number" ? node.metadata.fieldCount : undefined;
  return { ...node, label: node.displayName, fieldCount };
}

export function mergeErGraphResponses(responses: DataModelGraphResponse[]): ErGraphSnapshot {
  if (!responses.length) throw new Error("ER_GRAPH_RESPONSE_REQUIRED");
  const first = responses[0]!;
  const nodes = new Map<string, ErGraphNode>();
  const edges = new Map<string, ErGraphEdge>();
  const errors = new Map<string, DataModelGraphResponse["errors"][number]>();
  for (const response of responses) {
    if (response.mode !== first.mode || response.waterlines.catalogDigest !== first.waterlines.catalogDigest || response.waterlines.relationshipDigest !== first.waterlines.relationshipDigest) {
      throw new Error("SNAPSHOT_CHANGED");
    }
    for (const node of response.nodes) nodes.set(node.id, enrichNode(node));
    for (const edge of response.edges) edges.set(edge.id, enrichEdge(edge));
    for (const error of response.errors) errors.set(`${error.code}:${JSON.stringify(error.details ?? {})}`, error);
  }
  return {
    mode: first.mode,
    nodes: [...nodes.values()].sort(stableCompare),
    edges: [...edges.values()].sort(stableCompare),
    waterlines: first.waterlines,
    partial: responses.some((response) => response.partial),
    errors: [...errors.values()],
    hasMore: responses.at(-1)?.hasMore ?? false,
    nextCursor: responses.at(-1)?.nextCursor
  };
}

export function selectErGraph(state: ErGraphState): ErGraphSnapshot {
  const query = state.search.trim().toLocaleLowerCase("en-US");
  const nodes = state.snapshot.nodes.filter((node) => {
    if (state.nodeTypes.length && !state.nodeTypes.includes(node.nodeType)) return false;
    return !query || `${node.displayName} ${node.logicalId} ${node.description ?? ""}`.toLocaleLowerCase("en-US").includes(query);
  });
  const visibleIds = new Set(nodes.map((node) => node.id));
  const edges = state.snapshot.edges.filter((edge) => (!state.relationshipCodes.length || state.relationshipCodes.includes(edge.relationshipCode)) && visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return { ...state.snapshot, nodes, edges };
}

export function relationGroups(edges: ErGraphEdge[]): Map<string, ErGraphEdge[]> {
  const groups = new Map<string, ErGraphEdge[]>();
  for (const edge of edges) groups.set(edge.relationGroupId, [...(groups.get(edge.relationGroupId) ?? []), edge]);
  for (const group of groups.values()) group.sort((left, right) => (left.mappingIndex ?? 0) - (right.mappingIndex ?? 0) || left.id.localeCompare(right.id, "en"));
  return groups;
}

export function deriveErLod(nodeCount: number, edgeCount: number, zoom = 1, clientCapacity = 5000): ErLodState {
  const visibleNodeCount = Math.max(0, nodeCount);
  const visibleEdgeCount = Math.max(0, edgeCount);
  if (visibleNodeCount > clientCapacity || visibleEdgeCount > clientCapacity * 2) return { lod: "SKELETON", showFields: false, showLabels: false, visibleNodeCount, visibleEdgeCount, reason: "CAPACITY" };
  if (zoom < 0.22 || visibleNodeCount > 180) return { lod: "COMPACT", showFields: zoom >= 0.22, showLabels: zoom >= 0.22, visibleNodeCount, visibleEdgeCount, reason: "ZOOM" };
  return { lod: "FULL", showFields: true, showLabels: true, visibleNodeCount, visibleEdgeCount, reason: "DEFAULT" };
}

export function createErGraphState(snapshot: ErGraphSnapshot): ErGraphState {
  return { snapshot, search: "", nodeTypes: [], relationshipCodes: [], lod: deriveErLod(snapshot.nodes.length, snapshot.edges.length).lod };
}
