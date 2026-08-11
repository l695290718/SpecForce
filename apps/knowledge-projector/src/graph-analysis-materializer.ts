import { contentDigest, type ArchitectureScopeRef, type KnowledgeProjectionEdge, type KnowledgeProjectionNode } from "@specforge/core";
import type { GraphAnalysisPublication, GraphAnalysisCluster, GraphAnalysisNodeMetric, GraphAnalysisSummaryEdge } from "./repository.js";

export const DEFAULT_GRAPH_ANALYSIS_VERSION = "3a.graph-analysis.v1";
export const DEFAULT_GRAPH_ANALYSIS_POLICY_VERSION = "impact-v1";

export interface GraphAnalysisMaterializer {
  build(input: {
    scope: ArchitectureScopeRef;
    generationId: string;
    baselineId: string;
    projectionManifestId: string;
    nodes: readonly KnowledgeProjectionNode[];
    edges: readonly KnowledgeProjectionEdge[];
    analysisVersion: string;
  }): Promise<GraphAnalysisPublication>;
}

export class GraphAnalysisMaterializationError extends Error {
  constructor(readonly code: "GRAPH_ANALYSIS_SCOPE_MISMATCH" | "GRAPH_ANALYSIS_ENDPOINT_UNRESOLVED") {
    super(code);
  }
}

export class DeterministicGraphAnalysisMaterializer implements GraphAnalysisMaterializer {
  async build(input: Parameters<GraphAnalysisMaterializer["build"]>[0]): Promise<GraphAnalysisPublication> {
    const nodes = uniqueSortedNodes(input.nodes);
    const edges = uniqueSortedEdges(input.edges);
    validateInput(input, nodes, edges);

    const nodesById = new Map(nodes.map((node) => [node.assertionId, node]));
    const clusterIdsByAssertionId = clusterNodes(input.scope, input.generationId, nodes, edges);
    const degreeByAssertionId = degreeByNode(nodes, edges);
    const bridgeEdges = edges.filter((edge) => clusterIdsByAssertionId.get(edge.sourceAssertionId) !== clusterIdsByAssertionId.get(edge.targetAssertionId));
    const bridgeNodeIds = new Set(bridgeEdges.flatMap((edge) => [edge.sourceAssertionId, edge.targetAssertionId]));
    const maximumDegree = Math.max(1, ...degreeByAssertionId.values());

    const nodeMetrics = nodes.map((node) => {
      const degree = degreeByAssertionId.get(node.assertionId) ?? 0;
      const isBridge = bridgeNodeIds.has(node.assertionId);
      const criticality = normalizeCriticality(degree, maximumDegree, isBridge);
      const inboundImpactWeight = impactWeight(node.assertionId, edges, "inbound", criticality);
      const outboundImpactWeight = impactWeight(node.assertionId, edges, "outbound", criticality);
      const position = positionSeed(input.scope, input.generationId, node.assertionId);
      const clusterId = clusterIdsByAssertionId.get(node.assertionId)!;
      const metric: GraphAnalysisNodeMetric = {
        assertionId: node.assertionId,
        semanticIdentity: node.semanticIdentity,
        layer: node.layer,
        ...(node.acceptedAssetType ? { acceptedAssetType: node.acceptedAssetType } : {}),
        clusterId,
        degree,
        criticality,
        isBridge,
        positionX: position.x,
        positionY: position.y,
        inboundImpactWeight,
        outboundImpactWeight,
        contentDigest: contentDigest({ node, clusterId, degree, criticality, isBridge, position, inboundImpactWeight, outboundImpactWeight })
      };
      return metric;
    });

    const clusters = buildClusters(input.scope, input.generationId, nodes, edges, nodeMetrics, clusterIdsByAssertionId);
    const summaryEdges = buildSummaryEdges(input.scope, bridgeEdges, nodesById, clusterIdsByAssertionId);
    const sourceContentDigest = contentDigest({
      scope: input.scope,
      generationId: input.generationId,
      baselineId: input.baselineId,
      projectionManifestId: input.projectionManifestId,
      nodes: nodes.map((node) => ({ assertionId: node.assertionId, contentDigest: node.contentDigest })),
      edges: edges.map((edge) => ({ relationshipIdentity: edge.relationshipIdentity, contentDigest: edge.contentDigest }))
    });
    const publicationBase = {
      scope: input.scope,
      generationId: input.generationId,
      baselineId: input.baselineId,
      projectionManifestId: input.projectionManifestId,
      analysisVersion: input.analysisVersion,
      policyVersion: DEFAULT_GRAPH_ANALYSIS_POLICY_VERSION,
      relationshipVersion: edges[0]?.relationshipVersion ?? "none",
      sourceContentDigest,
      clusters,
      nodeMetrics,
      summaryEdges,
      partialReasons: [] as string[]
    };
    return {
      ...publicationBase,
      contentDigest: contentDigest(publicationBase)
    };
  }
}

function validateInput(input: Parameters<GraphAnalysisMaterializer["build"]>[0], nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[]): void {
  const nodeIds = new Set<string>();
  for (const node of nodes) {
    if (!matchesIdentity(node, input) || nodeIds.has(node.assertionId)) throw new GraphAnalysisMaterializationError("GRAPH_ANALYSIS_SCOPE_MISMATCH");
    nodeIds.add(node.assertionId);
  }
  for (const edge of edges) {
    if (!matchesIdentity(edge, input)) throw new GraphAnalysisMaterializationError("GRAPH_ANALYSIS_SCOPE_MISMATCH");
    if (!nodeIds.has(edge.sourceAssertionId) || !nodeIds.has(edge.targetAssertionId)) throw new GraphAnalysisMaterializationError("GRAPH_ANALYSIS_ENDPOINT_UNRESOLVED");
  }
}

function matchesIdentity(item: ArchitectureScopeRef & { generationId: string; baselineId: string }, input: Parameters<GraphAnalysisMaterializer["build"]>[0]): boolean {
  return item.applicationServiceId === input.scope.applicationServiceId
    && item.scopePath === input.scope.scopePath
    && item.generationId === input.generationId
    && item.baselineId === input.baselineId;
}

function uniqueSortedNodes(nodes: readonly KnowledgeProjectionNode[]): KnowledgeProjectionNode[] {
  const byId = new Map<string, KnowledgeProjectionNode>();
  for (const node of nodes) {
    const current = byId.get(node.assertionId);
    if (!current || node.contentDigest.localeCompare(current.contentDigest) < 0) byId.set(node.assertionId, node);
  }
  return [...byId.values()].sort(compareNodes);
}

function uniqueSortedEdges(edges: readonly KnowledgeProjectionEdge[]): KnowledgeProjectionEdge[] {
  const byId = new Map<string, KnowledgeProjectionEdge>();
  for (const edge of edges) {
    const current = byId.get(edge.relationshipIdentity);
    if (!current || edge.contentDigest.localeCompare(current.contentDigest) < 0) byId.set(edge.relationshipIdentity, edge);
  }
  return [...byId.values()].sort(compareEdges);
}

function clusterNodes(scope: ArchitectureScopeRef, generationId: string, nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[]): Map<string, string> {
  const neighbors = new Map<string, Set<string>>(nodes.map((node) => [node.assertionId, new Set()]));
  const byId = new Map(nodes.map((node) => [node.assertionId, node]));
  for (const edge of edges) {
    const source = byId.get(edge.sourceAssertionId)!;
    const target = byId.get(edge.targetAssertionId)!;
    if (source.layer !== target.layer) continue;
    neighbors.get(source.assertionId)!.add(target.assertionId);
    neighbors.get(target.assertionId)!.add(source.assertionId);
  }
  const visited = new Set<string>();
  const result = new Map<string, string>();
  for (const node of nodes) {
    if (visited.has(node.assertionId)) continue;
    const members: string[] = [];
    const queue = [node.assertionId];
    visited.add(node.assertionId);
    while (queue.length) {
      const current = queue.shift()!;
      members.push(current);
      for (const next of [...(neighbors.get(current) ?? [])].sort()) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    members.sort();
    const clusterId = `cluster:${contentDigest({ scope, generationId, layer: node.layer, members }).slice(0, 32)}`;
    for (const assertionId of members) result.set(assertionId, clusterId);
  }
  return result;
}

function degreeByNode(nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[]): Map<string, number> {
  const result = new Map(nodes.map((node) => [node.assertionId, 0]));
  for (const edge of edges) {
    result.set(edge.sourceAssertionId, (result.get(edge.sourceAssertionId) ?? 0) + 1);
    result.set(edge.targetAssertionId, (result.get(edge.targetAssertionId) ?? 0) + 1);
  }
  return result;
}

function buildClusters(scope: ArchitectureScopeRef, generationId: string, nodes: readonly KnowledgeProjectionNode[], edges: readonly KnowledgeProjectionEdge[], metrics: readonly GraphAnalysisNodeMetric[], clusterIds: ReadonlyMap<string, string>): GraphAnalysisCluster[] {
  const nodesByCluster = new Map<string, KnowledgeProjectionNode[]>();
  for (const node of nodes) {
    const clusterId = clusterIds.get(node.assertionId)!;
    const items = nodesByCluster.get(clusterId) ?? [];
    items.push(node);
    nodesByCluster.set(clusterId, items);
  }
  const metricByNode = new Map(metrics.map((metric) => [metric.assertionId, metric]));
  return [...nodesByCluster.entries()].map(([clusterId, members]) => {
    const orderedMembers = [...members].sort(compareNodes);
    const layer = orderedMembers[0]!.layer;
    const incidentEdges = edges.filter((edge) => orderedMembers.some((node) => node.assertionId === edge.sourceAssertionId || node.assertionId === edge.targetAssertionId));
    const degree = incidentEdges.length;
    const criticality = round(orderedMembers.reduce((sum, node) => sum + metricByNode.get(node.assertionId)!.criticality, 0) / orderedMembers.length);
    const position = positionSeed(scope, generationId, clusterId);
    const label = `${layer}:${orderedMembers[0]!.semanticIdentity}`;
    const row: GraphAnalysisCluster = {
      clusterId,
      label,
      layer,
      memberCount: orderedMembers.length,
      degree,
      criticality,
      positionX: position.x,
      positionY: position.y,
      contentDigest: contentDigest({ clusterId, label, layer, members: orderedMembers.map((node) => node.assertionId), degree, criticality, position })
    };
    return row;
  }).sort((left, right) => left.clusterId.localeCompare(right.clusterId));
}

function buildSummaryEdges(scope: ArchitectureScopeRef, edges: readonly KnowledgeProjectionEdge[], nodesById: ReadonlyMap<string, KnowledgeProjectionNode>, clusterIds: ReadonlyMap<string, string>): GraphAnalysisSummaryEdge[] {
  return edges.map((edge) => {
    const sourceClusterId = clusterIds.get(edge.sourceAssertionId)!;
    const targetClusterId = clusterIds.get(edge.targetAssertionId)!;
    const bridge = sourceClusterId !== targetClusterId;
    const row: GraphAnalysisSummaryEdge = {
      id: `summary:${contentDigest({ scope, relationshipIdentity: edge.relationshipIdentity, sourceClusterId, targetClusterId }).slice(0, 32)}`,
      sourceClusterId,
      targetClusterId,
      sourceAssertionId: edge.sourceAssertionId,
      targetAssertionId: edge.targetAssertionId,
      sourceSemanticIdentity: nodesById.get(edge.sourceAssertionId)!.semanticIdentity,
      targetSemanticIdentity: nodesById.get(edge.targetAssertionId)!.semanticIdentity,
      relationCode: edge.relationCode,
      confidence: edge.confidence,
      bridge,
      contentDigest: edge.contentDigest
    };
    return row;
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function normalizeCriticality(degree: number, maximumDegree: number, isBridge: boolean): number {
  return round(Math.min(100, (degree / maximumDegree) * 70 + (isBridge ? 30 : 0)));
}

function impactWeight(assertionId: string, edges: readonly KnowledgeProjectionEdge[], direction: "inbound" | "outbound", criticality: number): number {
  const confidence = edges.filter((edge) => direction === "inbound" ? edge.targetAssertionId === assertionId : edge.sourceAssertionId === assertionId).reduce((sum, edge) => sum + edge.confidence, 0);
  return round(1 + confidence + criticality / 100);
}

function positionSeed(scope: ArchitectureScopeRef, generationId: string, identity: string): { x: number; y: number } {
  const digest = contentDigest({ scope, generationId, assertionId: identity });
  const x = (Number.parseInt(digest.slice(0, 8), 16) / 0xffffffff) * 2 - 1;
  const y = (Number.parseInt(digest.slice(8, 16), 16) / 0xffffffff) * 2 - 1;
  return { x: round(x), y: round(y) };
}

function compareNodes(left: KnowledgeProjectionNode, right: KnowledgeProjectionNode): number {
  return left.layer.localeCompare(right.layer) || left.semanticIdentity.localeCompare(right.semanticIdentity) || left.assertionId.localeCompare(right.assertionId);
}

function compareEdges(left: KnowledgeProjectionEdge, right: KnowledgeProjectionEdge): number {
  return left.sourceAssertionId.localeCompare(right.sourceAssertionId) || left.targetAssertionId.localeCompare(right.targetAssertionId) || left.relationCode.localeCompare(right.relationCode) || left.relationshipIdentity.localeCompare(right.relationshipIdentity);
}

function round(value: number): number {
  return Number(value.toFixed(6));
}
