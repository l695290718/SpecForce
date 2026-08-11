import { MultiDirectedGraph } from "graphology";
import type {
  GraphSummaryEdge,
  GraphSummaryNode,
  ImpactArchitectureItem,
  ImpactArchitectureResult,
  OverviewArchitectureResult,
  TraceArchitecturePathResult
} from "@specforge/knowledge-query";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode } from "@specforge/core";
import type { ArchitectureGraphSemanticState, ArchitectureLayer, GraphFilters } from "./architecture-graph-state";

export const ARCHITECTURE_GRAPH_NODE_LIMIT = 2_000;
export const ARCHITECTURE_GRAPH_EDGE_LIMIT = 5_000;

export type GraphStorePartialReason = "CLIENT_MAX_NODES" | "CLIENT_MAX_EDGES" | "MAX_NODES" | "MAX_EDGES";
export type GraphNodeKind = "cluster" | "fact";

export interface GraphNodeAttributes {
  stableId?: string;
  kind: GraphNodeKind;
  label: string;
  layer?: ArchitectureLayer;
  clusterId?: string;
  assertionId?: string;
  memberCount: number;
  degree: number;
  criticality: number;
  score?: number;
  impactBand?: ImpactArchitectureItem["band"];
  x: number;
  y: number;
  opacity?: number;
  highlighted?: boolean;
  dimmed?: boolean;
}

export interface GraphEdgeAttributes {
  stableId: string;
  kind?: "summary" | "relationship";
  relationCode: string;
  confidence: number;
  bridge: boolean;
  weight: number;
  opacity?: number;
  highlighted?: boolean;
  dimmed?: boolean;
}

export interface GraphStoreIdentity {
  applicationServiceId: string;
  scopePath: string;
  baselineId: string;
  projectionManifestId: string;
}

export interface LegacyGraphStoreIdentity {
  scope: string;
  scopePath: string;
  baselineId: string;
  projectionManifestId: string;
}

export type GraphStoreIdentityInput = GraphStoreIdentity | LegacyGraphStoreIdentity;

export interface GraphStoreChange {
  addedNodeIds: string[];
  addedEdgeIds: string[];
  removedNodeIds: string[];
  removedEdgeIds: string[];
  partialReasons: GraphStorePartialReason[];
  selectedId?: string;
  addedNodes: number;
  addedEdges: number;
  identityChanged: boolean;
}

export interface GraphSemanticNode {
  id: string;
  attributes: GraphNodeAttributes;
}

export interface GraphSemanticEdge {
  id: string;
  source: string;
  target: string;
  attributes: GraphEdgeAttributes;
}

export interface ArchitectureGraphStore {
  readonly graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>;
  identity: GraphStoreIdentity;
  mergeOverview(result: OverviewArchitectureResult, continuationKey?: string): GraphStoreChange;
  mergeNeighborhood(result: TraceArchitecturePathResult, continuationKey?: string): GraphStoreChange;
  mergeImpact(result: ImpactArchitectureResult, continuationKey?: string): GraphStoreChange;
  retainWithinBudget(): GraphStoreChange;
  select(id?: string): void;
  clear(): void;
  resetForIdentity(identity: GraphStoreIdentityInput): GraphStoreChange;
  setIdentity(identity: GraphStoreIdentityInput): GraphStoreChange;
  snapshot(): { nodes: GraphSemanticNode[]; edges: GraphSemanticEdge[] };
  getContinuation(key: string): string | undefined;
}

export const GRAPH_NODE_LIMIT = ARCHITECTURE_GRAPH_NODE_LIMIT;
export const GRAPH_EDGE_LIMIT = ARCHITECTURE_GRAPH_EDGE_LIMIT;
export const factNodeId = stableFactAssertionId;
export const summaryNodeId = stableSummaryNodeId;

export function createArchitectureGraphStore(identityInput: GraphStoreIdentityInput, rootFocusAssertionId?: string): ArchitectureGraphStore {
  let identity = normalizeIdentity(identityInput);
  const graph = new MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>();
  let selectedId: string | undefined;
  let rootFocusId: string | undefined = rootFocusAssertionId ? stableFactAssertionId(rootFocusAssertionId) : undefined;
  const continuations = new Map<string, string>();

  function mergeOverview(result: OverviewArchitectureResult, continuationKey = "overview"): GraphStoreChange {
    assertIdentity(identity, result);
    const change = emptyChange(selectedId);
    for (const node of [...result.nodes].sort(compareSummaryNodes)) {
      const id = stableSummaryNodeId(node);
      mergeNode(graph, id, summaryNodeAttributes(node), change);
    }
    for (const edge of [...result.edges].sort(compareSummaryEdges)) {
      const source = stableSummaryEndpoint(edge.sourceId, result.nodes);
      const target = stableSummaryEndpoint(edge.targetId, result.nodes);
      if (source && target) mergeEdge(graph, stableSummaryEdgeId(edge), source, target, summaryEdgeAttributes(edge), change);
    }
    setContinuation(continuationKey, result.continuation);
    return mergeChange(change, retainWithinBudget());
  }

  function mergeNeighborhood(result: TraceArchitecturePathResult, continuationKey = "neighborhood"): GraphStoreChange {
    assertIdentity(identity, result);
    const change = emptyChange(selectedId);
    rootFocusId ??= result.nodes[0]?.assertionId ? stableFactNodeId(result.nodes[0]) : undefined;
    for (const node of [...result.nodes].sort(compareProjectionNodes)) {
      mergeNode(graph, stableFactNodeId(node), projectionNodeAttributes(node), change);
    }
    for (const edge of [...result.edges].sort(compareProjectionEdges)) {
      const source = stableFactAssertionId(edge.sourceAssertionId);
      const target = stableFactAssertionId(edge.targetAssertionId);
      if (graph.hasNode(source) && graph.hasNode(target)) mergeEdge(graph, stableRelationshipEdgeId(edge.relationshipIdentity), source, target, relationshipEdgeAttributes(edge), change);
    }
    if (!selectedId && rootFocusId) selectedId = rootFocusId;
    setContinuation(continuationKey, result.continuation);
    return mergeChange(change, retainWithinBudget());
  }

  function mergeImpact(result: ImpactArchitectureResult, continuationKey = "impact"): GraphStoreChange {
    assertIdentity(identity, result);
    const change = emptyChange(selectedId);
    rootFocusId = stableFactAssertionId(result.focusAssertionId);
    for (const item of [...result.items].sort(compareImpactItems)) {
      const id = stableFactNodeId(item);
      mergeNode(graph, id, { ...projectionNodeAttributes(item), score: item.score, impactBand: item.band }, change);
    }
    for (const path of result.paths) {
      for (let index = 0; index < path.relationshipIdentities.length; index += 1) {
        const relationshipIdentity = path.relationshipIdentities[index];
        const sourceAssertionId = path.assertionIds[index];
        const targetAssertionId = path.assertionIds[index + 1];
        if (!relationshipIdentity || !sourceAssertionId || !targetAssertionId) continue;
        const source = stableFactAssertionId(sourceAssertionId);
        const target = stableFactAssertionId(targetAssertionId);
        if (graph.hasNode(source) && graph.hasNode(target)) {
          mergeEdge(graph, stableRelationshipEdgeId(relationshipIdentity), source, target, {
            stableId: stableRelationshipEdgeId(relationshipIdentity),
            kind: "relationship",
            relationCode: "IMPACT_PATH",
            confidence: 1,
            bridge: false,
            weight: 1
          }, change);
        }
      }
    }
    if (!selectedId && graph.hasNode(rootFocusId)) selectedId = rootFocusId;
    setContinuation(continuationKey, result.continuation);
    return mergeChange(change, retainWithinBudget());
  }

  function retainWithinBudget(): GraphStoreChange {
    const change = emptyChange(selectedId);
    if (graph.order > ARCHITECTURE_GRAPH_NODE_LIMIT) {
      const retainedNodeIds = new Set(graph.nodes().sort((left, right) => compareRetentionNodes(graph, left, right, rootFocusId, selectedId)).slice(0, ARCHITECTURE_GRAPH_NODE_LIMIT));
      for (const nodeId of graph.nodes().sort()) {
        if (!retainedNodeIds.has(nodeId)) {
          graph.dropNode(nodeId);
          change.removedNodeIds.push(nodeId);
        }
      }
      change.partialReasons.push("CLIENT_MAX_NODES", "MAX_NODES");
    }
    if (graph.size > ARCHITECTURE_GRAPH_EDGE_LIMIT) {
      const retainedEdgeIds = new Set(graph.edges().sort((left, right) => compareRetentionEdges(graph, left, right)).slice(0, ARCHITECTURE_GRAPH_EDGE_LIMIT));
      for (const edgeId of graph.edges().sort()) {
        if (!retainedEdgeIds.has(edgeId)) {
          graph.dropEdge(edgeId);
          change.removedEdgeIds.push(edgeId);
        }
      }
      change.partialReasons.push("CLIENT_MAX_EDGES", "MAX_EDGES");
    }
    change.selectedId = selectedId;
    return change;
  }

  function select(id?: string): void {
    const stableId = id && graph.hasNode(id) ? id : id ? stableFactAssertionId(id) : undefined;
    selectedId = stableId && graph.hasNode(stableId) ? stableId : undefined;
    highlightNeighborhood(graph, selectedId);
  }

  function clear(): void {
    graph.clear();
    selectedId = undefined;
    rootFocusId = undefined;
    continuations.clear();
  }

  function resetForIdentity(nextInput: GraphStoreIdentityInput): GraphStoreChange {
    const nextIdentity = normalizeIdentity(nextInput);
    if (sameIdentity(identity, nextIdentity)) return emptyChange(selectedId);
    const change = {
      ...emptyChange(undefined),
      removedNodeIds: graph.nodes().sort(),
      removedEdgeIds: graph.edges().sort()
    };
    graph.clear();
    identity = nextIdentity;
    selectedId = undefined;
    rootFocusId = undefined;
    continuations.clear();
    change.identityChanged = true;
    return change;
  }

  function getContinuation(key: string): string | undefined {
    return continuations.get(key);
  }

  function setContinuation(key: string, continuation?: string): void {
    if (continuation) continuations.set(key, continuation);
    else continuations.delete(key);
  }

  function snapshot(): { nodes: GraphSemanticNode[]; edges: GraphSemanticEdge[] } {
    return {
      nodes: graph.nodes().sort().map((id) => ({ id, attributes: graph.getNodeAttributes(id) })),
      edges: graph.edges().sort().map((id) => ({
        id,
        source: graph.source(id),
        target: graph.target(id),
        attributes: graph.getEdgeAttributes(id)
      }))
    };
  }

  return { graph, get identity() { return identity; }, mergeOverview, mergeNeighborhood, mergeImpact, retainWithinBudget, select, clear, resetForIdentity, setIdentity: resetForIdentity, snapshot, getContinuation };
}

export function stableSummaryNodeId(node: GraphSummaryNode): string {
  return node.kind === "cluster" ? (node.id.startsWith("cluster:") ? node.id : `cluster:${node.id}`) : `fact:${node.assertionId ?? node.id}`;
}

export function stableFactNodeId(node: Pick<KnowledgeProjectionNode, "assertionId">): string {
  return stableFactAssertionId(node.assertionId);
}

export function stableFactAssertionId(assertionId: string): string {
  return `fact:${assertionId}`;
}

export function stableSummaryEdgeId(edge: GraphSummaryEdge): string {
  return `summary:${edge.id}`;
}

export function stableRelationshipEdgeId(relationshipIdentity: string): string {
  return `relationship:${relationshipIdentity}`;
}

export function relationAndLayerMatch(
  node: GraphNodeAttributes,
  edge: GraphEdgeAttributes | undefined,
  filters: GraphFilters
): boolean {
  const layerMatches = filters.layers.length === 0 || (node.layer !== undefined && filters.layers.includes(node.layer));
  const relationMatches = filters.relationTypes.length === 0 || (edge !== undefined && filters.relationTypes.includes(edge.relationCode));
  return layerMatches && relationMatches;
}

export function highlightNeighborhood(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  focusId: string | undefined,
  depth = 1
): ReadonlySet<string> {
  if (!focusId || !graph.hasNode(focusId)) {
    clearNeighborhoodHighlight(graph);
    return new Set();
  }
  const highlighted = new Set<string>([focusId]);
  let frontier = [focusId];
  for (let currentDepth = 0; currentDepth < depth; currentDepth += 1) {
    const next = new Set<string>();
    for (const nodeId of frontier.sort()) {
      for (const neighbor of graph.neighbors(nodeId).sort()) {
        if (!highlighted.has(neighbor)) next.add(neighbor);
      }
    }
    for (const nodeId of next) highlighted.add(nodeId);
    frontier = [...next];
  }
  for (const nodeId of graph.nodes()) {
    const highlightedNode = highlighted.has(nodeId);
    graph.mergeNodeAttributes(nodeId, { highlighted: highlightedNode, dimmed: !highlightedNode, opacity: highlightedNode ? 1 : 0.28 });
  }
  for (const edgeId of graph.edges()) {
    const highlightedEdge = highlighted.has(graph.source(edgeId)) && highlighted.has(graph.target(edgeId));
    graph.mergeEdgeAttributes(edgeId, { highlighted: highlightedEdge, dimmed: !highlightedEdge, opacity: highlightedEdge ? 1 : 0.12 });
  }
  return highlighted;
}

export function oneHopNeighborhood(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  focusId: string | undefined
): ReadonlySet<string> {
  if (!focusId || !graph.hasNode(focusId)) return new Set();
  return new Set([focusId, ...graph.neighbors(focusId).sort()]);
}

export function visibleLabel(
  node: Pick<GraphNodeAttributes, "label" | "stableId" | "kind" | "memberCount">,
  stateOrZoom: ArchitectureGraphSemanticState | number,
  maybeZoomOrOptions?: number | { selected?: boolean; hovered?: boolean }
): string | undefined {
  const state = typeof stateOrZoom === "number" ? undefined : stateOrZoom;
  const zoomRatio = typeof stateOrZoom === "number" ? stateOrZoom : typeof maybeZoomOrOptions === "number" ? maybeZoomOrOptions : 1;
  const options = typeof maybeZoomOrOptions === "object" ? maybeZoomOrOptions : undefined;
  if (zoomRatio < 0.38) return undefined;
  const selected = options?.selected ?? (state?.selectedId === node.stableId);
  const hovered = options?.hovered ?? (state?.hoveredId === node.stableId);
  if (zoomRatio < 0.86 && !selected && !hovered) return undefined;
  if (zoomRatio >= 0.86 && !selected && !hovered && state && !state.neighborhoodIds.has(node.stableId ?? "")) return undefined;
  return zoomRatio < 0.64 ? shortenLabel(node.label, 28) : shortenLabel(node.label, 64);
}

export function nodeSize(node: Pick<GraphNodeAttributes, "stableId" | "memberCount" | "degree" | "score"> & Partial<Pick<GraphNodeAttributes, "criticality" | "kind">>, state?: ArchitectureGraphSemanticState): number {
  const selectedBoost = state?.selectedId === node.stableId ? 5 : 0;
  const hoveredBoost = state?.hoveredId === node.stableId ? 2 : 0;
  const impactBoost = node.score ? Math.min(5, Math.round(node.score / 25)) : 0;
  return Math.max(6, Math.min(28, 8 + Math.round(Math.sqrt(Math.max(node.memberCount, node.degree))) + selectedBoost + hoveredBoost + impactBoost));
}

export function nodeColor(node: Pick<GraphNodeAttributes, "kind" | "layer" | "impactBand">): string {
  if (node.impactBand === "DIRECT") return "#d84a3a";
  if (node.impactBand === "LIKELY") return "#d18c2b";
  if (node.impactBand === "EXTENDED") return "#3c8d73";
  if (node.impactBand === "UNRESOLVED") return "#7d748d";
  if (node.kind === "cluster") return "#49617a";
  if (node.layer === "BIZ") return "#d97706";
  if (node.layer === "SYS") return "#356ea8";
  return "#7a5ea3";
}

export function edgeOpacity(
  edge: Pick<GraphEdgeAttributes, "opacity"> | { source: string; target: string; attributes: GraphEdgeAttributes },
  state?: ArchitectureGraphSemanticState
): number {
  if (!("attributes" in edge)) return edge.opacity ?? 1;
  if (!state) return edge.attributes.opacity ?? 1;
  if (state.neighborhoodIds.size === 0) return 0.72;
  return state.neighborhoodIds.has(edge.source) && state.neighborhoodIds.has(edge.target) ? 0.9 : 0.12;
}

export function isHighlighted(value: string | Pick<GraphNodeAttributes, "highlighted">, state?: ArchitectureGraphSemanticState): boolean {
  if (typeof value !== "string") return value.highlighted ?? false;
  return state?.selectedId === value || state?.hoveredId === value || state?.neighborhoodIds.has(value) || false;
}

function clearNeighborhoodHighlight(graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>): void {
  for (const nodeId of graph.nodes()) graph.mergeNodeAttributes(nodeId, { highlighted: false, dimmed: false, opacity: 1 });
  for (const edgeId of graph.edges()) graph.mergeEdgeAttributes(edgeId, { highlighted: false, dimmed: false, opacity: 1 });
}

function stableSummaryEndpoint(summaryId: string, nodes: readonly GraphSummaryNode[]): string | undefined {
  const node = nodes.find((candidate) => candidate.id === summaryId || candidate.assertionId === summaryId);
  return node ? stableSummaryNodeId(node) : undefined;
}

function mergeNode(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  id: string,
  attributes: GraphNodeAttributes,
  change: GraphStoreChange
): void {
  if (!graph.hasNode(id)) change.addedNodeIds.push(id);
  graph.mergeNode(id, attributes);
}

function mergeEdge(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  id: string,
  source: string,
  target: string,
  attributes: GraphEdgeAttributes,
  change: GraphStoreChange
): void {
  if (!graph.hasEdge(id)) change.addedEdgeIds.push(id);
  graph.mergeDirectedEdgeWithKey(id, source, target, attributes);
}

function summaryNodeAttributes(node: GraphSummaryNode): GraphNodeAttributes {
  return {
    stableId: stableSummaryNodeId(node),
    kind: node.kind,
    label: node.label,
    layer: node.layer,
    clusterId: node.clusterId,
    assertionId: node.assertionId,
    memberCount: node.memberCount,
    degree: node.degree,
    criticality: node.criticality,
    x: node.positionSeed.x,
    y: node.positionSeed.y,
    opacity: 1,
    highlighted: true,
    dimmed: false
  };
}

function projectionNodeAttributes(node: KnowledgeProjectionNode): GraphNodeAttributes {
  return {
    stableId: stableFactNodeId(node),
    kind: "fact",
    label: node.semanticIdentity,
    layer: node.layer,
    assertionId: node.assertionId,
    memberCount: 1,
    degree: 0,
    criticality: 0,
    x: stableCoordinate(node.assertionId, 0),
    y: stableCoordinate(node.assertionId, 1),
    opacity: 1,
    highlighted: true,
    dimmed: false
  };
}

function summaryEdgeAttributes(edge: GraphSummaryEdge): GraphEdgeAttributes {
  return {
    stableId: stableSummaryEdgeId(edge),
    kind: "summary",
    relationCode: edge.relationCode,
    confidence: edge.confidence,
    bridge: edge.bridge,
    weight: Math.max(1, edge.confidence * (edge.bridge ? 2 : 1)),
    opacity: 1,
    highlighted: true,
    dimmed: false
  };
}

function relationshipEdgeAttributes(edge: KnowledgeProjectionEdge): GraphEdgeAttributes {
  return {
    stableId: stableRelationshipEdgeId(edge.relationshipIdentity),
    kind: "relationship",
    relationCode: edge.relationCode,
    confidence: edge.confidence,
    bridge: false,
    weight: Math.max(1, edge.confidence),
    opacity: 1,
    highlighted: true,
    dimmed: false
  };
}

function emptyChange(selectedId?: string): GraphStoreChange {
  return { addedNodeIds: [], addedEdgeIds: [], removedNodeIds: [], removedEdgeIds: [], partialReasons: [], selectedId, addedNodes: 0, addedEdges: 0, identityChanged: false };
}

function mergeChange(left: GraphStoreChange, right: GraphStoreChange): GraphStoreChange {
  return {
    addedNodeIds: [...new Set([...left.addedNodeIds, ...right.addedNodeIds])].sort(),
    addedEdgeIds: [...new Set([...left.addedEdgeIds, ...right.addedEdgeIds])].sort(),
    removedNodeIds: [...new Set([...left.removedNodeIds, ...right.removedNodeIds])].sort(),
    removedEdgeIds: [...new Set([...left.removedEdgeIds, ...right.removedEdgeIds])].sort(),
    partialReasons: [...new Set([...left.partialReasons, ...right.partialReasons])],
    selectedId: right.selectedId ?? left.selectedId,
    addedNodes: left.addedNodeIds.length + right.addedNodeIds.length,
    addedEdges: left.addedEdgeIds.length + right.addedEdgeIds.length,
    identityChanged: left.identityChanged || right.identityChanged
  };
}

function assertIdentity(identity: GraphStoreIdentity, result: Pick<OverviewArchitectureResult, "applicationServiceId" | "scopePath" | "baselineId" | "projectionManifestId">): void {
  if (!sameIdentity(identity, result)) throw new Error("GRAPH_STORE_IDENTITY_MISMATCH");
}

function sameIdentity(left: GraphStoreIdentity, right: Pick<GraphStoreIdentity, "applicationServiceId" | "scopePath" | "baselineId" | "projectionManifestId">): boolean {
  return left.applicationServiceId === right.applicationServiceId
    && left.scopePath === right.scopePath
    && left.baselineId === right.baselineId
    && left.projectionManifestId === right.projectionManifestId;
}

function normalizeIdentity(identity: GraphStoreIdentityInput): GraphStoreIdentity {
  if ("applicationServiceId" in identity) return identity;
  return { applicationServiceId: identity.scope, scopePath: identity.scopePath, baselineId: identity.baselineId, projectionManifestId: identity.projectionManifestId };
}

function compareSummaryNodes(left: GraphSummaryNode, right: GraphSummaryNode): number {
  return stableSummaryNodeId(left).localeCompare(stableSummaryNodeId(right));
}

function compareSummaryEdges(left: GraphSummaryEdge, right: GraphSummaryEdge): number {
  return stableSummaryEdgeId(left).localeCompare(stableSummaryEdgeId(right));
}

function compareProjectionNodes(left: KnowledgeProjectionNode, right: KnowledgeProjectionNode): number {
  return left.sortKey.localeCompare(right.sortKey) || left.assertionId.localeCompare(right.assertionId);
}

function compareProjectionEdges(left: KnowledgeProjectionEdge, right: KnowledgeProjectionEdge): number {
  return left.relationshipIdentity.localeCompare(right.relationshipIdentity);
}

function compareImpactItems(left: ImpactArchitectureItem, right: ImpactArchitectureItem): number {
  return right.score - left.score || left.assertionId.localeCompare(right.assertionId);
}

function compareRetentionNodes(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  left: string,
  right: string,
  rootFocusId: string | undefined,
  selectedId: string | undefined
): number {
  const leftRank = retentionRank(graph.getNodeAttributes(left), left, rootFocusId, selectedId);
  const rightRank = retentionRank(graph.getNodeAttributes(right), right, rootFocusId, selectedId);
  return rightRank - leftRank || left.localeCompare(right);
}

function retentionRank(attributes: GraphNodeAttributes, id: string, rootFocusId: string | undefined, selectedId: string | undefined): number {
  const focusBoost = id === rootFocusId ? 1_000_000 : 0;
  const selectedBoost = id === selectedId ? 500_000 : 0;
  return focusBoost + selectedBoost + (attributes.score ?? 0) * 1_000 + attributes.criticality * 100 + attributes.degree * 10 + attributes.memberCount;
}

function compareRetentionEdges(
  graph: MultiDirectedGraph<GraphNodeAttributes, GraphEdgeAttributes>,
  left: string,
  right: string
): number {
  const leftAttributes = graph.getEdgeAttributes(left);
  const rightAttributes = graph.getEdgeAttributes(right);
  return (rightAttributes.weight - leftAttributes.weight)
    || Number(rightAttributes.bridge) - Number(leftAttributes.bridge)
    || left.localeCompare(right);
}

function shortenLabel(label: string, maximum: number): string {
  return label.length <= maximum ? label : `${label.slice(0, Math.max(1, maximum - 1))}…`;
}

function stableCoordinate(value: string, axis: number): number {
  let hash = 2_166_136_261 + axis;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) / 0xffff_ffff - 0.5) * 1_000;
}
