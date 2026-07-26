import { Prisma, PrismaClient } from "@prisma/client";
import type { ClaimedProjection, ProjectionClaimOptions, ProjectionRepository } from "./projector";

type PrismaTransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type PrismaRepositoryClient = PrismaClient | PrismaTransactionClient;

const checkpointPartitionId = "relationship-outbox";

export class PrismaProjectionRepository implements ProjectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

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

function isRecord(value: Prisma.JsonValue): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CLAIM_SQL = `
  WITH candidates AS (
    SELECT "dbId"
    FROM "RelationshipOutbox"
    WHERE (status = 'PENDING' AND "availableAt" <= $1)
       OR (status = 'DELIVERING' AND "leaseExpiresAt" <= $1)
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
        AND incomplete.status <> 'COMPLETED'
    );
`;

const CHECKPOINT_SQL = `
  INSERT INTO "ProjectionCheckpoint" (
    "enterpriseId", "applicationServiceId", "scopePath", "partitionId", "lastEventId", "projectionVersion", "projectedAt", status, error
  ) VALUES ($1, $2, $3, $4, $5::uuid, $6::bigint, $7, 'HEALTHY', NULL)
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
      status = 'HEALTHY',
      error = NULL;
`;
