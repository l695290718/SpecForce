import { Prisma, PrismaClient } from "@prisma/client";
import { contentDigest, projectionBuildKey, validateArchitectureMapBudget, type ArchitectureLayer, type ArchitectureMapBudget, type ArchitectureMapIdentity, type ArchitectureScopeRef, type ArchitectureUnitFilter, type ArchitectureUnitMappingProjection, type ArchitectureUnitMemberProjection, type ArchitectureUnitProjection, type ArchitectureUnitProjectionPage, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionBuildJob, type ProjectionManifestV2 } from "@specforge/core";
import type { ArchitectureUnitMaterialization } from "./architecture-unit-materializer.js";

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

export interface ArchitectureUnitRepositoryIdentity extends ArchitectureMapIdentity {}

export interface ArchitectureUnitProjectionRepository {
  writeArchitectureUnitBatch(job: ProjectionBuildJob, owner: string, materialization: ArchitectureUnitMaterialization): Promise<boolean>;
  listArchitectureUnits(identity: ArchitectureUnitRepositoryIdentity, filter: ArchitectureUnitFilter, budget: ArchitectureMapBudget): Promise<ArchitectureUnitProjectionPage>;
  listArchitectureUnitMembers(identity: ArchitectureUnitRepositoryIdentity, unitIdentity: string, limit: number): Promise<ArchitectureUnitMemberProjection[]>;
  listArchitectureUnitMappings(identity: ArchitectureUnitRepositoryIdentity, unitIdentities: string[], limit: number): Promise<ArchitectureUnitMappingProjection[]>;
}

export interface ArchitectureUnitScopePredicate {
  applicationServiceId: string;
  scopePath: string;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
}

export function architectureUnitScopePredicate(identity: ArchitectureUnitRepositoryIdentity): ArchitectureUnitScopePredicate {
  return {
    applicationServiceId: identity.applicationServiceId,
    scopePath: identity.scopePath,
    generationId: identity.generationId,
    baselineId: identity.baselineId,
    projectionManifestId: identity.projectionManifestId
  };
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
  renewLease?(job: ProjectionBuildJob, owner: string, leaseExpiresAt: Date): Promise<boolean>;
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

export class PrismaProjectionBuildRepository implements ProjectionBuildRepository, GraphAnalysisPublicationRepository, ArchitectureUnitProjectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(owner: string, now: Date, leaseExpiresAt: Date): Promise<ProjectionBuildJob | null> {
    const rows = await this.prisma.$queryRawUnsafe<SqlBuildRow[]>(CLAIM_SQL, now, owner, leaseExpiresAt);
    return rows[0] ? toBuildJob(rows[0]) : null;
  }

  async renewLease(job: ProjectionBuildJob, owner: string, leaseExpiresAt: Date): Promise<boolean> {
    const updated = await this.prisma.projectionBuildJob.updateMany({
      where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id, status: "BUILDING", leaseOwner: owner },
      data: { leaseExpiresAt }
    });
    if (updated.count !== 1) console.error(`[knowledge-projector] lease renewal rejected id=${job.id} owner=${owner}`);
    return updated.count === 1;
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
      const updated = await transaction.projectionBuildJob.updateMany({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id, status: "BUILDING", leaseOwner: owner }, data: { checkpoint: batch.checkpoint as Prisma.InputJsonValue, nodeCount: { increment: batch.nodes.length }, edgeCount: { increment: batch.edges.length } } });
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

  async writeArchitectureUnitBatch(job: ProjectionBuildJob, owner: string, materialization: ArchitectureUnitMaterialization): Promise<boolean> {
    assertArchitectureMaterializationMatchesJob(job, materialization);
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.projectionBuildJob.updateMany({
        where: {
          applicationServiceId: job.applicationServiceId,
          scopePath: job.scopePath,
          id: job.id,
          status: "BUILDING",
          leaseOwner: owner
        },
        data: { updatedAt: new Date() }
      });
      if (updated.count !== 1) return false;
      await deleteArchitectureUnitRows(transaction, architectureUnitScopePredicate(architectureMaterializationIdentity(materialization)));
      await createArchitectureUnitRows(transaction, materialization);
      return true;
    });
  }

  async listArchitectureUnits(identity: ArchitectureUnitRepositoryIdentity, filter: ArchitectureUnitFilter, budget: ArchitectureMapBudget): Promise<ArchitectureUnitProjectionPage> {
    validateArchitectureMapBudget(budget);
    const predicate = architectureUnitScopePredicate(identity);
    const mappingUnitIdentities = filter.mappingFamilies?.length
      ? await this.prisma.architectureUnitMappingProjection.findMany({ where: { ...predicate, mappingFamily: { in: filter.mappingFamilies } }, select: { sourceUnitIdentity: true, targetUnitIdentity: true } })
      : [];
    const mappedUnitIdentities = [...new Set(mappingUnitIdentities.flatMap((row) => [row.sourceUnitIdentity, row.targetUnitIdentity]))];
    const layers: ArchitectureLayer[] = filter.layers?.length ? [...new Set(filter.layers)] : ["BIZ", "SYS", "TECH"];
    const baseWhere = architectureUnitWhere(predicate, filter, mappedUnitIdentities);
    const counts = await Promise.all((["BIZ", "SYS", "TECH"] as const).map(async (layer) => [layer, await this.prisma.architectureUnitProjection.count({ where: { ...baseWhere, layer } })] as const));
    const totalByLayer = Object.fromEntries(counts) as Record<ArchitectureLayer, number>;
    const rowsByLayer = await Promise.all(layers.map(async (layer) => this.prisma.architectureUnitProjection.findMany({
      where: { ...baseWhere, layer },
      orderBy: [{ parentUnitIdentity: "asc" }, { criticality: "desc" }, { canonicalName: "asc" }, { unitIdentity: "asc" }],
      take: budget.maxUnitsPerLayer + 1
    })));
    const partialReasons = rowsByLayer.some((rows) => rows.length > budget.maxUnitsPerLayer) ? ["UNIT_BUDGET_EXCEEDED" as const, "CONTINUATION_REQUIRED" as const] : [];
    const units = rowsByLayer.flatMap((rows) => rows.slice(0, budget.maxUnitsPerLayer).map(architectureUnitFromRow)).sort(compareArchitectureUnits);
    const unclassifiedCount = await this.prisma.architectureUnitProjection.count({ where: { ...predicate, unclassifiedMemberCount: { gt: 0 } } });
    const partial = partialReasons.length ? { code: "RESULT_PARTIAL" as const, reasons: partialReasons } : undefined;
    return {
      units,
      totalByLayer,
      unclassifiedCount,
      ...(partial ? { partial, nextContinuation: contentDigest({ identity, filter, budget, returned: units.map((unit) => unit.unitIdentity) }) } : {})
    };
  }

  async listArchitectureUnitMembers(identity: ArchitectureUnitRepositoryIdentity, unitIdentity: string, limit: number): Promise<ArchitectureUnitMemberProjection[]> {
    assertUnitIdentityQuery(unitIdentity);
    assertPositiveLimit(limit);
    const rows = await this.prisma.architectureUnitMemberProjection.findMany({
      where: { ...architectureUnitScopePredicate(identity), unitIdentity },
      orderBy: [{ semanticIdentity: "asc" }, { assertionId: "asc" }],
      take: limit
    });
    return rows.map(architectureUnitMemberFromRow);
  }

  async listArchitectureUnitMappings(identity: ArchitectureUnitRepositoryIdentity, unitIdentities: string[], limit: number): Promise<ArchitectureUnitMappingProjection[]> {
    assertPositiveLimit(limit);
    const identities = [...new Set(unitIdentities.filter((value) => value.trim()))];
    if (identities.length === 0) return [];
    if (identities.some((value) => !value.startsWith("unit:"))) throw new Error("ARCHITECTURE_UNIT_IDENTITY_INVALID");
    const rows = await this.prisma.architectureUnitMappingProjection.findMany({
      where: { ...architectureUnitScopePredicate(identity), sourceUnitIdentity: { in: identities }, targetUnitIdentity: { in: identities } },
      orderBy: [{ sourceUnitIdentity: "asc" }, { targetUnitIdentity: "asc" }, { mappingFamily: "asc" }, { mappingIdentity: "asc" }],
      take: limit
    });
    return rows.map(architectureUnitMappingFromRow);
  }

  async publish(job: ProjectionBuildJob, owner: string, result: ProjectionPublication): Promise<ProjectionManifestV2> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.projectionBuildJob.findFirst({ where: { applicationServiceId: job.applicationServiceId, scopePath: job.scopePath, id: job.id, status: "BUILDING", leaseOwner: owner } });
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

function architectureUnitWhere(predicate: ArchitectureUnitScopePredicate, filter: ArchitectureUnitFilter, mappedUnitIdentities: string[]): Record<string, unknown> {
  const where: Record<string, unknown> = { ...predicate };
  if (filter.kinds?.length) where.kind = { in: filter.kinds };
  if (filter.minCriticality !== undefined) where.criticality = { gte: filter.minCriticality };
  if (filter.minCompleteness !== undefined) where.completeness = { gte: filter.minCompleteness };
  if (filter.includeUnclassified === false) where.unclassifiedMemberCount = 0;
  if (filter.mappingFamilies?.length) where.unitIdentity = { in: mappedUnitIdentities };
  if (filter.query?.trim()) {
    where.OR = [
      { unitIdentity: { contains: filter.query.trim(), mode: "insensitive" } },
      { canonicalName: { contains: filter.query.trim(), mode: "insensitive" } }
    ];
  }
  return where;
}

async function deleteArchitectureUnitRows(transaction: any, predicate: ArchitectureUnitScopePredicate): Promise<void> {
  await transaction.architectureUnitMappingProjection.deleteMany({ where: predicate });
  await transaction.architectureUnitMemberProjection.deleteMany({ where: predicate });
  await transaction.architectureUnitProjection.deleteMany({ where: predicate });
}

async function createArchitectureUnitRows(transaction: any, materialization: ArchitectureUnitMaterialization): Promise<void> {
  const predicate = architectureUnitScopePredicate(architectureMaterializationIdentity(materialization));
  if (materialization.units.length) await transaction.architectureUnitProjection.createMany({ data: materialization.units.map((unit) => architectureUnitData(unit, predicate)) });
  if (materialization.members.length) await transaction.architectureUnitMemberProjection.createMany({ data: materialization.members.map((member) => architectureUnitMemberData(member, predicate)) });
  if (materialization.mappings.length) await transaction.architectureUnitMappingProjection.createMany({ data: materialization.mappings.map((mapping) => architectureUnitMappingData(mapping, predicate)) });
}

function assertArchitectureMaterializationMatchesJob(job: ProjectionBuildJob, materialization: ArchitectureUnitMaterialization): void {
  const matches = materialization.architectureScope.applicationServiceId === job.applicationServiceId
    && materialization.architectureScope.scopePath === job.scopePath
    && materialization.generationId === job.generationId
    && materialization.baselineId === job.baselineId
    && materialization.projectionManifestId === `projection-manifest:${job.generationId}`;
  if (!matches) throw new Error("ARCHITECTURE_UNIT_PROJECTION_SCOPE_MISMATCH");
}

function architectureMaterializationIdentity(materialization: ArchitectureUnitMaterialization): ArchitectureUnitRepositoryIdentity {
  return { ...materialization.architectureScope, generationId: materialization.generationId, baselineId: materialization.baselineId, projectionManifestId: materialization.projectionManifestId };
}

function assertUnitIdentityQuery(value: string): void { if (!value.trim() || !value.startsWith("unit:")) throw new Error("ARCHITECTURE_UNIT_IDENTITY_INVALID"); }
function assertPositiveLimit(value: number): void { if (!Number.isInteger(value) || value <= 0) throw new Error("ARCHITECTURE_UNIT_LIMIT_INVALID"); }
function architectureUnitData(unit: ArchitectureUnitProjection, predicate: ArchitectureUnitScopePredicate) { return { ...predicate, unitIdentity: unit.unitIdentity, generationId: unit.generationId, baselineId: unit.baselineId, projectionManifestId: unit.projectionManifestId, layer: unit.layer, kind: unit.kind, parentUnitIdentity: unit.parentUnitIdentity ?? null, canonicalName: unit.canonicalName, localizedName: unit.localizedName ?? Prisma.JsonNull, aliases: unit.aliases as Prisma.InputJsonValue, memberCount: unit.memberCount, criticality: unit.criticality, completeness: unit.completeness, evidenceCount: unit.evidenceCount, unclassifiedMemberCount: unit.unclassifiedMemberCount, contentDigest: unit.contentDigest }; }
function architectureUnitMemberData(member: ArchitectureUnitMemberProjection, predicate: ArchitectureUnitScopePredicate) { return { ...predicate, unitIdentity: member.unitIdentity, generationId: member.generationId, baselineId: member.baselineId, projectionManifestId: member.projectionManifestId, assertionId: member.assertionId, assetType: member.assetType ?? null, semanticIdentity: member.semanticIdentity, contentDigest: member.contentDigest }; }
function architectureUnitMappingData(mapping: ArchitectureUnitMappingProjection, predicate: ArchitectureUnitScopePredicate) { return { ...predicate, mappingIdentity: mapping.mappingIdentity, generationId: mapping.generationId, baselineId: mapping.baselineId, projectionManifestId: mapping.projectionManifestId, sourceUnitIdentity: mapping.sourceUnitIdentity, targetUnitIdentity: mapping.targetUnitIdentity, sourceLayer: mapping.sourceLayer, targetLayer: mapping.targetLayer, mappingFamily: mapping.mappingFamily, relationshipCount: mapping.relationshipCount, evidenceCount: mapping.evidenceCount, confidence: mapping.confidence, contentDigest: mapping.contentDigest }; }
function architectureUnitFromRow(row: any): ArchitectureUnitProjection { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, generationId: row.generationId, baselineId: row.baselineId, projectionManifestId: row.projectionManifestId, unitIdentity: row.unitIdentity, layer: row.layer, kind: row.kind, ...(row.parentUnitIdentity ? { parentUnitIdentity: row.parentUnitIdentity } : {}), canonicalName: row.canonicalName, ...(typeof row.localizedName === "string" ? { localizedName: row.localizedName } : {}), aliases: Array.isArray(row.aliases) ? row.aliases.filter((item: unknown): item is string => typeof item === "string") : [], memberCount: row.memberCount, criticality: row.criticality, completeness: row.completeness, evidenceCount: row.evidenceCount, unclassifiedMemberCount: row.unclassifiedMemberCount, contentDigest: row.contentDigest }; }
function architectureUnitMemberFromRow(row: any): ArchitectureUnitMemberProjection { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, generationId: row.generationId, baselineId: row.baselineId, projectionManifestId: row.projectionManifestId, unitIdentity: row.unitIdentity, assertionId: row.assertionId, ...(row.assetType ? { assetType: row.assetType } : {}), semanticIdentity: row.semanticIdentity, contentDigest: row.contentDigest }; }
function architectureUnitMappingFromRow(row: any): ArchitectureUnitMappingProjection { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, generationId: row.generationId, baselineId: row.baselineId, projectionManifestId: row.projectionManifestId, mappingIdentity: row.mappingIdentity, sourceUnitIdentity: row.sourceUnitIdentity, targetUnitIdentity: row.targetUnitIdentity, sourceLayer: row.sourceLayer, targetLayer: row.targetLayer, mappingFamily: row.mappingFamily, relationshipCount: row.relationshipCount, evidenceCount: row.evidenceCount, confidence: row.confidence, contentDigest: row.contentDigest }; }
function compareArchitectureUnits(left: ArchitectureUnitProjection, right: ArchitectureUnitProjection): number { return (left.parentUnitIdentity ?? "").localeCompare(right.parentUnitIdentity ?? "", "en") || right.criticality - left.criticality || left.canonicalName.localeCompare(right.canonicalName, "en") || left.unitIdentity.localeCompare(right.unitIdentity, "en"); }

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
