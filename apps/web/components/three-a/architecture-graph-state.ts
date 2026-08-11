import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";

export type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
export type TraceDirection = "upstream" | "downstream" | "both";
export type ThreeAPartialReason = "MAX_DEPTH" | "MAX_NODES" | "MAX_EDGES" | "MAX_PATHS" | "TIMEOUT" | "MAX_PAYLOAD";

export interface GraphFilters {
  relationTypes: readonly string[];
  layers: readonly ArchitectureLayer[];
}

export interface ArchitectureGraphSemanticState {
  filters: GraphFilters;
  selectedId?: string;
  hoveredId?: string;
  neighborhoodIds: ReadonlySet<string>;
}

export type ArchitectureGraphSemanticAction =
  | { type: "filters"; filters: GraphFilters }
  | { type: "select"; id?: string }
  | { type: "hover"; id?: string }
  | { type: "neighborhood"; ids: readonly string[] }
  | { type: "reset" };

export interface GraphExpansionPage {
  nodes: readonly KnowledgeProjectionNode[];
  edges: readonly KnowledgeProjectionEdge[];
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: readonly ThreeAPartialReason[] };
}

export interface ArchitectureGraphState {
  rootFocusId: string;
  selectedId: string;
  nodesById: Map<string, KnowledgeProjectionNode>;
  edgesById: Map<string, KnowledgeProjectionEdge>;
  continuations: Map<string, string>;
  partialReasons: ThreeAPartialReason[];
  loadingKey?: string;
  errorCode?: string;
}

const MAX_NODES = 500;
const MAX_EDGES = 1_000;

export function createArchitectureGraphSemanticState(filters: GraphFilters = { relationTypes: [], layers: [] }): ArchitectureGraphSemanticState {
  return {
    filters: normalizeGraphFilters(filters),
    neighborhoodIds: new Set()
  };
}

export function reduceArchitectureGraphSemanticState(
  state: ArchitectureGraphSemanticState,
  action: ArchitectureGraphSemanticAction
): ArchitectureGraphSemanticState {
  switch (action.type) {
    case "filters":
      return {
        filters: normalizeGraphFilters(action.filters),
        neighborhoodIds: new Set()
      };
    case "select":
      return { ...state, selectedId: action.id };
    case "hover":
      return { ...state, hoveredId: action.id };
    case "neighborhood":
      return { ...state, neighborhoodIds: new Set([...action.ids].sort()) };
    case "reset":
      return createArchitectureGraphSemanticState();
  }
}

export function normalizeGraphFilters(filters: GraphFilters): GraphFilters {
  return {
    relationTypes: uniqueSorted(filters.relationTypes),
    layers: uniqueSorted(filters.layers) as ArchitectureLayer[]
  };
}

export function expansionKey(assertionId: string, direction: TraceDirection, filters: GraphFilters): string {
  return JSON.stringify([assertionId, direction, uniqueSorted(filters.relationTypes), uniqueSorted(filters.layers)]);
}

export function graphStateFromInitial(rootFocusId: string, page: GraphExpansionPage): ArchitectureGraphState {
  const nodesById = new Map<string, KnowledgeProjectionNode>();
  for (const node of page.nodes) nodesById.set(node.assertionId, node);
  const edgesById = new Map<string, KnowledgeProjectionEdge>();
  for (const edge of page.edges) edgesById.set(edge.relationshipIdentity, edge);
  const partialReasons = pageReasons(page);

  if (nodesById.size > MAX_NODES) {
    partialReasons.push("MAX_NODES");
    retainNodes(nodesById, rootFocusId, MAX_NODES);
  }
  if (edgesById.size > MAX_EDGES) {
    partialReasons.push("MAX_EDGES");
    retainEdges(edgesById, MAX_EDGES);
  }

  return {
    rootFocusId,
    selectedId: rootFocusId,
    nodesById,
    edgesById,
    continuations: new Map(),
    partialReasons: uniqueReasons(partialReasons)
  };
}

export function mergeGraphExpansion(state: ArchitectureGraphState, key: string, page: GraphExpansionPage): ArchitectureGraphState {
  const nodesById = new Map(state.nodesById);
  const edgesById = new Map(state.edgesById);
  for (const node of page.nodes) nodesById.set(node.assertionId, node);
  for (const edge of page.edges) edgesById.set(edge.relationshipIdentity, edge);
  const reasons = uniqueReasons([...state.partialReasons, ...pageReasons(page)]);

  if (nodesById.size > MAX_NODES) return withReason(state, "MAX_NODES", page);
  if (edgesById.size > MAX_EDGES) return withReason(state, "MAX_EDGES", page);

  const continuations = new Map(state.continuations);
  if (page.continuation) continuations.set(key, page.continuation);
  else continuations.delete(key);

  return {
    ...state,
    nodesById,
    edgesById,
    continuations,
    partialReasons: reasons,
    loadingKey: state.loadingKey === key ? undefined : state.loadingKey
  };
}

function withReason(state: ArchitectureGraphState, reason: ThreeAPartialReason, page: GraphExpansionPage): ArchitectureGraphState {
  return {
    ...state,
    partialReasons: uniqueReasons([...state.partialReasons, ...pageReasons(page), reason]),
    loadingKey: state.loadingKey === undefined ? state.loadingKey : state.loadingKey
  };
}

function pageReasons(page: GraphExpansionPage): ThreeAPartialReason[] {
  return page.partial?.reasons ? [...page.partial.reasons] : [];
}

function uniqueReasons(reasons: readonly ThreeAPartialReason[]): ThreeAPartialReason[] {
  return [...new Set(reasons)];
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function retainNodes(nodesById: Map<string, KnowledgeProjectionNode>, rootFocusId: string, limit: number): void {
  const retained = [...nodesById.values()].sort(compareNodes).slice(0, limit);
  const root = nodesById.get(rootFocusId);
  if (root && !retained.some((node) => node.assertionId === rootFocusId)) retained[retained.length - 1] = root;
  nodesById.clear();
  for (const node of retained.sort(compareNodes)) nodesById.set(node.assertionId, node);
}

function retainEdges(edgesById: Map<string, KnowledgeProjectionEdge>, limit: number): void {
  const retained = [...edgesById.values()].sort(compareEdges).slice(0, limit);
  edgesById.clear();
  for (const edge of retained) edgesById.set(edge.relationshipIdentity, edge);
}

function compareNodes(left: KnowledgeProjectionNode, right: KnowledgeProjectionNode): number {
  return left.sortKey.localeCompare(right.sortKey) || left.assertionId.localeCompare(right.assertionId);
}

function compareEdges(left: KnowledgeProjectionEdge, right: KnowledgeProjectionEdge): number {
  return left.relationshipIdentity.localeCompare(right.relationshipIdentity) || left.sourceAssertionId.localeCompare(right.sourceAssertionId) || left.targetAssertionId.localeCompare(right.targetAssertionId);
}
