import { Prisma, PrismaClient } from "@prisma/client";
import type { ArchitectureScopeRef, KnowledgeProjectionEdge, ProjectionManifestV2 } from "@specforge/core";
import type { ArchitectureLayer, GraphAnalysisBudget, GraphSummaryEdge, GraphSummaryNode, ThreeAPartialReason, TraceDirection } from "./types";

export const defaultGraphAnalysisVersion = "graph-analysis-v1";
export const graphAnalysisWriteBatchSize = 1_000;

export type GraphAnalysisAvailability = "READY" | "STALE" | "VERSION_MISMATCH" | "UNAVAILABLE";

export interface GraphAnalysisReference extends ArchitectureScopeRef {
  id: string;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  analysisVersion: string;
  policyVersion: string;
  sourceContentDigest: string;
  relationshipVersion: string;
  contentDigest: string;
}

export interface GraphClusterPublication {
  clusterId: string;
  label: string;
  layer?: ArchitectureLayer;
  memberCount: number;
  degree: number;
  criticality: number;
  positionSeed: { x: number; y: number };
  contentDigest: string;
}

export interface GraphNodeMetricPublication {
  assertionId: string;
  semanticIdentity: string;
  layer: ArchitectureLayer;
  acceptedAssetType?: string;
  clusterId?: string;
  degree: number;
  criticality: number;
  bridge: boolean;
  positionSeed: { x: number; y: number };
  inboundImpactWeight: number;
  outboundImpactWeight: number;
  contentDigest: string;
}

export interface GraphAnalysisPublicationInput {
  analysisVersion: string;
  policyVersion: string;
  contentDigest: string;
  summaryEdges: readonly GraphSummaryEdge[];
  partialReasons?: readonly ThreeAPartialReason[];
  clusterCount: number;
  nodeMetricCount: number;
  bridgeEdgeCount: number;
  status?: "READY" | "UNAVAILABLE";
  publishedAt?: Date;
}

export interface OverviewRepositoryInput {
  analysisVersion?: string;
  layers?: readonly ArchitectureLayer[];
  assetTypes?: readonly string[];
  relationTypes?: readonly string[];
  afterClusterId?: string;
  budget: GraphAnalysisBudget;
}

export interface OverviewRepositoryResult {
  availability: GraphAnalysisAvailability;
  analysis?: GraphAnalysisReference;
  nodes: GraphSummaryNode[];
  edges: GraphSummaryEdge[];
  partialReasons: ThreeAPartialReason[];
  nextAfterClusterId?: string;
}

export interface ImpactRepositoryInput {
  analysisVersion?: string;
  focusAssertionId: string;
  direction: TraceDirection;
  layers?: readonly ArchitectureLayer[];
  relationTypes?: readonly string[];
  afterAssertionId?: string;
  budget: GraphAnalysisBudget;
}

export interface GraphNodeMetric extends ArchitectureScopeRef {
  assertionId: string;
  semanticIdentity: string;
  layer: ArchitectureLayer;
  acceptedAssetType?: string;
  clusterId?: string;
  degree: number;
  criticality: number;
  bridge: boolean;
  positionSeed: { x: number; y: number };
  inboundImpactWeight: number;
  outboundImpactWeight: number;
  contentDigest: string;
}

export interface ImpactRepositoryResult {
  availability: GraphAnalysisAvailability;
  analysis?: GraphAnalysisReference;
  edges: KnowledgeProjectionEdge[];
  metrics: GraphNodeMetric[];
  partialReasons: ThreeAPartialReason[];
  nextAfterAssertionId?: string;
}

export interface ClusterMembersRepositoryInput {
  analysisVersion?: string;
  clusterId: string;
  afterSemanticIdentity?: string;
  limit: number;
}

export interface ClusterMembersRepositoryResult {
  availability: GraphAnalysisAvailability;
  analysis?: GraphAnalysisReference;
  members: GraphNodeMetric[];
  nextAfterSemanticIdentity?: string;
}

export interface GraphAnalysisRepository {
  upsertAnalysis(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: GraphAnalysisPublicationInput): Promise<GraphAnalysisReference>;
  upsertClusters(scope: ArchitectureScopeRef, analysis: GraphAnalysisReference, clusters: readonly GraphClusterPublication[]): Promise<void>;
  upsertNodeMetrics(scope: ArchitectureScopeRef, analysis: GraphAnalysisReference, metrics: readonly GraphNodeMetricPublication[]): Promise<void>;
  loadOverview(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: OverviewRepositoryInput): Promise<OverviewRepositoryResult>;
  loadImpact(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: ImpactRepositoryInput): Promise<ImpactRepositoryResult>;
  loadNodeMetrics(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionIds: readonly string[], analysisVersion?: string): Promise<GraphNodeMetric[]>;
  loadClusterMembers(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: ClusterMembersRepositoryInput): Promise<ClusterMembersRepositoryResult>;
}

export function createGraphAnalysisRepository(prisma: PrismaClient): GraphAnalysisRepository {
  return new PrismaGraphAnalysisRepository(prisma);
}

class PrismaGraphAnalysisRepository implements GraphAnalysisRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertAnalysis(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: GraphAnalysisPublicationInput): Promise<GraphAnalysisReference> {
    assertManifestScope(scope, manifest);
    assertAnalysisVersion(input.analysisVersion);
    assertSummaryEdges(scope, input.summaryEdges);
    assertCount(input.summaryEdges.length, graphAnalysisWriteBatchSize, "GRAPH_ANALYSIS_SUMMARY_EDGE_LIMIT");
    const where = { applicationServiceId_scopePath_generationId_projectionManifestId_analysisVersion: { ...scope, generationId: manifest.generationId, projectionManifestId: manifest.id, analysisVersion: input.analysisVersion } };
    const existing = await this.prisma.knowledgeGraphAnalysis.findUnique({ where });
    if (existing && existing.contentDigest !== input.contentDigest) throw new Error("GRAPH_ANALYSIS_VERSION_CONFLICT");
    const data = {
      baselineId: manifest.baselineId,
      policyVersion: input.policyVersion,
      status: input.status ?? "READY",
      sourceContentDigest: manifest.contentDigest,
      relationshipVersion: manifest.relationshipVersion,
      contentDigest: input.contentDigest,
      summaryEdges: input.summaryEdges as unknown as Prisma.InputJsonValue,
      partialReasons: uniquePartialReasons(input.partialReasons ?? []),
      clusterCount: nonNegative(input.clusterCount, "GRAPH_ANALYSIS_INVALID_COUNT"),
      nodeMetricCount: nonNegative(input.nodeMetricCount, "GRAPH_ANALYSIS_INVALID_COUNT"),
      bridgeEdgeCount: nonNegative(input.bridgeEdgeCount, "GRAPH_ANALYSIS_INVALID_COUNT"),
      publishedAt: input.publishedAt ?? new Date()
    };
    const row = await this.prisma.knowledgeGraphAnalysis.upsert({
      where,
      create: { ...scope, generationId: manifest.generationId, projectionManifestId: manifest.id, analysisVersion: input.analysisVersion, ...data },
      update: data
    });
    assertRowScope(scope, row);
    return analysisFromRow(row);
  }

  async upsertClusters(scope: ArchitectureScopeRef, analysis: GraphAnalysisReference, clusters: readonly GraphClusterPublication[]): Promise<void> {
    assertAnalysisScope(scope, analysis);
    assertCount(clusters.length, graphAnalysisWriteBatchSize, "GRAPH_ANALYSIS_CLUSTER_BATCH_LIMIT");
    const ordered = [...clusters].sort((left, right) => left.clusterId.localeCompare(right.clusterId));
    await Promise.all(ordered.map((cluster) => this.prisma.knowledgeGraphCluster.upsert({
      where: { analysisId_clusterId: { analysisId: analysis.id, clusterId: cluster.clusterId } },
      create: { ...scope, analysisId: analysis.id, clusterId: cluster.clusterId, label: cluster.label, layer: cluster.layer, memberCount: nonNegative(cluster.memberCount, "GRAPH_ANALYSIS_INVALID_CLUSTER"), degree: nonNegative(cluster.degree, "GRAPH_ANALYSIS_INVALID_CLUSTER"), criticality: finiteNonNegative(cluster.criticality, "GRAPH_ANALYSIS_INVALID_CLUSTER"), positionX: finite(cluster.positionSeed.x, "GRAPH_ANALYSIS_INVALID_CLUSTER"), positionY: finite(cluster.positionSeed.y, "GRAPH_ANALYSIS_INVALID_CLUSTER"), contentDigest: cluster.contentDigest },
      update: { label: cluster.label, layer: cluster.layer, memberCount: nonNegative(cluster.memberCount, "GRAPH_ANALYSIS_INVALID_CLUSTER"), degree: nonNegative(cluster.degree, "GRAPH_ANALYSIS_INVALID_CLUSTER"), criticality: finiteNonNegative(cluster.criticality, "GRAPH_ANALYSIS_INVALID_CLUSTER"), positionX: finite(cluster.positionSeed.x, "GRAPH_ANALYSIS_INVALID_CLUSTER"), positionY: finite(cluster.positionSeed.y, "GRAPH_ANALYSIS_INVALID_CLUSTER"), contentDigest: cluster.contentDigest }
    })));
  }

  async upsertNodeMetrics(scope: ArchitectureScopeRef, analysis: GraphAnalysisReference, metrics: readonly GraphNodeMetricPublication[]): Promise<void> {
    assertAnalysisScope(scope, analysis);
    assertCount(metrics.length, graphAnalysisWriteBatchSize, "GRAPH_ANALYSIS_METRIC_BATCH_LIMIT");
    const ordered = [...metrics].sort((left, right) => left.assertionId.localeCompare(right.assertionId));
    await Promise.all(ordered.map((metric) => this.prisma.knowledgeGraphNodeMetric.upsert({
      where: { analysisId_assertionId: { analysisId: analysis.id, assertionId: metric.assertionId } },
      create: metricPublicationData(scope, analysis.id, metric),
      update: metricPublicationUpdate(metric)
    })));
  }

  async loadOverview(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: OverviewRepositoryInput): Promise<OverviewRepositoryResult> {
    const analysisResult = await this.loadReadyAnalysis(scope, manifest, input.analysisVersion);
    if (!analysisResult.analysis) return emptyOverview(analysisResult.availability);
    const analysis = analysisResult.analysis;
    const maxNodes = bounded(input.budget.maxNodes, 1, graphAnalysisWriteBatchSize);
    const clusterRows = await this.prisma.knowledgeGraphCluster.findMany({
      where: { ...scope, analysisId: analysis.id, ...(input.layers?.length ? { layer: { in: uniqueStrings(input.layers) } } : {}), ...(input.afterClusterId ? { clusterId: { gt: input.afterClusterId } } : {}) },
      orderBy: [{ clusterId: "asc" }],
      take: maxNodes + 1
    });
    clusterRows.forEach((row) => assertRowScope(scope, row));
    const hasMoreClusters = clusterRows.length > maxNodes;
    const nodes = clusterRows.slice(0, maxNodes).map((row) => clusterSummaryNode(scope, row));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = summaryEdgesFromAnalysis(scope, analysisResult.row!.summaryEdges, input.relationTypes)
      .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
      .slice(0, bounded(input.budget.maxEdges, 1, graphAnalysisWriteBatchSize));
    const partialReasons = uniquePartialReasons([
      ...analysisResult.partialReasons,
      ...(hasMoreClusters ? ["MAX_NODES" as const] : []),
      ...(summaryEdgesFromAnalysis(scope, analysisResult.row!.summaryEdges, input.relationTypes).length > edges.length ? ["MAX_EDGES" as const] : [])
    ]);
    return { availability: "READY", analysis, nodes, edges, partialReasons, ...(hasMoreClusters && nodes.at(-1) ? { nextAfterClusterId: nodes.at(-1)!.id.replace(/^cluster:/, "") } : {}) };
  }

  async loadImpact(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: ImpactRepositoryInput): Promise<ImpactRepositoryResult> {
    const analysisResult = await this.loadReadyAnalysis(scope, manifest, input.analysisVersion);
    if (!analysisResult.analysis) return { availability: analysisResult.availability, edges: [], metrics: [], partialReasons: analysisResult.partialReasons };
    const edgeLimit = bounded(input.budget.maxEdges, 1, graphAnalysisWriteBatchSize);
    const directional = input.direction === "downstream"
      ? { sourceAssertionId: input.focusAssertionId }
      : input.direction === "upstream"
        ? { targetAssertionId: input.focusAssertionId }
        : { OR: [{ sourceAssertionId: input.focusAssertionId }, { targetAssertionId: input.focusAssertionId }] };
    const edgeRows = await this.prisma.knowledgeProjectionEdge.findMany({
      where: { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, ...directional, ...(input.relationTypes?.length ? { relationCode: { in: uniqueStrings(input.relationTypes) } } : {}) },
      orderBy: [{ sourceAssertionId: "asc" }, { targetAssertionId: "asc" }, { relationshipIdentity: "asc" }],
      take: edgeLimit + 1
    });
    edgeRows.forEach((row) => assertRowScope(scope, row));
    const hasMoreEdges = edgeRows.length > edgeLimit;
    const edges = edgeRows.slice(0, edgeLimit).map(edgeFromRow);
    const candidateIds = uniqueStrings(edges.flatMap((edge) => [edge.sourceAssertionId, edge.targetAssertionId]).filter((id) => id !== input.focusAssertionId));
    const metricLimit = bounded(input.budget.maxNodes, 1, graphAnalysisWriteBatchSize);
    const metricRows = candidateIds.length ? await this.prisma.knowledgeGraphNodeMetric.findMany({
      where: { ...scope, analysisId: analysisResult.analysis.id, assertionId: { in: candidateIds }, ...(input.layers?.length ? { layer: { in: uniqueStrings(input.layers) } } : {}), ...(input.afterAssertionId ? { assertionId: { gt: input.afterAssertionId } } : {}) },
      orderBy: [{ assertionId: "asc" }],
      take: metricLimit + 1
    }) : [];
    metricRows.forEach((row) => assertRowScope(scope, row));
    const hasMoreMetrics = metricRows.length > metricLimit;
    const metrics = metricRows.slice(0, metricLimit).map((row) => metricFromRow(scope, row));
    return {
      availability: "READY",
      analysis: analysisResult.analysis,
      edges,
      metrics,
      partialReasons: uniquePartialReasons([...analysisResult.partialReasons, ...(hasMoreEdges ? ["MAX_EDGES" as const] : []), ...(hasMoreMetrics ? ["MAX_NODES" as const] : [])]),
      ...(hasMoreMetrics && metrics.at(-1) ? { nextAfterAssertionId: metrics.at(-1)!.assertionId } : {})
    };
  }

  async loadNodeMetrics(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionIds: readonly string[], analysisVersion?: string): Promise<GraphNodeMetric[]> {
    const analysisResult = await this.loadReadyAnalysis(scope, manifest, analysisVersion);
    if (!analysisResult.analysis) return [];
    const ids = uniqueStrings(assertionIds);
    assertCount(ids.length, graphAnalysisWriteBatchSize, "GRAPH_ANALYSIS_METRIC_LOOKUP_LIMIT");
    if (!ids.length) return [];
    const rows = await this.prisma.knowledgeGraphNodeMetric.findMany({
      where: { ...scope, analysisId: analysisResult.analysis.id, assertionId: { in: ids } },
      orderBy: [{ assertionId: "asc" }],
      take: ids.length
    });
    rows.forEach((row) => assertRowScope(scope, row));
    return rows.map((row) => metricFromRow(scope, row));
  }

  async loadClusterMembers(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: ClusterMembersRepositoryInput): Promise<ClusterMembersRepositoryResult> {
    const analysisResult = await this.loadReadyAnalysis(scope, manifest, input.analysisVersion);
    if (!analysisResult.analysis) return { availability: analysisResult.availability, members: [] };
    const limit = bounded(input.limit, 1, graphAnalysisWriteBatchSize);
    const rows = await this.prisma.knowledgeGraphNodeMetric.findMany({
      where: { ...scope, analysisId: analysisResult.analysis.id, clusterId: input.clusterId, ...(input.afterSemanticIdentity ? { semanticIdentity: { gt: input.afterSemanticIdentity } } : {}) },
      orderBy: [{ semanticIdentity: "asc" }, { assertionId: "asc" }],
      take: limit + 1
    });
    rows.forEach((row) => assertRowScope(scope, row));
    const hasMore = rows.length > limit;
    const members = rows.slice(0, limit).map((row) => metricFromRow(scope, row));
    return { availability: "READY", analysis: analysisResult.analysis, members, ...(hasMore && members.at(-1) ? { nextAfterSemanticIdentity: members.at(-1)!.semanticIdentity } : {}) };
  }

  private async loadReadyAnalysis(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, requestedVersion = defaultGraphAnalysisVersion): Promise<{ availability: GraphAnalysisAvailability; analysis?: GraphAnalysisReference; row?: any; partialReasons: ThreeAPartialReason[] }> {
    assertManifestScope(scope, manifest);
    assertAnalysisVersion(requestedVersion);
    const row = await this.prisma.knowledgeGraphAnalysis.findFirst({
      where: { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id, analysisVersion: requestedVersion, status: "READY" },
      orderBy: [{ publishedAt: "desc" }, { dbId: "asc" }],
      take: 1
    });
    if (!row) return { availability: "UNAVAILABLE", partialReasons: [] };
    assertRowScope(scope, row);
    if (row.analysisVersion !== requestedVersion) return { availability: "VERSION_MISMATCH", partialReasons: [] };
    if (row.sourceContentDigest !== manifest.contentDigest || row.relationshipVersion !== manifest.relationshipVersion) return { availability: "STALE", partialReasons: uniquePartialReasons(arrayOfStrings(row.partialReasons) as ThreeAPartialReason[]) };
    return { availability: "READY", analysis: analysisFromRow(row), row, partialReasons: uniquePartialReasons(arrayOfStrings(row.partialReasons) as ThreeAPartialReason[]) };
  }
}

function emptyOverview(availability: GraphAnalysisAvailability): OverviewRepositoryResult {
  return { availability, nodes: [], edges: [], partialReasons: [] };
}

function metricPublicationData(scope: ArchitectureScopeRef, analysisId: string, metric: GraphNodeMetricPublication) {
  return { ...scope, analysisId, assertionId: metric.assertionId, semanticIdentity: metric.semanticIdentity, layer: metric.layer, acceptedAssetType: metric.acceptedAssetType, clusterId: metric.clusterId, degree: nonNegative(metric.degree, "GRAPH_ANALYSIS_INVALID_METRIC"), criticality: finiteNonNegative(metric.criticality, "GRAPH_ANALYSIS_INVALID_METRIC"), isBridge: metric.bridge, positionX: finite(metric.positionSeed.x, "GRAPH_ANALYSIS_INVALID_METRIC"), positionY: finite(metric.positionSeed.y, "GRAPH_ANALYSIS_INVALID_METRIC"), inboundImpactWeight: finiteNonNegative(metric.inboundImpactWeight, "GRAPH_ANALYSIS_INVALID_METRIC"), outboundImpactWeight: finiteNonNegative(metric.outboundImpactWeight, "GRAPH_ANALYSIS_INVALID_METRIC"), contentDigest: metric.contentDigest };
}

function metricPublicationUpdate(metric: GraphNodeMetricPublication) {
  const { applicationServiceId: _applicationServiceId, scopePath: _scopePath, analysisId: _analysisId, assertionId: _assertionId, ...update } = metricPublicationData({ applicationServiceId: "", scopePath: "" }, "", metric);
  return update;
}

function analysisFromRow(row: any): GraphAnalysisReference {
  return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, id: row.dbId, generationId: row.generationId, baselineId: row.baselineId, projectionManifestId: row.projectionManifestId, analysisVersion: row.analysisVersion, policyVersion: row.policyVersion, sourceContentDigest: row.sourceContentDigest, relationshipVersion: row.relationshipVersion, contentDigest: row.contentDigest };
}

function clusterSummaryNode(scope: ArchitectureScopeRef, row: any): GraphSummaryNode {
  return { ...scope, id: row.clusterId, kind: "cluster", label: row.label, ...(layerOf(row.layer) ? { layer: layerOf(row.layer) } : {}), clusterId: row.clusterId, memberCount: row.memberCount, degree: row.degree, criticality: row.criticality, positionSeed: { x: row.positionX, y: row.positionY } };
}

function metricFromRow(scope: ArchitectureScopeRef, row: any): GraphNodeMetric {
  const layer = layerOf(row.layer);
  if (!layer) throw new Error("PROJECTION_INVALID_LAYER");
  return { ...scope, assertionId: row.assertionId, semanticIdentity: row.semanticIdentity, layer, ...(row.acceptedAssetType ? { acceptedAssetType: row.acceptedAssetType } : {}), ...(row.clusterId ? { clusterId: row.clusterId } : {}), degree: row.degree, criticality: row.criticality, bridge: row.isBridge, positionSeed: { x: row.positionX, y: row.positionY }, inboundImpactWeight: row.inboundImpactWeight, outboundImpactWeight: row.outboundImpactWeight, contentDigest: row.contentDigest };
}

function edgeFromRow(row: any): KnowledgeProjectionEdge {
  return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, generationId: row.generationId, baselineId: row.baselineId, relationshipIdentity: row.relationshipIdentity, ...(row.relationshipAssertionId ? { relationshipAssertionId: row.relationshipAssertionId } : {}), ...(row.relationshipEventId ? { relationshipEventId: row.relationshipEventId } : {}), sourceAssertionId: row.sourceAssertionId, targetAssertionId: row.targetAssertionId, sourceSemanticIdentity: row.sourceSemanticIdentity, targetSemanticIdentity: row.targetSemanticIdentity, relationCode: row.relationCode, confidence: row.confidence, relationshipVersion: row.relationshipVersion, contentDigest: row.contentDigest };
}

function summaryEdgesFromAnalysis(scope: ArchitectureScopeRef, value: unknown, relationTypes?: readonly string[]): GraphSummaryEdge[] {
  const relationFilter = relationTypes?.length ? new Set(uniqueStrings(relationTypes)) : undefined;
  return arrayOfRecords(value).map((edge) => {
    if ((edge.applicationServiceId !== undefined && edge.applicationServiceId !== scope.applicationServiceId) || (edge.scopePath !== undefined && edge.scopePath !== scope.scopePath)) throw new Error("PROJECTION_SCOPE_MISMATCH");
    const sourceId = typeof edge.sourceId === "string" ? edge.sourceId : edge.sourceClusterId;
    const targetId = typeof edge.targetId === "string" ? edge.targetId : edge.targetClusterId;
    if (typeof edge.id !== "string" || typeof sourceId !== "string" || typeof targetId !== "string" || typeof edge.relationCode !== "string" || typeof edge.confidence !== "number" || typeof edge.bridge !== "boolean") throw new Error("PROJECTION_INVALID_SUMMARY_EDGE");
    return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id: edge.id, sourceId, targetId, relationCode: edge.relationCode, confidence: edge.confidence, bridge: edge.bridge };
  }).filter((edge) => !relationFilter || relationFilter.has(edge.relationCode));
}

function assertManifestScope(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2): void {
  if (manifest.applicationServiceId !== scope.applicationServiceId || manifest.scopePath !== scope.scopePath) throw new Error("PROJECTION_SCOPE_MISMATCH");
}

function assertAnalysisScope(scope: ArchitectureScopeRef, analysis: GraphAnalysisReference): void {
  if (analysis.applicationServiceId !== scope.applicationServiceId || analysis.scopePath !== scope.scopePath) throw new Error("PROJECTION_SCOPE_MISMATCH");
}

function assertRowScope(scope: ArchitectureScopeRef, row: { applicationServiceId: string; scopePath: string }): void {
  if (row.applicationServiceId !== scope.applicationServiceId || row.scopePath !== scope.scopePath) throw new Error("PROJECTION_SCOPE_MISMATCH");
}

function assertSummaryEdges(scope: ArchitectureScopeRef, edges: readonly GraphSummaryEdge[]): void {
  for (const edge of edges) if (edge.applicationServiceId !== scope.applicationServiceId || edge.scopePath !== scope.scopePath) throw new Error("PROJECTION_SCOPE_MISMATCH");
}

function assertAnalysisVersion(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)) throw new Error("GRAPH_ANALYSIS_VERSION_INVALID");
}

function bounded(value: number, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("GRAPH_ANALYSIS_BUDGET_INVALID");
  return value;
}

function assertCount(value: number, maximum: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error(code);
}

function nonNegative(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
  return value;
}

function finiteNonNegative(value: number, code: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(code);
  return value;
}

function finite(value: number, code: string): number {
  if (!Number.isFinite(value)) throw new Error(code);
  return value;
}

function layerOf(value: unknown): ArchitectureLayer | undefined {
  return value === "BIZ" || value === "SYS" || value === "TECH" ? value : undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function uniquePartialReasons(values: readonly ThreeAPartialReason[]): ThreeAPartialReason[] {
  return [...new Set(values)].sort() as ThreeAPartialReason[];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
