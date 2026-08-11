import { Prisma, PrismaClient } from "@prisma/client";
import { contentDigest, projectionBuildKey, type ArchitectureScopeRef, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionBuildJob, type ProjectionManifestV2 } from "@specforge/core";

export interface ProjectionEndpoint {
  semanticIdentity?: string;
  assertionId?: string;
  assetType?: string;
  assetId?: string;
}

export interface ProjectionSourceAssertion {
  id: string;
  semanticIdentity: string;
  layer: "BIZ" | "SYS" | "TECH";
  sortKey: string;
  acceptedAssetType?: string;
  acceptedAssetId?: string;
  contentDigest: string;
}

export interface ProjectionSourceRelationship {
  relationshipIdentity: string;
  relationshipAssertionId?: string;
  relationshipEventId?: string;
  source: ProjectionEndpoint;
  target: ProjectionEndpoint;
  relationCode: string;
  confidence: number;
  relationshipVersion: string;
}

export interface ProjectionSourceBatch {
  assertions: ProjectionSourceAssertion[];
  relationshipAssertions?: ProjectionSourceAssertion[];
  relationships: ProjectionSourceRelationship[];
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  checkpoint: { assertionSortKey?: string; relationshipVersion?: string };
  complete: boolean;
}

export interface MaterializedProjectionBatch {
  nodes: KnowledgeProjectionNode[];
  edges: KnowledgeProjectionEdge[];
  checkpoint: { assertionSortKey?: string; relationshipVersion?: string };
}

export interface ProjectionPublication {
  sourceRevisionIds: string[];
  relationshipVersion: string;
  query: Record<string, unknown>;
  inputDigest: string;
  contentDigest: string;
  nodeCount: number;
  edgeCount: number;
}

export interface GraphAnalysisCluster {
  clusterId: string;
  label: string;
  layer?: "BIZ" | "SYS" | "TECH";
  memberCount: number;
  degree: number;
  criticality: number;
  positionX: number;
  positionY: number;
  contentDigest: string;
}

export interface GraphAnalysisNodeMetric {
  assertionId: string;
  semanticIdentity: string;
  layer: "BIZ" | "SYS" | "TECH";
  acceptedAssetType?: string;
  clusterId?: string;
  degree: number;
  criticality: number;
  isBridge: boolean;
  positionX: number;
  positionY: number;
  inboundImpactWeight: number;
  outboundImpactWeight: number;
  contentDigest: string;
}

export interface GraphAnalysisSummaryEdge {
  id: string;
  sourceClusterId: string;
  targetClusterId: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  sourceSemanticIdentity: string;
  targetSemanticIdentity: string;
  relationCode: string;
  confidence: number;
  bridge: boolean;
  contentDigest: string;
}

export interface GraphAnalysisPublication {
  scope: ArchitectureScopeRef;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  analysisVersion: string;
  policyVersion: string;
  relationshipVersion: string;
  sourceContentDigest: string;
  contentDigest: string;
  clusters: readonly GraphAnalysisCluster[];
  nodeMetrics: readonly GraphAnalysisNodeMetric[];
  summaryEdges: readonly GraphAnalysisSummaryEdge[];
  partialReasons: readonly string[];
}

export interface GraphAnalysisPublicationResult {
  status: "PUBLISHED" | "UNAVAILABLE";
  analysisId?: string;
  idempotent: boolean;
  code?: string;
}

export interface PublishedProjectionSnapshot {
  nodes: KnowledgeProjectionNode[];
  edges: KnowledgeProjectionEdge[];
}

export interface ProjectionBuildHealth {
  status: "ok" | "degraded" | "unavailable";
  code: string;
  queued: number;
  building: number;
  failed: number;
  oldestQueuedAgeSeconds: number | null;
  lastPublishedAt: string | null;
}

export interface ProjectionBuildRepository {
  claim(owner: string, now: Date, leaseExpiresAt: Date): Promise<ProjectionBuildJob | null>;
  loadBatch(job: ProjectionBuildJob, limit: number): Promise<ProjectionSourceBatch>;
  writeBatch(job: ProjectionBuildJob, owner: string, batch: MaterializedProjectionBatch): Promise<boolean>;
  publish(job: ProjectionBuildJob, owner: string, result: ProjectionPublication): Promise<ProjectionManifestV2>;
  fail(job: ProjectionBuildJob, owner: string, code: string, diagnosticRef: string): Promise<boolean>;
  health(scope: ArchitectureScopeRef, now: Date): Promise<ProjectionBuildHealth>;
}

export interface GraphAnalysisPublicationRepository {
  loadPublishedProjection(job: ProjectionBuildJob, manifest: ProjectionManifestV2): Promise<PublishedProjectionSnapshot>;
  publishGraphAnalysis(job: ProjectionBuildJob, manifest: ProjectionManifestV2, publication: GraphAnalysisPublication): Promise<GraphAnalysisPublicationResult>;
  markGraphAnalysisUnavailable(job: ProjectionBuildJob, manifest: ProjectionManifestV2, analysisVersion: string, code: string): Promise<GraphAnalysisPublicationResult>;
}

type SqlBuildRow = {
  applicationServiceId: string;
  scopePath: string;
  id: string;
  buildKey: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
  status: string;
  attempt: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  checkpoint: Prisma.JsonValue;
  nodeCount: number;
  edgeCount: number;
  errorCode: string | null;
  diagnosticRef: string | null;
};

export class PrismaProjectionBuildRepository implements ProjectionBuildRepository, GraphAnalysisPublicationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(owner: string, now: Date, leaseExpiresAt: Date): Promise<ProjectionBuildJob | null> {
    const rows = await this.prisma.$queryRawUnsafe<SqlBuildRow[]>(CLAIM_SQL, now, owner, leaseExpiresAt);
    return rows[0] ? toBuildJob(rows[0]) : null;
  }

  async loadBatch(job: ProjectionBuildJob, limit: number): Promise<ProjectionSourceBatch> {
    const baseline = await this.prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.baselineId } } });
    if (!baseline || (baseline.status !== "PUBLISHED" && baseline.status !== "SUPERSEDED") || !baseline.publishedAt) throw new Error("BASELINE_NOT_OFFICIAL");
    const manifest = baseline.manifest as Record<string, unknown>;
    const sourceRevisionIds = stringArray(manifest.sourceRevisionIds);
    const relationshipVersion = stringValue(manifest.relationshipVersion) ?? "unknown";
    const checkpoint = job.checkpoint ?? {};
    const cursor = checkpoint.assertionSortKey ? parseSortKey(checkpoint.assertionSortKey) : undefined;
    const rows = await this.prisma.knowledgeAssertion.findMany({
      where: {
        applicationServiceId: job.applicationServiceId,
        scopePath: job.scopePath,
        status: "ACCEPTED",
        AND: [
          { OR: [{ changeSetId: baseline.changeSetId }, { id: { in: sourceRevisionIds } }] },
          ...(cursor ? [{ OR: [{ layer: { gt: cursor.layer } }, { layer: cursor.layer, semanticIdentity: { gt: cursor.semanticIdentity } }, { layer: cursor.layer, semanticIdentity: cursor.semanticIdentity, id: { gt: cursor.id } }] }] : [])
        ]
      },
      orderBy: [{ layer: "asc" }, { semanticIdentity: "asc" }, { id: "asc" }],
      take: limit + 1
    });
    const complete = rows.length <= limit;
    const selected = rows.slice(0, limit);
    const assertions = selected.map((row) => toSourceAssertion(row));
    const relationships = checkpoint.assertionSortKey ? [] : await loadRelationships(this.prisma, job, relationshipVersion, baseline.changeSetId, sourceRevisionIds);
    const relationshipAssertions = checkpoint.assertionSortKey ? [] : await loadRelationshipEndpoints(this.prisma, job, relationships, baseline.changeSetId, sourceRevisionIds);
    const next = assertions.at(-1)?.sortKey;
    return { assertions, relationshipAssertions, relationships, sourceRevisionIds, relationshipVersion, query: {}, checkpoint: { ...(next ? { assertionSortKey: next } : {}), relationshipVersion }, complete, };
  }

  async writeBatch(job: ProjectionBuildJob, owner: string, batch: MaterializedProjectionBatch): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.projectionBuildJob.updateMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id, status: "BUILDING", leaseOwner: owner, leaseExpiresAt: { gt: new Date() } }, data: { checkpoint: batch.checkpoint as Prisma.InputJsonValue, nodeCount: { increment: batch.nodes.length }, edgeCount: { increment: batch.edges.length } } });
      if (updated.count !== 1) return false;
      for (const node of batch.nodes) {
        await transaction.knowledgeProjectionNode.upsert({ where: { applicationServiceId_scopePath_generationId_assertionId: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: node.generationId, assertionId: node.assertionId } }, create: nodeData(node), update: nodeData(node) });
      }
      for (const edge of batch.edges) {
        await transaction.knowledgeProjectionEdge.upsert({ where: { applicationServiceId_scopePath_generationId_relationshipIdentity: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: edge.generationId, relationshipIdentity: edge.relationshipIdentity } }, create: edgeData(edge), update: edgeData(edge) });
      }
      return true;
    });
  }

  async publish(job: ProjectionBuildJob, owner: string, result: ProjectionPublication): Promise<ProjectionManifestV2> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.projectionBuildJob.findFirst({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id, status: "BUILDING", leaseOwner: owner, leaseExpiresAt: { gt: new Date() } } });
      if (!locked) throw new Error("PROJECTION_BUILD_LEASE_LOST");
      const [nodeCount, edgeCount] = await Promise.all([
        transaction.knowledgeProjectionNode.count({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId } }),
        transaction.knowledgeProjectionEdge.count({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId } })
      ]);
      if (nodeCount !== result.nodeCount || edgeCount !== result.edgeCount) throw new Error("PROJECTION_COUNT_MISMATCH");
      const dangling = await transaction.$queryRawUnsafe<Array<{ count: bigint }>>(ENDPOINT_CLOSURE_SQL, job.applicationServiceId, job.scopePath, job.generationId);
      if (Number(dangling[0]?.count ?? 0) > 0) throw new Error("PROJECTION_ENDPOINT_CLOSURE_FAILED");
      const publishedAt = new Date();
      const manifest = await transaction.projectionManifest.create({ data: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: `projection-manifest:${job.generationId}`, baselineId: job.baselineId, projectionType: "3A", projectionSchemaVersion: job.projectionSchemaVersion, sourceRevisionIds: result.sourceRevisionIds, relationshipVersion: result.relationshipVersion, query: result.query as Prisma.InputJsonValue, digest: result.contentDigest, generatedAt: publishedAt, profileId: job.profileId, profileVersion: job.profileVersion, generationId: job.generationId, inputDigest: result.inputDigest, contentDigest: result.contentDigest, nodeCount, edgeCount, publishedAt } });
      await transaction.projectionBuildJob.update({ where: { applicationServiceId_scopePath_id: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id } }, data: { status: "READY", nodeCount, edgeCount, completedAt: publishedAt, leaseOwner: null, leaseExpiresAt: null } });
      return manifestFromRow(manifest);
    });
  }

  async loadPublishedProjection(job: ProjectionBuildJob, manifest: ProjectionManifestV2): Promise<PublishedProjectionSnapshot> {
    assertManifestMatchesJob(job, manifest);
    const where = { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, baselineId: job.baselineId };
    const [nodes, edges] = await Promise.all([
      this.prisma.knowledgeProjectionNode.findMany({ where, orderBy: [{ layer: "asc" }, { semanticIdentity: "asc" }, { assertionId: "asc" }] }),
      this.prisma.knowledgeProjectionEdge.findMany({ where, orderBy: [{ sourceAssertionId: "asc" }, { targetAssertionId: "asc" }, { relationCode: "asc" }, { relationshipIdentity: "asc" }] })
    ]);
    return { nodes: nodes.map(projectionNodeFromRow), edges: edges.map(projectionEdgeFromRow) };
  }

  async publishGraphAnalysis(job: ProjectionBuildJob, manifest: ProjectionManifestV2, publication: GraphAnalysisPublication): Promise<GraphAnalysisPublicationResult> {
    validateGraphAnalysisPublication(job, manifest, publication);
    return this.prisma.$transaction(async (transaction) => {
      const graph = graphClient(transaction);
      const existing = await graph.knowledgeGraphAnalysis.findUnique({ where: { applicationServiceId_scopePath_generationId_projectionManifestId_analysisVersion: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, projectionManifestId: manifest.id, analysisVersion: publication.analysisVersion } } });
      if (existing?.status === "PUBLISHED" && existing.contentDigest === publication.contentDigest) return { status: "PUBLISHED", analysisId: existing.dbId, idempotent: true };
      const publishedAt = new Date();
      const analysis = await graph.knowledgeGraphAnalysis.upsert({
        where: { applicationServiceId_scopePath_generationId_projectionManifestId_analysisVersion: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, projectionManifestId: manifest.id, analysisVersion: publication.analysisVersion } },
        create: graphAnalysisData(job, publication, "PUBLISHED", publishedAt),
        update: graphAnalysisData(job, publication, "PUBLISHED", publishedAt)
      });
      await graph.knowledgeGraphCluster.deleteMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, analysisId: analysis.dbId } });
      await graph.knowledgeGraphNodeMetric.deleteMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, analysisId: analysis.dbId } });
      if (publication.clusters.length) await graph.knowledgeGraphCluster.createMany({ data: publication.clusters.map((cluster) => ({ ...cluster, analysisId: analysis.dbId, applicationServiceId: job.applicationServiceId, scopePath: job.scopePath })) });
      if (publication.nodeMetrics.length) await graph.knowledgeGraphNodeMetric.createMany({ data: publication.nodeMetrics.map((metric) => ({ ...metric, acceptedAssetType: metric.acceptedAssetType ?? null, clusterId: metric.clusterId ?? null, analysisId: analysis.dbId, applicationServiceId: job.applicationServiceId, scopePath: job.scopePath })) });
      return { status: "PUBLISHED", analysisId: analysis.dbId, idempotent: false };
    });
  }

  async markGraphAnalysisUnavailable(job: ProjectionBuildJob, manifest: ProjectionManifestV2, analysisVersion: string, code: string): Promise<GraphAnalysisPublicationResult> {
    assertManifestMatchesJob(job, manifest);
    const unavailable = unavailableGraphAnalysisPublication(job, manifest, analysisVersion, code);
    return this.prisma.$transaction(async (transaction) => {
      const graph = graphClient(transaction);
      const analysis = await graph.knowledgeGraphAnalysis.upsert({
        where: { applicationServiceId_scopePath_generationId_projectionManifestId_analysisVersion: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, generationId: job.generationId, projectionManifestId: manifest.id, analysisVersion } },
        create: graphAnalysisData(job, unavailable, "UNAVAILABLE", undefined),
        update: graphAnalysisData(job, unavailable, "UNAVAILABLE", undefined)
      });
      await graph.knowledgeGraphCluster.deleteMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, analysisId: analysis.dbId } });
      await graph.knowledgeGraphNodeMetric.deleteMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, analysisId: analysis.dbId } });
      return { status: "UNAVAILABLE", analysisId: analysis.dbId, idempotent: false, code };
    });
  }

  async fail(job: ProjectionBuildJob, owner: string, code: string, diagnosticRef: string): Promise<boolean> {
    const updated = await this.prisma.projectionBuildJob.updateMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id, status: "BUILDING", leaseOwner: owner }, data: { status: "FAILED", errorCode: code, diagnosticRef, leaseOwner: null, leaseExpiresAt: null } });
    return updated.count === 1;
  }

  async health(scope: ArchitectureScopeRef, now: Date): Promise<ProjectionBuildHealth> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ queued: number; building: number; failed: number; oldest_queued_age_seconds: number | null; last_published_at: Date | null }>>(HEALTH_SQL, scope.applicationServiceId, scope.scopePath, now);
    const row = rows[0];
    if (!row) throw new Error("PROJECTION_HEALTH_EMPTY");
    const degraded = Number(row.failed) > 0;
    return { status: degraded ? "degraded" : "ok", code: degraded ? "PROJECTION_BUILDS_FAILED" : "OK", queued: Number(row.queued), building: Number(row.building), failed: Number(row.failed), oldestQueuedAgeSeconds: row.oldest_queued_age_seconds === null ? null : Math.max(0, Math.floor(Number(row.oldest_queued_age_seconds))), lastPublishedAt: row.last_published_at?.toISOString() ?? null };
  }
}

export function toSourceAssertion(row: { id: string; semanticIdentity: string; layer: string; factType?: string; value?: unknown; confidence?: number; evidenceRefs?: unknown }): ProjectionSourceAssertion {
  if (!["BIZ", "SYS", "TECH"].includes(row.layer)) throw new Error("PROJECTION_LAYER_INVALID");
  const canonical = typeof row.value === "object" && row.value !== null ? row.value as Record<string, unknown> : {};
  const acceptedAsset = typeof canonical.acceptedAsset === "object" && canonical.acceptedAsset !== null ? canonical.acceptedAsset as Record<string, unknown> : {};
  const acceptedAssetType = stringValue(acceptedAsset.type);
  const acceptedAssetId = stringValue(acceptedAsset.id);
  const sortKey = `${row.layer}|${row.semanticIdentity}|${row.id}`;
  return { id: row.id, semanticIdentity: row.semanticIdentity, layer: row.layer as "BIZ" | "SYS" | "TECH", sortKey, ...(acceptedAssetType ? { acceptedAssetType } : {}), ...(acceptedAssetId ? { acceptedAssetId } : {}), contentDigest: contentDigest({ id: row.id, semanticIdentity: row.semanticIdentity, layer: row.layer, factType: row.factType, value: row.value, confidence: row.confidence, evidenceRefs: row.evidenceRefs }) };
}

async function loadRelationships(prisma: PrismaClient, job: ProjectionBuildJob, relationshipVersion: string, baselineChangeSetId: string, sourceRevisionIds: string[]): Promise<ProjectionSourceRelationship[]> {
  const assertions = await prisma.knowledgeAssertion.findMany({ where: { ...scopeWhere(job), status: "ACCEPTED", factType: { in: ["typed-relationship", "relationship"] }, AND: [eligibleAssertionWhere(baselineChangeSetId, sourceRevisionIds)] }, orderBy: [{ semanticIdentity: "asc" }, { revision: "asc" }] });
  const result: ProjectionSourceRelationship[] = [];
  for (const assertion of assertions) {
    const value = assertion.value as Record<string, unknown>;
    const canonical = value.canonicalContent && typeof value.canonicalContent === "object" && !Array.isArray(value.canonicalContent) ? value.canonicalContent as Record<string, unknown> : value;
    const source = endpoint(canonical.source);
    const target = endpoint(canonical.target);
    const relationCode = stringValue(canonical.relationType) ?? stringValue(canonical.relationCode);
    if (!source || !target || !relationCode) continue;
    result.push({ relationshipIdentity: assertion.semanticIdentity, relationshipAssertionId: assertion.id, source, target, relationCode, confidence: assertion.confidence, relationshipVersion });
  }
  return result;
}

async function loadRelationshipEndpoints(prisma: PrismaClient, job: ProjectionBuildJob, relationships: ProjectionSourceRelationship[], baselineChangeSetId: string, sourceRevisionIds: string[]): Promise<ProjectionSourceAssertion[]> {
  const selectors = relationships.flatMap((relationship) => [relationship.source, relationship.target]).map((endpoint) => endpoint.assertionId ? { id: endpoint.assertionId } : endpoint.semanticIdentity ? { semanticIdentity: endpoint.semanticIdentity } : endpoint.assetType && endpoint.assetId ? { value: { path: ["acceptedAsset", "type"], equals: endpoint.assetType }, AND: [{ value: { path: ["acceptedAsset", "id"], equals: endpoint.assetId } }] } : undefined).filter((selector): selector is NonNullable<typeof selector> => Boolean(selector));
  if (!selectors.length) return [];
  const rows = await prisma.knowledgeAssertion.findMany({ where: { ...scopeWhere(job), status: "ACCEPTED", AND: [eligibleAssertionWhere(baselineChangeSetId, sourceRevisionIds), { OR: selectors }] } });
  return rows.map(toSourceAssertion);
}

function scopeWhere(job: ProjectionBuildJob) { return { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath }; }
function eligibleAssertionWhere(changeSetId: string, sourceRevisionIds: string[]) { return { OR: [{ changeSetId }, { id: { in: sourceRevisionIds } }] }; }

function endpoint(value: unknown): ProjectionEndpoint | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const semanticIdentity = stringValue(record.semanticIdentity);
  const assertionId = stringValue(record.assertionId);
  const assetType = stringValue(record.assetType) ?? stringValue(record.type);
  const assetId = stringValue(record.assetId) ?? stringValue(record.id);
  if (!semanticIdentity && !assertionId && !(assetType && assetId)) return undefined;
  return { ...(semanticIdentity ? { semanticIdentity } : {}), ...(assertionId ? { assertionId } : {}), ...(assetType ? { assetType } : {}), ...(assetId ? { assetId } : {}) };
}

function parseSortKey(value: string): { layer: string; semanticIdentity: string; id: string } {
  const [layer, semanticIdentity, ...idParts] = value.split("|");
  if (!layer || !semanticIdentity || idParts.length === 0) throw new Error("PROJECTION_CHECKPOINT_INVALID");
  return { layer, semanticIdentity, id: idParts.join("|") };
}

function nodeData(node: KnowledgeProjectionNode) { return { generationId: node.generationId, baselineId: node.baselineId, assertionId: node.assertionId, semanticIdentity: node.semanticIdentity, layer: node.layer, sortKey: node.sortKey, acceptedAssetType: node.acceptedAssetType ?? null, acceptedAssetId: node.acceptedAssetId ?? null, contentDigest: node.contentDigest, applicationServiceId: node.applicationServiceId, scopePath: node.scopePath }; }
function edgeData(edge: KnowledgeProjectionEdge) { return { generationId: edge.generationId, baselineId: edge.baselineId, relationshipIdentity: edge.relationshipIdentity, relationshipAssertionId: edge.relationshipAssertionId ?? null, relationshipEventId: edge.relationshipEventId ?? null, sourceAssertionId: edge.sourceAssertionId, targetAssertionId: edge.targetAssertionId, sourceSemanticIdentity: edge.sourceSemanticIdentity, targetSemanticIdentity: edge.targetSemanticIdentity, relationCode: edge.relationCode, confidence: edge.confidence, relationshipVersion: edge.relationshipVersion, contentDigest: edge.contentDigest, applicationServiceId: edge.applicationServiceId, scopePath: edge.scopePath }; }
function projectionNodeFromRow(row: any): KnowledgeProjectionNode { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, generationId: row.generationId, baselineId: row.baselineId, assertionId: row.assertionId, semanticIdentity: row.semanticIdentity, layer: row.layer as KnowledgeProjectionNode["layer"], sortKey: row.sortKey, ...(row.acceptedAssetType ? { acceptedAssetType: row.acceptedAssetType } : {}), ...(row.acceptedAssetId ? { acceptedAssetId: row.acceptedAssetId } : {}), contentDigest: row.contentDigest }; }
function projectionEdgeFromRow(row: any): KnowledgeProjectionEdge { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, generationId: row.generationId, baselineId: row.baselineId, relationshipIdentity: row.relationshipIdentity, ...(row.relationshipAssertionId ? { relationshipAssertionId: row.relationshipAssertionId } : {}), ...(row.relationshipEventId ? { relationshipEventId: row.relationshipEventId } : {}), sourceAssertionId: row.sourceAssertionId, targetAssertionId: row.targetAssertionId, sourceSemanticIdentity: row.sourceSemanticIdentity, targetSemanticIdentity: row.targetSemanticIdentity, relationCode: row.relationCode, confidence: row.confidence, relationshipVersion: row.relationshipVersion, contentDigest: row.contentDigest }; }
function toBuildJob(row: SqlBuildRow): ProjectionBuildJob { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, id: row.id, buildKey: row.buildKey, generationId: row.generationId, baselineId: row.baselineId, profileId: row.profileId, profileVersion: row.profileVersion, projectionSchemaVersion: "3a.v2", status: row.status as ProjectionBuildJob["status"], attempt: row.attempt, ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}), ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}), checkpoint: jsonObject(row.checkpoint), nodeCount: row.nodeCount, edgeCount: row.edgeCount, ...(row.errorCode ? { errorCode: row.errorCode } : {}), ...(row.diagnosticRef ? { diagnosticRef: row.diagnosticRef } : {}) }; }
function manifestFromRow(row: any): ProjectionManifestV2 { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, id: row.id, baselineId: row.baselineId, generationId: row.generationId!, profileId: row.profileId!, profileVersion: row.profileVersion!, projectionSchemaVersion: "3a.v2", sourceRevisionIds: row.sourceRevisionIds as string[], relationshipVersion: row.relationshipVersion, query: row.query as Record<string, unknown>, inputDigest: row.inputDigest!, contentDigest: row.contentDigest!, nodeCount: row.nodeCount!, edgeCount: row.edgeCount!, publishedAt: row.publishedAt!.toISOString() }; }
function jsonObject(value: Prisma.JsonValue): { assertionSortKey?: string; relationshipVersion?: string } { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as { assertionSortKey?: string; relationshipVersion?: string } : {}; }
function stringArray(value: unknown): string[] { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : []; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }

export function validateGraphAnalysisPublication(job: ProjectionBuildJob, manifest: ProjectionManifestV2, publication: GraphAnalysisPublication): void {
  assertManifestMatchesJob(job, manifest);
  const matches = publication.scope.applicationServiceId === job.applicationServiceId
    && publication.scope.scopePath === job.scopePath
    && publication.generationId === job.generationId
    && publication.baselineId === job.baselineId
    && publication.projectionManifestId === manifest.id;
  if (!matches || !publication.analysisVersion || !publication.contentDigest) throw new Error("GRAPH_ANALYSIS_SCOPE_MISMATCH");
}

function assertManifestMatchesJob(job: ProjectionBuildJob, manifest: ProjectionManifestV2): void {
  const matches = manifest.applicationServiceId === job.applicationServiceId
    && manifest.scopePath === job.scopePath
    && manifest.generationId === job.generationId
    && manifest.baselineId === job.baselineId;
  if (!matches) throw new Error("GRAPH_ANALYSIS_SCOPE_MISMATCH");
}

function unavailableGraphAnalysisPublication(job: ProjectionBuildJob, manifest: ProjectionManifestV2, analysisVersion: string, code: string): GraphAnalysisPublication {
  const scope = { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath };
  const sourceContentDigest = manifest.contentDigest;
  const partialReasons = [code];
  const base = { scope, generationId: job.generationId, baselineId: job.baselineId, projectionManifestId: manifest.id, analysisVersion, policyVersion: "impact-v1", relationshipVersion: manifest.relationshipVersion, sourceContentDigest, clusters: [], nodeMetrics: [], summaryEdges: [], partialReasons };
  return { ...base, contentDigest: contentDigest(base) };
}

function graphAnalysisData(job: ProjectionBuildJob, publication: GraphAnalysisPublication, status: "PUBLISHED" | "UNAVAILABLE", publishedAt: Date | undefined) {
  return {
    applicationServiceId: job.applicationServiceId,
    scopePath: job.scopePath,
    generationId: publication.generationId,
    baselineId: publication.baselineId,
    projectionManifestId: publication.projectionManifestId,
    analysisVersion: publication.analysisVersion,
    policyVersion: publication.policyVersion,
    status,
    sourceContentDigest: publication.sourceContentDigest,
    relationshipVersion: publication.relationshipVersion,
    contentDigest: publication.contentDigest,
    summaryEdges: publication.summaryEdges as unknown as Prisma.InputJsonValue,
    partialReasons: publication.partialReasons as Prisma.InputJsonValue,
    clusterCount: publication.clusters.length,
    nodeMetricCount: publication.nodeMetrics.length,
    bridgeEdgeCount: publication.summaryEdges.filter((edge) => edge.bridge).length,
    publishedAt: publishedAt ?? null
  };
}

type GraphAnalysisPrismaClient = {
  knowledgeGraphAnalysis: {
    findUnique(args: unknown): Promise<{ dbId: string; status: string; contentDigest: string } | null>;
    upsert(args: unknown): Promise<{ dbId: string }>;
  };
  knowledgeGraphCluster: { deleteMany(args: unknown): Promise<unknown>; createMany(args: unknown): Promise<unknown>; };
  knowledgeGraphNodeMetric: { deleteMany(args: unknown): Promise<unknown>; createMany(args: unknown): Promise<unknown>; };
};

function graphClient(client: unknown): GraphAnalysisPrismaClient {
  return client as GraphAnalysisPrismaClient;
}

const CLAIM_SQL = `
  WITH candidate AS (
    SELECT "dbId" FROM "ProjectionBuildJob"
    WHERE (status = 'QUEUED' AND "availableAt" <= $1)
       OR (status = 'BUILDING' AND "leaseExpiresAt" <= $1)
    ORDER BY "availableAt" ASC, "createdAt" ASC, "dbId" ASC
    FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE "ProjectionBuildJob" job
  SET status = 'BUILDING', "leaseOwner" = $2, "leaseExpiresAt" = $3, attempt = job.attempt
  FROM candidate WHERE job."dbId" = candidate."dbId"
  RETURNING job."applicationServiceId", job."scopePath", job.id, job."buildKey", job."generationId", job."baselineId", job."profileId", job."profileVersion", job."projectionSchemaVersion", job.status, job.attempt, job."leaseOwner", job."leaseExpiresAt", job.checkpoint, job."nodeCount", job."edgeCount", job."errorCode", job."diagnosticRef";
`;
const ENDPOINT_CLOSURE_SQL = `SELECT COUNT(*)::bigint AS count FROM "KnowledgeProjectionEdge" edge WHERE edge."applicationServiceId" = $1 AND edge."scopePath" = $2 AND edge."generationId" = $3 AND (NOT EXISTS (SELECT 1 FROM "KnowledgeProjectionNode" node WHERE node."applicationServiceId" = edge."applicationServiceId" AND node."scopePath" = edge."scopePath" AND node."generationId" = edge."generationId" AND node."assertionId" = edge."sourceAssertionId") OR NOT EXISTS (SELECT 1 FROM "KnowledgeProjectionNode" node WHERE node."applicationServiceId" = edge."applicationServiceId" AND node."scopePath" = edge."scopePath" AND node."generationId" = edge."generationId" AND node."assertionId" = edge."targetAssertionId"))`;
const HEALTH_SQL = `SELECT COUNT(*) FILTER (WHERE status = 'QUEUED')::integer AS queued, COUNT(*) FILTER (WHERE status = 'BUILDING')::integer AS building, COUNT(*) FILTER (WHERE status = 'FAILED')::integer AS failed, EXTRACT(EPOCH FROM ($3::timestamptz - MIN("createdAt") FILTER (WHERE status = 'QUEUED')))::double precision AS oldest_queued_age_seconds, (SELECT MAX("publishedAt") FROM "ProjectionManifest" WHERE "applicationServiceId" = $1 AND "scopePath" = $2 AND "projectionSchemaVersion" = '3a.v2' AND "publishedAt" IS NOT NULL) AS last_published_at FROM "ProjectionBuildJob" WHERE "applicationServiceId" = $1 AND "scopePath" = $2`;
