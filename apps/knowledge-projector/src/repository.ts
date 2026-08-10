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

export class PrismaProjectionBuildRepository implements ProjectionBuildRepository {
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
function toBuildJob(row: SqlBuildRow): ProjectionBuildJob { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, id: row.id, buildKey: row.buildKey, generationId: row.generationId, baselineId: row.baselineId, profileId: row.profileId, profileVersion: row.profileVersion, projectionSchemaVersion: "3a.v2", status: row.status as ProjectionBuildJob["status"], attempt: row.attempt, ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}), ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}), checkpoint: jsonObject(row.checkpoint), nodeCount: row.nodeCount, edgeCount: row.edgeCount, ...(row.errorCode ? { errorCode: row.errorCode } : {}), ...(row.diagnosticRef ? { diagnosticRef: row.diagnosticRef } : {}) }; }
function manifestFromRow(row: any): ProjectionManifestV2 { return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, id: row.id, baselineId: row.baselineId, generationId: row.generationId!, profileId: row.profileId!, profileVersion: row.profileVersion!, projectionSchemaVersion: "3a.v2", sourceRevisionIds: row.sourceRevisionIds as string[], relationshipVersion: row.relationshipVersion, query: row.query as Record<string, unknown>, inputDigest: row.inputDigest!, contentDigest: row.contentDigest!, nodeCount: row.nodeCount!, edgeCount: row.edgeCount!, publishedAt: row.publishedAt!.toISOString() }; }
function jsonObject(value: Prisma.JsonValue): { assertionSortKey?: string; relationshipVersion?: string } { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as { assertionSortKey?: string; relationshipVersion?: string } : {}; }
function stringArray(value: unknown): string[] { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : []; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }

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
