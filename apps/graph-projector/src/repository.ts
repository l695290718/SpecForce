import { Prisma, PrismaClient } from "@prisma/client";
import type { ClaimedProjection, ProjectionClaimOptions, ProjectionRepository } from "./projector.js";
import type { ProjectionPayload } from "./gateway.js";
import { ProjectionHealthError, type ProjectionHealthSnapshot } from "./runtime.js";

type PrismaTransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type PrismaRepositoryClient = PrismaClient | PrismaTransactionClient;

const checkpointPartitionId = "relationship-outbox";

export class PrismaProjectionRepository implements ProjectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async health(
    scope: { enterpriseId: string; applicationServiceId: string; scopePath: string },
    now: Date
  ): Promise<ProjectionHealthSnapshot> {
    let rows: HealthRow[];
    try {
      rows = await this.prisma.$queryRawUnsafe<HealthRow[]>(
        HEALTH_SQL,
        scope.enterpriseId,
        scope.applicationServiceId,
        scope.scopePath,
        now
      );
    } catch (error) {
      if (isUndefinedTableError(error)) {
        throw new ProjectionHealthError("PROJECTOR_SCHEMA_NOT_READY");
      }
      throw error;
    }
    const row = rows[0];
    if (row === undefined) throw new Error("PROJECTOR_HEALTH_QUERY_EMPTY");
    return {
      backlog: Number(row.backlog),
      oldestPendingAgeSeconds: row.oldest_pending_age_seconds === null
        ? null
        : Math.max(0, Math.floor(Number(row.oldest_pending_age_seconds))),
      lastCheckpoint: row.last_checkpoint,
      retryCount: Number(row.retry_count),
      deadLetterCount: Number(row.dead_letter_count)
    };
  }

  async projectionPayload(event: ClaimedProjection): Promise<ProjectionPayload> {
    const canonicalNodes = jsonRecordArray(event.payload.nodes);
    const canonicalEdges = jsonRecordArray(event.payload.edges);
    if (canonicalNodes !== undefined && canonicalEdges !== undefined) {
      return { nodes: canonicalNodes, edges: canonicalEdges };
    }

    const subject = jsonRecord(event.payload.subject);
    if (subject === undefined) throw new Error("GRAPH_PROJECTION_PAYLOAD_INVALID");
    if (event.eventType === "ASSET_NODE_UPSERT") {
      return { nodes: [nodeFromRecord(subject)], edges: [] };
    }
    if (event.eventType !== "RELATIONSHIP_UPSERT" || subject.lifecycleStatus !== "ACTIVE") {
      throw new Error("GRAPH_PROJECTION_EVENT_UNSUPPORTED");
    }

    const sourceNodeId = requiredString(subject.sourceNodeId);
    const targetNodeId = requiredString(subject.targetNodeId);
    const rows = await this.prisma.assetNode.findMany({
      where: {
        enterpriseId: event.enterpriseId,
        applicationServiceId: event.applicationServiceId,
        scopePath: event.scopePath,
        dbId: { in: [sourceNodeId, targetNodeId] }
      },
      select: {
        dbId: true,
        nodeType: true,
        logicalId: true,
        rootAssetType: true,
        rootAssetId: true,
        parent: { select: { logicalId: true } }
      }
    });
    const byId = new Map(rows.map((row) => [row.dbId, nodeFromAssetNode(row)]));
    const source = byId.get(sourceNodeId);
    const target = byId.get(targetNodeId);
    if (source === undefined || target === undefined) throw new Error("GRAPH_PROJECTION_ENDPOINT_NOT_FOUND");
    const nodes = sourceNodeId === targetNodeId ? [source] : [source, target];
    return {
      nodes,
      edges: [{
        id: requiredString(subject.relationshipId),
        code: requiredString(subject.relationType),
        source,
        target,
        strength: requiredString(subject.strength),
        confidence: requiredNumber(subject.confidence),
        version: requiredString(subject.version)
      }]
    };
  }

  async claim(input: ProjectionClaimOptions): Promise<ClaimedProjection[]> {
    const leaseExpiresAt = new Date(input.now.getTime() + input.leaseDurationMs);
    const rows = await this.prisma.$queryRawUnsafe<OutboxRow[]>(CLAIM_SQL, input.now, input.owner, leaseExpiresAt, input.limit);
    return rows.map(toClaimedProjection);
  }

  async complete(event: ClaimedProjection, input: { owner: string; now: Date }): Promise<boolean> {
    return this.prisma.$transaction(async (transaction) => {
      await lockScope(transaction, event);
      const updated = await transaction.relationshipOutbox.updateMany({
        where: ownershipWhere(event, input.owner),
        data: {
          status: "COMPLETED",
          sentAt: input.now,
          terminalAt: input.now,
          leaseOwner: null,
          leaseExpiresAt: null,
          lastError: null,
          diagnostic: null,
          diagnosticRef: null
        }
      });
      if (updated.count !== 1) return false;

      const version = await contiguousProjectedVersion(transaction, event);
      if (version === null) return true;
      await upsertCheckpoint(transaction, event, version, input.now);
      return true;
    });
  }

  async retry(event: ClaimedProjection, input: { owner: string; availableAt: Date; diagnostic: string; diagnosticRef: string }): Promise<boolean> {
    const updated = await this.prisma.relationshipOutbox.updateMany({
      where: ownershipWhere(event, input.owner),
      data: {
        status: "PENDING",
        availableAt: input.availableAt,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: input.diagnostic,
        diagnostic: input.diagnostic,
        diagnosticRef: input.diagnosticRef
      }
    });
    return updated.count === 1;
  }

  async deadLetter(event: ClaimedProjection, input: { owner: string; now: Date; diagnostic: string; diagnosticRef: string }): Promise<boolean> {
    const updated = await this.prisma.relationshipOutbox.updateMany({
      where: ownershipWhere(event, input.owner),
      data: {
        status: "DEAD_LETTER",
        terminalAt: input.now,
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: input.diagnostic,
        diagnostic: input.diagnostic,
        diagnosticRef: input.diagnosticRef
      }
    });
    return updated.count === 1;
  }
}

type OutboxRow = {
  dbId: string;
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
  relationshipEventId: string;
  graphVersion: bigint;
  eventType: string;
  payload: Prisma.JsonValue;
  status: "PENDING" | "DELIVERING";
  idempotencyKey: string;
  attemptCount: number;
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

type HealthRow = {
  backlog: number;
  oldest_pending_age_seconds: number | null;
  last_checkpoint: bigint | null;
  retry_count: number;
  dead_letter_count: number;
};

function isUndefinedTableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2010") {
    return false;
  }
  if (!("meta" in error) || typeof error.meta !== "object" || error.meta === null || !("code" in error.meta)) {
    return false;
  }
  return error.meta.code === "42P01";
}

function toClaimedProjection(row: OutboxRow): ClaimedProjection {
  return {
    id: row.dbId,
    enterpriseId: row.enterpriseId,
    applicationServiceId: row.applicationServiceId,
    scopePath: row.scopePath,
    relationshipEventId: row.relationshipEventId,
    graphVersion: row.graphVersion,
    eventType: row.eventType,
    payload: isRecord(row.payload) ? row.payload : {},
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    attemptCount: row.attemptCount,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt
  };
}

function ownershipWhere(event: ClaimedProjection, leaseOwner: string) {
  return {
    dbId: event.id,
    enterpriseId: event.enterpriseId,
    applicationServiceId: event.applicationServiceId,
    scopePath: event.scopePath,
    status: "DELIVERING",
    leaseOwner
  };
}

async function lockScope(client: PrismaRepositoryClient, event: ClaimedProjection): Promise<void> {
  await client.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", scopeKey(event));
}

async function contiguousProjectedVersion(client: PrismaRepositoryClient, event: ClaimedProjection): Promise<bigint | null> {
  const rows = await client.$queryRawUnsafe<Array<{ graph_version: bigint | null }>>(CONTIGUOUS_VERSION_SQL, event.enterpriseId, event.applicationServiceId, event.scopePath);
  return rows[0]?.graph_version ?? null;
}

async function upsertCheckpoint(client: PrismaRepositoryClient, event: ClaimedProjection, version: bigint, projectedAt: Date): Promise<void> {
  await client.$executeRawUnsafe(CHECKPOINT_SQL, event.enterpriseId, event.applicationServiceId, event.scopePath, checkpointPartitionId, event.relationshipEventId, version, projectedAt);
}

function scopeKey(event: ClaimedProjection): string {
  return `${event.enterpriseId}:${event.applicationServiceId}:${event.scopePath}`;
}

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function jsonRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) && value.every((item) => jsonRecord(item) !== undefined)
    ? value as Array<Record<string, unknown>>
    : undefined;
}

function nodeFromRecord(value: Record<string, unknown>): Record<string, unknown> {
  return {
    nodeType: requiredString(value.nodeType),
    logicalId: requiredString(value.logicalId),
    rootAssetType: requiredString(value.rootAssetType),
    rootAssetId: requiredString(value.rootAssetId),
    ...(typeof value.parentLogicalId === "string" && value.parentLogicalId.trim()
      ? { parentLogicalId: value.parentLogicalId }
      : {})
  };
}

function nodeFromAssetNode(value: {
  nodeType: string;
  logicalId: string;
  rootAssetType: string;
  rootAssetId: string;
  parent: { logicalId: string } | null;
}): Record<string, unknown> {
  return {
    nodeType: value.nodeType,
    logicalId: value.logicalId,
    rootAssetType: value.rootAssetType,
    rootAssetId: value.rootAssetId,
    ...(value.parent === null ? {} : { parentLogicalId: value.parent.logicalId })
  };
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("GRAPH_PROJECTION_PAYLOAD_INVALID");
  return value;
}

function requiredNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("GRAPH_PROJECTION_PAYLOAD_INVALID");
  return value;
}

const CLAIM_SQL = `
  WITH candidates AS (
    SELECT "dbId"
    FROM "RelationshipOutbox"
    WHERE (
      (status = 'PENDING' AND "availableAt" <= $1)
      OR (status = 'DELIVERING' AND "leaseExpiresAt" <= $1)
    )
      AND NOT EXISTS (
        SELECT 1
        FROM "RelationshipOutbox" AS earlier
        WHERE earlier."enterpriseId" = "RelationshipOutbox"."enterpriseId"
          AND earlier."applicationServiceId" = "RelationshipOutbox"."applicationServiceId"
          AND earlier."scopePath" = "RelationshipOutbox"."scopePath"
          AND earlier."graphVersion" < "RelationshipOutbox"."graphVersion"
          AND earlier.status NOT IN ('COMPLETED', 'ARCHIVED')
      )
    ORDER BY "availableAt" ASC, "createdAt" ASC, "dbId" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT $4
  )
  UPDATE "RelationshipOutbox" AS outbox
  SET status = 'DELIVERING',
      "leaseOwner" = $2,
      "leaseExpiresAt" = $3,
      "attemptCount" = outbox."attemptCount" + 1,
      "sentAt" = COALESCE(outbox."sentAt", $1)
  FROM candidates
  WHERE outbox."dbId" = candidates."dbId"
  RETURNING outbox."dbId", outbox."enterpriseId", outbox."applicationServiceId", outbox."scopePath", outbox."relationshipEventId", outbox."graphVersion", outbox."eventType", outbox.payload, outbox.status, outbox."idempotencyKey", outbox."attemptCount", outbox."leaseOwner", outbox."leaseExpiresAt";
`;

const CONTIGUOUS_VERSION_SQL = `
  SELECT MAX(completed."graphVersion") AS graph_version
  FROM "RelationshipOutbox" AS completed
  WHERE completed."enterpriseId" = $1
    AND completed."applicationServiceId" = $2
    AND completed."scopePath" = $3
    AND completed.status = 'COMPLETED'
    AND NOT EXISTS (
      SELECT 1
      FROM "RelationshipOutbox" AS incomplete
      WHERE incomplete."enterpriseId" = completed."enterpriseId"
        AND incomplete."applicationServiceId" = completed."applicationServiceId"
        AND incomplete."scopePath" = completed."scopePath"
        AND incomplete."graphVersion" <= completed."graphVersion"
        AND incomplete.status NOT IN ('COMPLETED', 'ARCHIVED')
    );
`;

const CHECKPOINT_SQL = `
  INSERT INTO "ProjectionCheckpoint" (
    "enterpriseId", "applicationServiceId", "scopePath", "partitionId", "lastEventId", "projectionVersion", "projectedAt", status, error, "updatedAt"
  ) VALUES ($1, $2, $3, $4, $5::uuid, $6::bigint, $7, 'HEALTHY', NULL, $7)
  ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "partitionId") DO UPDATE
  SET "projectionVersion" = GREATEST("ProjectionCheckpoint"."projectionVersion", EXCLUDED."projectionVersion"),
      "lastEventId" = CASE
        WHEN EXCLUDED."projectionVersion" > "ProjectionCheckpoint"."projectionVersion" THEN EXCLUDED."lastEventId"
        ELSE "ProjectionCheckpoint"."lastEventId"
      END,
      "projectedAt" = CASE
       WHEN EXCLUDED."projectionVersion" >= "ProjectionCheckpoint"."projectionVersion" THEN EXCLUDED."projectedAt"
       ELSE "ProjectionCheckpoint"."projectedAt"
       END,
       "updatedAt" = EXCLUDED."updatedAt",
       status = 'HEALTHY',
      error = NULL;
`;

const HEALTH_SQL = `
  SELECT
    COUNT(*) FILTER (
      WHERE outbox.status IN ('PENDING', 'DELIVERING')
    )::integer AS backlog,
    EXTRACT(EPOCH FROM (
      $4::timestamptz - MIN(outbox."createdAt") FILTER (
        WHERE outbox.status IN ('PENDING', 'DELIVERING')
      )
    ))::double precision AS oldest_pending_age_seconds,
    COALESCE(SUM(GREATEST(outbox."attemptCount" - 1, 0)) FILTER (
      WHERE outbox.status IN ('PENDING', 'DELIVERING')
    ), 0)::integer AS retry_count,
    COUNT(*) FILTER (
      WHERE outbox.status = 'DEAD_LETTER'
    )::integer AS dead_letter_count,
    (
      SELECT MAX(checkpoint."projectionVersion")
      FROM "ProjectionCheckpoint" AS checkpoint
      WHERE checkpoint."enterpriseId" = $1
        AND checkpoint."applicationServiceId" = $2
        AND checkpoint."scopePath" = $3
        AND checkpoint."partitionId" = 'relationship-outbox'
    ) AS last_checkpoint
  FROM "RelationshipOutbox" AS outbox
  WHERE outbox."enterpriseId" = $1
    AND outbox."applicationServiceId" = $2
    AND outbox."scopePath" = $3;
`;
