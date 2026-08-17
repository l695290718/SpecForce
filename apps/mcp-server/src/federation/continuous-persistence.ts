import {
  assertContinuousBatchIntegrity,
  assertContinuousBatchSequence,
  contentDigest,
  type ArchitectureScopeRef,
  type ContinuousObservationBatch
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import { ensureMcpPersistenceSchema, prisma, readableScope, resolveWritableScope, writableActor } from "../persistence";
import { createOutbox } from "./persistence";

export interface SubmitContinuousObservationBatchInput {
  architectureScope: ArchitectureScopeRef;
  batch: ContinuousObservationBatch;
}

export interface ContinuousObservationCursorView {
  connectorId: string;
  sourceNamespace: string;
  contractVersion: string;
  acceptedSequence: number;
  acceptedBatchDigest: string | null;
  sourceCursor: string | null;
  status: string;
  lastObservedAt: string | null;
  lastError?: string;
  architectureScope: ArchitectureScopeRef;
}

type FederationTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export async function submitContinuousObservationBatch(input: SubmitContinuousObservationBatchInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (input.batch.architectureScope.applicationServiceId !== scope.applicationServiceId || input.batch.architectureScope.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  const integrity = assertContinuousBatchIntegrity(input.batch);
  await ensureMcpPersistenceSchema();
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", continuousLockKey(scope, input.batch.connectorId, input.batch.sourceNamespace));
    const connector = await tx.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.batch.connectorId } } });
    if (!connector) {
      const connectorInAnotherScope = await tx.connectorInstance.findFirst({ where: { id: input.batch.connectorId } });
      if (connectorInAnotherScope) throw new Error("SCOPE_MISMATCH");
      throw new Error("CONNECTOR_NOT_FOUND");
    }
    if (connector.status !== "ACTIVE") throw new Error("CONNECTOR_NOT_ACTIVE");
    if (!Array.isArray(connector.capabilities) || !connector.capabilities.includes("OBSERVE")) throw new Error("CONNECTOR_CAPABILITY_MISSING");
    const cursorKey = { ...scope, connectorId: input.batch.connectorId, sourceNamespace: input.batch.sourceNamespace };
    const cursor = await tx.federationObservationCursor.upsert({
      where: { applicationServiceId_scopePath_connectorId_sourceNamespace: cursorKey },
      create: { ...cursorKey, contractVersion: input.batch.contractVersion, status: "ACTIVE", acceptedSequence: -1 },
      update: {}
    });
    const existing = await tx.federationObservationBatch.findUnique({
      where: { applicationServiceId_scopePath_connectorId_sourceNamespace_sequence: { ...cursorKey, sequence: input.batch.sequence } }
    });
    if (existing) return requireIdenticalRetry(existing, input.batch, integrity);
    if (cursor.contractVersion !== input.batch.contractVersion) throw new Error("OBSERVATION_BATCH_CONTRACT_MISMATCH");
    assertContinuousBatchSequence(cursor, input.batch);
    const existingObservations = await tx.sourceObservation.findMany({
      where: {
        ...scope,
        connectorId: input.batch.connectorId,
        sourceNamespace: input.batch.sourceNamespace,
        OR: input.batch.observations.map((observation) => ({
          externalAssetType: observation.externalAssetType,
          externalId: observation.externalId,
          sourceVersion: observation.sourceVersion
        }))
      },
      select: { externalAssetType: true, externalId: true, sourceVersion: true, normalizedDigest: true }
    });
    if (existingObservations.length) throw new Error("OBSERVATION_IDENTITY_CONFLICT");
    const acceptedAt = new Date();
    const acceptanceReceipt = {
      architectureScope: scope,
      connectorId: input.batch.connectorId,
      sourceNamespace: input.batch.sourceNamespace,
      sequence: input.batch.sequence,
      previousBatchDigest: input.batch.previousBatchDigest,
      batchDigest: input.batch.batchDigest,
      payloadDigest: integrity.payloadDigest,
      observationCount: input.batch.observations.length,
      acceptedAt: acceptedAt.toISOString()
    };
    await tx.sourceObservation.createMany({
      data: input.batch.observations.map((observation) => ({
        ...scope,
        id: `continuous-observation:${contentDigest({ scope, connectorId: input.batch.connectorId, sourceNamespace: input.batch.sourceNamespace, observationId: observation.id })}`,
        connectorId: input.batch.connectorId,
        sourceNamespace: input.batch.sourceNamespace,
        externalAssetType: observation.externalAssetType,
        externalId: observation.externalId,
        payload: json({ ...observation.payload, observationId: observation.id, continuousSequence: input.batch.sequence }),
        normalizedDigest: contentDigest(observation.payload),
        sourceVersion: observation.sourceVersion,
        observedAt: new Date(observation.observedAt ?? input.batch.observedAt),
        status: "CANDIDATE",
        provenance: json({
          sourceSystem: input.batch.sourceNamespace,
          connectorInstanceId: input.batch.connectorId,
          externalIdentity: `${observation.externalAssetType}:${observation.externalId}`,
          externalVersion: observation.sourceVersion,
          observedAt: observation.observedAt ?? input.batch.observedAt,
          continuousSequence: input.batch.sequence,
          sourceCursor: input.batch.sourceCursor
        }),
        idempotencyKey: `continuous-observation:${input.batch.batchDigest}:${observation.id}`
      }))
    });
    await tx.federationObservationBatch.create({
      data: {
        ...cursorKey,
        runId: "legacy-v1",
        fencingToken: 0,
        mode: "DELTA",
        snapshotId: null,
        mappingVersion: "legacy-v1",
        mappingDigest: "",
        inventoryBoundaryDigest: "",
        sequence: input.batch.sequence,
        previousBatchDigest: input.batch.previousBatchDigest,
        batchDigest: input.batch.batchDigest,
        payloadDigest: integrity.payloadDigest,
        observationCount: input.batch.observations.length,
        canonicalBytes: integrity.canonicalBytes,
        pageIndex: input.batch.sequence,
        isLastPage: true,
        sourceCursor: input.batch.sourceCursor,
        sourceHighWaterMark: null,
        observedAt: new Date(input.batch.observedAt),
        status: "ACCEPTED",
        acceptanceReceipt: json(acceptanceReceipt),
        acceptedAt
      }
    });
    await tx.federationObservationCursor.update({
      where: { applicationServiceId_scopePath_connectorId_sourceNamespace: cursorKey },
      data: {
        acceptedSequence: input.batch.sequence,
        acceptedBatchDigest: input.batch.batchDigest,
        sourceCursor: input.batch.sourceCursor,
        lastObservedAt: new Date(input.batch.observedAt),
        status: "ACTIVE",
        lastError: null
      }
    });
    await createOutbox(tx, {
      eventType: "FEDERATION_CONTINUOUS_BATCH_ACCEPTED",
      payload: acceptanceReceipt,
      idempotencyKey: `continuous-batch:${input.batch.batchDigest}`,
      architectureScope: scope
    });
    return { ...acceptanceReceipt, idempotent: false, status: "ACCEPTED" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getContinuousObservationCursor(architectureScope: ArchitectureScopeRef, connectorId: string, sourceNamespace: string): Promise<ContinuousObservationCursorView | null> {
  const scope = readableScope(architectureScope.applicationServiceId);
  if (scope.scopePath !== architectureScope.scopePath) throw new Error("SCOPE_MISMATCH");
  await ensureMcpPersistenceSchema();
  const row = await prisma.federationObservationCursor.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId, sourceNamespace } } });
  if (!row) return null;
  return {
    connectorId: row.connectorId,
    sourceNamespace: row.sourceNamespace,
    contractVersion: row.contractVersion,
    acceptedSequence: row.acceptedSequence,
    acceptedBatchDigest: row.acceptedBatchDigest,
    sourceCursor: row.sourceCursor,
    status: row.status,
    lastObservedAt: row.lastObservedAt?.toISOString() ?? null,
    ...(row.lastError ? { lastError: row.lastError } : {}),
    architectureScope: scope
  };
}

function requireIdenticalRetry(existing: { sequence: number; previousBatchDigest: string | null; batchDigest: string; payloadDigest: string; observationCount: number; canonicalBytes: number; acceptanceReceipt: Prisma.JsonValue }, batch: ContinuousObservationBatch, integrity: { payloadDigest: string; canonicalBytes: number }): { sequence: number; batchDigest: string; idempotent: true; status: string; acceptanceReceipt: Prisma.JsonValue } {
  if (existing.previousBatchDigest !== batch.previousBatchDigest || existing.batchDigest !== batch.batchDigest || existing.payloadDigest !== integrity.payloadDigest || existing.observationCount !== batch.observations.length || existing.canonicalBytes !== integrity.canonicalBytes) throw new Error("OBSERVATION_BATCH_SEQUENCE_CONFLICT");
  return { sequence: existing.sequence, batchDigest: existing.batchDigest, idempotent: true, status: "ACCEPTED", acceptanceReceipt: existing.acceptanceReceipt };
}

function continuousLockKey(scope: ArchitectureScopeRef, connectorId: string, sourceNamespace: string): string {
  return `${scope.applicationServiceId}|${scope.scopePath}|continuous|${connectorId}|${sourceNamespace}`;
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
