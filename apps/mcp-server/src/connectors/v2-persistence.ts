import {
  assertContinuousBatchSequence,
  assertContinuousObservationBatchV2Integrity,
  assertSnapshotFinalizationInput,
  contentDigest,
  type ArchitectureScopeRef,
  type ContinuousObservationBatchV2,
  type ConnectorRunStatus
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import { ensureMcpPersistenceSchema, prisma, readableScope, resolveWritableScope, writableActor } from "../persistence";
import { createOutbox } from "../federation/persistence";

type FederationTransaction = Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface SubmitContinuousObservationBatchV2Input {
  architectureScope: ArchitectureScopeRef;
  batch: ContinuousObservationBatchV2;
}

export interface CreateConnectorRunInput {
  architectureScope: ArchitectureScopeRef;
  id: string;
  connectorId: string;
  sourceNamespace: string;
  mode: "FULL_SNAPSHOT" | "DELTA";
  snapshotId: string | null;
  mappingVersion: string;
  mappingDigest: string;
  inventoryBoundaryDigest: string;
  coverage?: Record<string, unknown>;
}

export interface ClaimConnectorRunInput {
  architectureScope: ArchitectureScopeRef;
  runId: string;
  owner: string;
  leaseDurationMs?: number;
  now?: Date;
}

export interface FinalizeContinuousSnapshotInput {
  architectureScope: ArchitectureScopeRef;
  runId: string;
  fencingToken: number;
  snapshotId: string;
  inventoryBoundaryDigest: string;
  sourceVersion: string;
  observedAt: string;
}

export async function createConnectorRun(input: CreateConnectorRunInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    const connector = await tx.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.connectorId } } });
    if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
    if (connector.status !== "ACTIVE") throw new Error("CONNECTOR_NOT_ACTIVE");
    if (!Array.isArray(connector.capabilities) || !connector.capabilities.includes("OBSERVE")) throw new Error("CONNECTOR_CAPABILITY_MISSING");
    const run = await tx.connectorRun.create({
      data: {
        ...scope,
        id: input.id,
        connectorId: input.connectorId,
        sourceNamespace: input.sourceNamespace,
        mode: input.mode,
        snapshotId: input.snapshotId,
        mappingVersion: input.mappingVersion,
        mappingDigest: input.mappingDigest,
        inventoryBoundaryDigest: input.inventoryBoundaryDigest,
        status: "QUEUED",
        coverage: json(input.coverage ?? {})
      }
    });
    await createOutbox(tx, {
      eventType: "FEDERATION_CONNECTOR_RUN_QUEUED",
      payload: { runId: input.id, connectorId: input.connectorId, sourceNamespace: input.sourceNamespace, mode: input.mode },
      idempotencyKey: `connector-run:${scope.applicationServiceId}:${scope.scopePath}:${input.id}`,
      architectureScope: scope
    });
    return run;
  });
}

export async function claimConnectorRun(input: ClaimConnectorRunInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const now = input.now ?? new Date();
  const leaseDurationMs = boundedLease(input.leaseDurationMs ?? 60_000);
  await ensureMcpPersistenceSchema();
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    const run = await tx.connectorRun.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.runId } } });
    if (!run) throw new Error("CONNECTOR_RUN_NOT_FOUND");
    if (!["QUEUED", "LEASED", "RUNNING"].includes(run.status)) throw new Error("CONNECTOR_RUN_NOT_CLAIMABLE");
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", leaseLockKey(scope, run.connectorId, run.sourceNamespace));
    const existing = await tx.connectorLease.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace } } });
    if (existing && existing.leaseExpiresAt > now && existing.owner !== input.owner) throw new Error("CONNECTOR_LEASE_HELD");
    const fencingToken = (existing?.fencingToken ?? run.fencingToken) + 1;
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const lease = await tx.connectorLease.upsert({
      where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace } },
      create: { ...scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace, runId: run.id, owner: input.owner, fencingToken, heartbeatAt: now, leaseExpiresAt },
      update: { runId: run.id, owner: input.owner, fencingToken, heartbeatAt: now, leaseExpiresAt }
    });
    await tx.connectorRun.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: run.id } }, data: { status: "RUNNING", fencingToken, startedAt: run.startedAt ?? now } });
    return lease;
  });
}

export async function heartbeatConnectorLease(input: { architectureScope: ArchitectureScopeRef; connectorId: string; sourceNamespace: string; owner: string; fencingToken: number; leaseDurationMs?: number; now?: Date }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const now = input.now ?? new Date();
  const lease = await prisma.connectorLease.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId: input.connectorId, sourceNamespace: input.sourceNamespace } } });
  if (!lease || lease.owner !== input.owner || lease.fencingToken !== input.fencingToken || lease.leaseExpiresAt <= now) throw new Error("CONNECTOR_FENCING_TOKEN_INVALID");
  return prisma.connectorLease.update({
    where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId: input.connectorId, sourceNamespace: input.sourceNamespace } },
    data: { heartbeatAt: now, leaseExpiresAt: new Date(now.getTime() + boundedLease(input.leaseDurationMs ?? 60_000)) }
  });
}

export async function submitContinuousObservationBatchV2(input: SubmitContinuousObservationBatchV2Input) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (input.batch.architectureScope.applicationServiceId !== scope.applicationServiceId || input.batch.architectureScope.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
  const integrity = assertContinuousObservationBatchV2Integrity(input.batch);
  await ensureMcpPersistenceSchema();
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", leaseLockKey(scope, input.batch.connectorId, input.batch.sourceNamespace));
    const connector = await tx.connectorInstance.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.batch.connectorId } } });
    if (!connector) throw new Error("CONNECTOR_NOT_FOUND");
    if (connector.status !== "ACTIVE") throw new Error("CONNECTOR_NOT_ACTIVE");
    if (!Array.isArray(connector.capabilities) || !connector.capabilities.includes("OBSERVE")) throw new Error("CONNECTOR_CAPABILITY_MISSING");
    const run = await tx.connectorRun.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.batch.runId } } });
    if (!run || run.connectorId !== input.batch.connectorId || run.sourceNamespace !== input.batch.sourceNamespace) throw new Error("CONNECTOR_RUN_NOT_FOUND");
    if (!["RUNNING", "FINALIZING"].includes(run.status)) throw new Error("CONNECTOR_RUN_NOT_ACTIVE");
    if (String(run.fencingToken) !== input.batch.fencingToken) throw new Error("CONNECTOR_FENCING_TOKEN_INVALID");
    if (run.mappingVersion !== input.batch.mappingVersion || run.mappingDigest !== input.batch.mappingDigest || run.inventoryBoundaryDigest !== input.batch.inventoryBoundaryDigest) throw new Error("CONNECTOR_RUN_BOUNDARY_MISMATCH");
    if (run.mode !== input.batch.mode || run.snapshotId !== input.batch.snapshotId) throw new Error("CONNECTOR_RUN_MODE_MISMATCH");
    const cursorKey = { ...scope, connectorId: input.batch.connectorId, sourceNamespace: input.batch.sourceNamespace };
    const cursor = await tx.federationObservationCursor.upsert({
      where: { applicationServiceId_scopePath_connectorId_sourceNamespace: cursorKey },
      create: { ...cursorKey, contractVersion: input.batch.contractVersion, status: "ACTIVE", acceptedSequence: -1 },
      update: {}
    });
    if (cursor.contractVersion !== input.batch.contractVersion) throw new Error("OBSERVATION_BATCH_CONTRACT_MISMATCH");
    const existing = await tx.federationObservationBatch.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace_sequence: { ...cursorKey, sequence: input.batch.sequence } } });
    if (existing) return requireIdenticalRetry(existing, input.batch, integrity);
    assertContinuousBatchSequence(cursor, input.batch);
    const identities = input.batch.observations.map((observation) => ({ externalAssetType: observation.externalAssetType, externalId: observation.externalId, sourceVersion: observation.sourceVersion }));
    const existingObservations = identities.length ? await tx.sourceObservation.findMany({ where: { ...scope, connectorId: input.batch.connectorId, sourceNamespace: input.batch.sourceNamespace, OR: identities }, select: { externalAssetType: true, externalId: true, sourceVersion: true, normalizedDigest: true, operation: true } }) : [];
    const existingByIdentity = new Map(existingObservations.map((observation) => [`${observation.externalAssetType}:${observation.externalId}:${observation.sourceVersion}`, observation]));
    const observationRows = input.batch.observations.map((observation) => {
      const normalizedDigest = contentDigest({ operation: observation.operation, payload: observation.payload ?? null, deletionReason: observation.deletionReason });
      const key = `${observation.externalAssetType}:${observation.externalId}:${observation.sourceVersion}`;
      const previous = existingByIdentity.get(key);
      if (previous && (previous.normalizedDigest !== normalizedDigest || previous.operation !== observation.operation)) throw new Error("OBSERVATION_IDENTITY_CONFLICT");
      return { observation, normalizedDigest, key, previous };
    });
    const newRows = observationRows.filter((row) => !row.previous);
    if (newRows.length) await tx.sourceObservation.createMany({ data: newRows.map(({ observation, normalizedDigest }) => ({
      ...scope,
      id: `continuous-observation:${contentDigest({ scope, connectorId: input.batch.connectorId, sourceNamespace: input.batch.sourceNamespace, runId: input.batch.runId, observationId: observation.id })}`,
      connectorId: input.batch.connectorId,
      sourceNamespace: input.batch.sourceNamespace,
      externalAssetType: observation.externalAssetType,
      externalId: observation.externalId,
      operation: observation.operation,
      payload: json(observation.payload ?? {}),
      deletionReason: observation.deletionReason ?? null,
      normalizedDigest,
      sourceVersion: observation.sourceVersion,
      runId: input.batch.runId,
      snapshotId: input.batch.snapshotId,
      inventoryBoundaryDigest: input.batch.inventoryBoundaryDigest,
      observedAt: new Date(observation.observedAt ?? input.batch.observedAt),
      status: observation.operation === "TOMBSTONE" ? "TOMBSTONED" : "CANDIDATE",
      provenance: json({ sourceSystem: input.batch.sourceNamespace, connectorInstanceId: input.batch.connectorId, externalIdentity: `${observation.externalAssetType}:${observation.externalId}`, externalVersion: observation.sourceVersion, observedAt: observation.observedAt ?? input.batch.observedAt, runId: input.batch.runId, snapshotId: input.batch.snapshotId, sourceCursor: input.batch.sourceCursor }),
      idempotencyKey: `continuous-observation:${input.batch.batchDigest}:${observation.id}`
    })) });
    if (input.batch.mode === "FULL_SNAPSHOT" && input.batch.snapshotId) {
      const seenRows = input.batch.observations.filter((observation) => observation.operation === "UPSERT");
      if (seenRows.length) await tx.connectorSnapshotIdentity.createMany({ data: seenRows.map((observation) => ({
        ...scope,
        runId: input.batch.runId,
        snapshotId: input.batch.snapshotId!,
        externalAssetType: observation.externalAssetType,
        externalId: observation.externalId,
        sourceVersion: observation.sourceVersion,
        normalizedDigest: contentDigest(observation.payload ?? {}),
        observedAt: new Date(observation.observedAt ?? input.batch.observedAt)
      })), skipDuplicates: true });
    }
    const acceptedAt = new Date();
    const acceptanceReceipt = { architectureScope: scope, connectorId: input.batch.connectorId, sourceNamespace: input.batch.sourceNamespace, runId: input.batch.runId, sequence: input.batch.sequence, pageIndex: input.batch.pageIndex, isLastPage: input.batch.isLastPage, batchDigest: input.batch.batchDigest, payloadDigest: integrity.payloadDigest, observationCount: input.batch.observations.length, acceptedAt: acceptedAt.toISOString() };
    await tx.federationObservationBatch.create({ data: { ...cursorKey, runId: input.batch.runId, fencingToken: Number.parseInt(input.batch.fencingToken, 10), mode: input.batch.mode, snapshotId: input.batch.snapshotId, mappingVersion: input.batch.mappingVersion, mappingDigest: input.batch.mappingDigest, inventoryBoundaryDigest: input.batch.inventoryBoundaryDigest, sequence: input.batch.sequence, previousBatchDigest: input.batch.previousBatchDigest, batchDigest: input.batch.batchDigest, payloadDigest: integrity.payloadDigest, observationCount: input.batch.observations.length, canonicalBytes: integrity.canonicalBytes, pageIndex: input.batch.pageIndex, isLastPage: input.batch.isLastPage, sourceCursor: input.batch.sourceCursor, sourceHighWaterMark: input.batch.sourceHighWaterMark, observedAt: new Date(input.batch.observedAt), status: "ACCEPTED", acceptanceReceipt: json(acceptanceReceipt), acceptedAt } });
    await tx.federationObservationCursor.update({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: cursorKey }, data: { acceptedSequence: input.batch.sequence, acceptedBatchDigest: input.batch.batchDigest, sourceCursor: input.batch.sourceCursor, lastObservedAt: new Date(input.batch.observedAt), status: "ACTIVE", lastError: null } });
    await tx.connectorRun.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.batch.runId } }, data: { acceptedSequence: input.batch.sequence, acceptedBatchDigest: input.batch.batchDigest, sourceCursor: input.batch.sourceCursor, sourceHighWaterMark: input.batch.sourceHighWaterMark, status: input.batch.isLastPage ? "FINALIZING" : "RUNNING", coverage: json(input.batch.coverage) } });
    await createOutbox(tx, { eventType: "FEDERATION_CONTINUOUS_BATCH_V2_ACCEPTED", payload: acceptanceReceipt, idempotencyKey: `continuous-batch-v2:${input.batch.batchDigest}`, architectureScope: scope });
    return { ...acceptanceReceipt, status: "ACCEPTED", idempotent: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function finalizeContinuousSnapshot(input: FinalizeContinuousSnapshotInput) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  return prisma.$transaction(async (transaction) => {
    const tx = transaction as FederationTransaction;
    const run = await tx.connectorRun.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.runId } } });
    if (!run || run.mode !== "FULL_SNAPSHOT" || run.snapshotId !== input.snapshotId) throw new Error("CONNECTOR_RUN_NOT_FOUND");
    if (run.fencingToken !== input.fencingToken) throw new Error("CONNECTOR_FENCING_TOKEN_INVALID");
    const lastBatch = await tx.federationObservationBatch.findFirst({ where: { ...scope, runId: input.runId }, orderBy: { sequence: "desc" } });
    assertSnapshotFinalizationInput({ mode: run.mode as "FULL_SNAPSHOT", snapshotId: run.snapshotId, inventoryBoundaryDigest: input.inventoryBoundaryDigest, complete: run.status === "FINALIZING", isLastPage: lastBatch?.isLastPage === true });
    if (run.inventoryBoundaryDigest !== input.inventoryBoundaryDigest) throw new Error("SNAPSHOT_BOUNDARY_MISMATCH");
    const cursor = await tx.federationObservationCursor.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace } } });
    if (!cursor) throw new Error("OBSERVATION_CURSOR_NOT_FOUND");
    const previousSnapshotId = cursor.lastCompletedSnapshotId;
    let tombstoneCount = 0;
    if (previousSnapshotId && cursor.lastCompletedBoundaryDigest === input.inventoryBoundaryDigest) {
      const current = await tx.connectorSnapshotIdentity.findMany({ where: { ...scope, runId: input.runId }, select: { externalAssetType: true, externalId: true } });
      const currentKeys = new Set(current.map((identity) => `${identity.externalAssetType}:${identity.externalId}`));
      const previous = await tx.connectorSnapshotIdentity.findMany({ where: { ...scope, snapshotId: previousSnapshotId }, select: { externalAssetType: true, externalId: true } });
      const missing = previous.filter((identity) => !currentKeys.has(`${identity.externalAssetType}:${identity.externalId}`));
      if (missing.length) {
        const observedAt = new Date(input.observedAt);
        await tx.sourceObservation.createMany({ data: missing.map((identity) => {
          const normalizedDigest = contentDigest({ operation: "TOMBSTONE", deletionReason: "missing-from-complete-snapshot", sourceVersion: input.sourceVersion });
          return { ...scope, id: `continuous-tombstone:${contentDigest({ scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace, snapshotId: input.snapshotId, externalAssetType: identity.externalAssetType, externalId: identity.externalId })}`, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace, externalAssetType: identity.externalAssetType, externalId: identity.externalId, operation: "TOMBSTONE", payload: {}, deletionReason: "missing-from-complete-snapshot", normalizedDigest, sourceVersion: input.sourceVersion, runId: input.runId, snapshotId: input.snapshotId, inventoryBoundaryDigest: input.inventoryBoundaryDigest, observedAt, status: "TOMBSTONED", provenance: json({ sourceSystem: run.sourceNamespace, connectorInstanceId: run.connectorId, externalIdentity: `${identity.externalAssetType}:${identity.externalId}`, externalVersion: input.sourceVersion, observedAt: input.observedAt, runId: input.runId, snapshotId: input.snapshotId }), idempotencyKey: `continuous-tombstone:${input.runId}:${identity.externalAssetType}:${identity.externalId}` };
        }), skipDuplicates: true });
        tombstoneCount = missing.length;
      }
    }
    const finishedAt = new Date();
    await tx.federationObservationCursor.update({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace } }, data: { lastCompletedSnapshotId: input.snapshotId, lastCompletedBoundaryDigest: input.inventoryBoundaryDigest, lastCompletedMappingVersion: run.mappingVersion, status: "ACTIVE" } });
    const updated = await tx.connectorRun.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: run.id } }, data: { status: "SUCCEEDED", finishedAt } });
    await tx.connectorLease.deleteMany({ where: { ...scope, connectorId: run.connectorId, sourceNamespace: run.sourceNamespace, runId: run.id } });
    await createOutbox(tx, { eventType: "FEDERATION_CONTINUOUS_SNAPSHOT_FINALIZED", payload: { runId: run.id, snapshotId: input.snapshotId, inventoryBoundaryDigest: input.inventoryBoundaryDigest, tombstoneCount }, idempotencyKey: `continuous-snapshot-finalized:${run.id}`, architectureScope: scope });
    return { run: updated, tombstoneCount, status: "SUCCEEDED" as ConnectorRunStatus };
  });
}

export async function recordConnectorDeadLetter(input: { architectureScope: ArchitectureScopeRef; id: string; runId: string; connectorId: string; sourceNamespace: string; sequence?: number; pageIndex?: number; errorCode: string; errorMessage: string; payload?: Record<string, unknown> }) {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  return prisma.connectorDeadLetter.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } },
    create: { ...scope, id: input.id, runId: input.runId, connectorId: input.connectorId, sourceNamespace: input.sourceNamespace, sequence: input.sequence, pageIndex: input.pageIndex, errorCode: input.errorCode, errorMessage: redactError(input.errorMessage), payload: json(input.payload ?? {}), status: "OPEN" },
    update: { errorCode: input.errorCode, errorMessage: redactError(input.errorMessage), payload: json(input.payload ?? {}), attemptCount: { increment: 1 }, lastAttemptAt: new Date() }
  });
}

export async function getConnectorHealth(architectureScope: ArchitectureScopeRef, connectorId: string, sourceNamespace: string) {
  const scope = readableScope(architectureScope.applicationServiceId);
  if (scope.scopePath !== architectureScope.scopePath) throw new Error("SCOPE_MISMATCH");
  const [cursor, run, deadLetterCount] = await Promise.all([
    prisma.federationObservationCursor.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId, sourceNamespace } } }),
    prisma.connectorRun.findFirst({ where: { ...scope, connectorId, sourceNamespace }, orderBy: { queuedAt: "desc" } }),
    prisma.connectorDeadLetter.count({ where: { ...scope, connectorId, sourceNamespace, status: "OPEN" } })
  ]);
  return { architectureScope: scope, connectorId, sourceNamespace, cursor, latestRun: run, deadLetterCount };
}

function requireIdenticalRetry(existing: { sequence: number; batchDigest: string; payloadDigest: string; canonicalBytes: number; observationCount: number; previousBatchDigest: string | null }, batch: ContinuousObservationBatchV2, integrity: { payloadDigest: string; canonicalBytes: number }) {
  if (existing.previousBatchDigest !== batch.previousBatchDigest || existing.batchDigest !== batch.batchDigest || existing.payloadDigest !== integrity.payloadDigest || existing.canonicalBytes !== integrity.canonicalBytes || existing.observationCount !== batch.observations.length) throw new Error("OBSERVATION_BATCH_SEQUENCE_CONFLICT");
  return { sequence: existing.sequence, batchDigest: existing.batchDigest, idempotent: true, status: "ACCEPTED" as const };
}

function leaseLockKey(scope: ArchitectureScopeRef, connectorId: string, sourceNamespace: string): string {
  return `${scope.applicationServiceId}|${scope.scopePath}|connector-v2|${connectorId}|${sourceNamespace}`;
}

function boundedLease(value: number): number {
  if (!Number.isInteger(value) || value < 1_000 || value > 3_600_000) throw new Error("CONNECTOR_LEASE_DURATION_INVALID");
  return value;
}

function redactError(value: string): string {
  return value.replace(/(password|secret|token|authorization)\s*[:=]\s*[^\s,;]+/giu, "$1=[REDACTED]");
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
