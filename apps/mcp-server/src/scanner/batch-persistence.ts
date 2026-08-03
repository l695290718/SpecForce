import type { KnowledgeScanBatch, ScanLimits, SourceObservationV2 } from "@specforge/scan-contract";
import type { ArchitectureScopeRef } from "@specforge/core";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { ensureMcpPersistenceSchema, prisma, writableActor } from "../persistence";
import { assertScannerReleaseAvailable } from "./release";
import {
  assertScanSessionScope,
  assertScanSessionWritable,
  findSessionByOpaqueId,
  verifySessionNonceDigest
} from "./session";

const PRODUCTION_SCAN_LIMITS: Readonly<ScanLimits> = Object.freeze({
  maxObservationsPerBatch: 500,
  maxBatchBytes: 4_194_304,
  maxExcerptBytes: 8_192,
  maxSourceFileBytes: 10_485_760,
  maxObservationsPerSession: 100_000
});

export interface SubmitScanBatchInput {
  architectureScope: ArchitectureScopeRef;
  batch: KnowledgeScanBatch | Record<string, unknown>;
}

export interface BatchIntegrity {
  payloadDigest: string;
  batchDigest: string;
  canonicalBytes: number;
}

interface BatchCheckpoint {
  acceptedSequence: number;
  acceptedBatchDigest: string | null;
}

interface PersistedBatchIdentity {
  sequence: number;
  previousBatchDigest: string | null;
  batchDigest: string;
  payloadDigest: string;
  observationCount: number;
  canonicalBytes: number;
  acceptanceReceipt?: unknown;
}

export function computeBatchIntegrity(value: Omit<KnowledgeScanBatch, "batchDigest"> | KnowledgeScanBatch | Record<string, unknown>): BatchIntegrity {
  const batch = value as Record<string, unknown>;
  const payloadDigest = sha256(canonicalJson({ observations: batch.observations, coverageDelta: batch.coverageDelta }));
  const digestEnvelope = {
    contractVersion: batch.contractVersion,
    sessionId: batch.sessionId,
    sequence: batch.sequence,
    previousBatchDigest: batch.previousBatchDigest,
    sessionNonceDigest: batch.sessionNonceDigest,
    architectureScope: batch.architectureScope,
    payloadDigest
  };
  return {
    payloadDigest,
    batchDigest: sha256(canonicalJson(digestEnvelope)),
    canonicalBytes: Buffer.byteLength(canonicalJson(batch), "utf8")
  };
}

export function assertBatchSequence(checkpoint: BatchCheckpoint, batch: Pick<KnowledgeScanBatch, "sequence" | "previousBatchDigest">): void {
  if (batch.sequence !== checkpoint.acceptedSequence + 1) throw new Error("SCAN_BATCH_SEQUENCE_GAP");
  if (batch.previousBatchDigest !== checkpoint.acceptedBatchDigest) throw new Error("SCAN_BATCH_CHAIN_MISMATCH");
}

export function assertBatchBudgets(
  budgets: Pick<ScanLimits, "maxObservationsPerBatch" | "maxBatchBytes" | "maxExcerptBytes" | "maxObservationsPerSession">,
  currentObservationCount: number,
  batch: Pick<KnowledgeScanBatch, "observations">,
  integrity: BatchIntegrity,
  hardLimits: Readonly<ScanLimits> = PRODUCTION_SCAN_LIMITS
): void {
  const observationCount = batch.observations.length;
  const maxPerBatch = Math.min(budgets.maxObservationsPerBatch, hardLimits.maxObservationsPerBatch);
  const maxBytes = Math.min(budgets.maxBatchBytes, hardLimits.maxBatchBytes);
  const maxExcerptBytes = Math.min(budgets.maxExcerptBytes, hardLimits.maxExcerptBytes);
  const maxPerSession = Math.min(budgets.maxObservationsPerSession, hardLimits.maxObservationsPerSession);
  if (observationCount > maxPerBatch) throw new Error("SCAN_BATCH_OBSERVATION_BUDGET_EXCEEDED");
  if (integrity.canonicalBytes > maxBytes) throw new Error("SCAN_BATCH_BYTE_BUDGET_EXCEEDED");
  if (batch.observations.some((observation) => observation.evidenceRefs.some((evidence) => evidence.excerpt !== undefined && Buffer.byteLength(evidence.excerpt, "utf8") > maxExcerptBytes))) {
    throw new Error("SCAN_EVIDENCE_EXCERPT_BUDGET_EXCEEDED");
  }
  if (currentObservationCount + observationCount > maxPerSession) throw new Error("SCAN_SESSION_OBSERVATION_BUDGET_EXCEEDED");
}

export function requireIdenticalBatchRetry(existing: PersistedBatchIdentity, batch: KnowledgeScanBatch) {
  const integrity = computeBatchIntegrity(batch);
  if (
    existing.sequence !== batch.sequence ||
    existing.previousBatchDigest !== batch.previousBatchDigest ||
    existing.batchDigest !== batch.batchDigest ||
    existing.payloadDigest !== integrity.payloadDigest ||
    existing.observationCount !== batch.observations.length ||
    existing.canonicalBytes !== integrity.canonicalBytes
  ) {
    throw new Error("SCAN_BATCH_SEQUENCE_CONFLICT");
  }
  return {
    acceptedSequence: existing.sequence,
    acceptedBatchDigest: existing.batchDigest,
    idempotent: true,
    acceptanceReceipt: existing.acceptanceReceipt ?? null
  };
}

export async function submitScanBatch(input: SubmitScanBatchInput) {
  const contract = await loadScanContract();
  const batch = contract.validateScanBatch(input.batch);
  await ensureMcpPersistenceSchema();
  return prisma.$transaction(async (tx) => {
    const session = await findAndLockSession(tx, batch.sessionId);
    const scope = { applicationServiceId: session.applicationServiceId, scopePath: session.scopePath };
    assertScanSessionScope(scope, input.architectureScope);
    assertScanSessionScope(scope, batch.architectureScope);
    if (session.actorId !== writableActor().actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
    const release = await tx.scannerRelease.findUnique({ where: { id: session.scannerReleaseId } });
    if (!release) throw new Error("SCANNER_RELEASE_NOT_FOUND");
    assertScannerReleaseAvailable(release);
    if (release.contractVersion !== batch.contractVersion || session.contractVersion !== batch.contractVersion) throw new Error("SCAN_CONTRACT_VERSION_MISMATCH");
    verifySessionNonceDigest(session.nonceDigest, batch.sessionNonceDigest);

    const existing = await tx.knowledgeScanBatch.findUnique({
      where: { applicationServiceId_scopePath_sessionId_sequence: { ...scope, sessionId: session.id, sequence: batch.sequence } }
    });
    if (existing) return requireIdenticalBatchRetry(existing, batch);

    assertScanSessionWritable(session, writableActor().actorId);

    const integrity = computeBatchIntegrity(batch);
    if (integrity.batchDigest !== batch.batchDigest) throw new Error("SCAN_BATCH_DIGEST_MISMATCH");
    assertBatchSequence(session, batch);
    assertBatchBudgets(readBudgets(session.budgets, contract.SCAN_LIMITS), session.observationCount, batch, integrity, contract.SCAN_LIMITS);
    assertUniqueObservationIds(batch.observations);

    const observationIds = batch.observations.map((observation) => observationRecordId(session.id, observation.id));
    const duplicateObservation = await tx.sourceObservation.findFirst({ where: { ...scope, id: { in: observationIds } }, select: { id: true } });
    if (duplicateObservation) throw new Error("SCAN_SESSION_DUPLICATE_OBSERVATION_ID");

    const acceptedAt = new Date();
    const acceptanceReceipt = {
      sessionId: session.id,
      sequence: batch.sequence,
      previousBatchDigest: batch.previousBatchDigest,
      batchDigest: batch.batchDigest,
      payloadDigest: integrity.payloadDigest,
      observationCount: batch.observations.length,
      acceptedAt: acceptedAt.toISOString()
    };
    await tx.sourceObservation.createMany({
      data: batch.observations.map((observation) => observationRow(scope, session, batch, observation, acceptedAt))
    });
    await tx.knowledgeScanBatch.create({
      data: {
        ...scope,
        sessionId: session.id,
        sequence: batch.sequence,
        previousBatchDigest: batch.previousBatchDigest,
        batchDigest: batch.batchDigest,
        payloadDigest: integrity.payloadDigest,
        observationCount: batch.observations.length,
        canonicalBytes: integrity.canonicalBytes,
        status: "ACCEPTED",
        acceptanceReceipt: jsonValue(acceptanceReceipt),
        acceptedAt
      }
    });
    await tx.knowledgeScanSession.update({
      where: { dbId: session.dbId },
      data: {
        status: "RECEIVING",
        acceptedSequence: batch.sequence,
        acceptedBatchDigest: batch.batchDigest,
        observationCount: { increment: batch.observations.length }
      }
    });
    return {
      acceptedSequence: batch.sequence,
      acceptedBatchDigest: batch.batchDigest,
      idempotent: false,
      acceptanceReceipt
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function findAndLockSession(tx: Prisma.TransactionClient, sessionId: string) {
  const session = await findSessionByOpaqueId(tx, sessionId);
  await tx.$queryRaw`SELECT "dbId" FROM "KnowledgeScanSession" WHERE "dbId" = ${session.dbId}::uuid FOR UPDATE`;
  return tx.knowledgeScanSession.findUniqueOrThrow({ where: { dbId: session.dbId } });
}

function observationRow(
  scope: ArchitectureScopeRef,
  session: { id: string; connectorId: string; scannerReleaseId: string },
  batch: KnowledgeScanBatch,
  observation: SourceObservationV2,
  acceptedAt: Date
) {
  const id = observationRecordId(session.id, observation.id);
  return {
    ...scope,
    id,
    connectorId: session.connectorId,
    sourceNamespace: "knowledge-scan-v2",
    externalAssetType: observation.observationType,
    externalId: `${session.id}:${observation.id}`,
    payload: jsonValue({ ...observation, scanSessionId: session.id, batchSequence: batch.sequence }),
    normalizedDigest: observation.normalizedDigest,
    sourceVersion: `${session.scannerReleaseId}:${observation.repository.snapshotDigest}`,
    observedAt: acceptedAt,
    status: "CANDIDATE",
    provenance: jsonValue({
      sourceSystem: "local-scanner",
      connectorInstanceId: session.connectorId,
      scanSessionId: session.id,
      batchSequence: batch.sequence,
      repository: observation.repository,
      parser: observation.parser,
      sensitivity: observation.sensitivity,
      redaction: observation.redaction
    }),
    idempotencyKey: `scan-batch:${session.id}:${batch.sequence}:${observation.id}`
  };
}

function observationRecordId(sessionId: string, observationId: string): string {
  return `source:${sessionId}:${observationId}`;
}

function readBudgets(value: Prisma.JsonValue, hardLimits: Readonly<ScanLimits>): ScanLimits {
  const budgets = value as Partial<ScanLimits>;
  return {
    maxObservationsPerBatch: numericBudget(budgets.maxObservationsPerBatch, hardLimits.maxObservationsPerBatch),
    maxBatchBytes: numericBudget(budgets.maxBatchBytes, hardLimits.maxBatchBytes),
    maxExcerptBytes: numericBudget(budgets.maxExcerptBytes, hardLimits.maxExcerptBytes, true),
    maxSourceFileBytes: numericBudget(budgets.maxSourceFileBytes, hardLimits.maxSourceFileBytes),
    maxObservationsPerSession: numericBudget(budgets.maxObservationsPerSession, hardLimits.maxObservationsPerSession)
  };
}

async function loadScanContract(): Promise<{
  SCAN_LIMITS: Readonly<ScanLimits>;
  validateScanBatch(value: unknown): KnowledgeScanBatch;
}> {
  const packageName = "@specforge/scan-contract";
  return import(packageName) as Promise<{
    SCAN_LIMITS: Readonly<ScanLimits>;
    validateScanBatch(value: unknown): KnowledgeScanBatch;
  }>;
}

function numericBudget(value: unknown, fallback: number, allowZero = false): number {
  return typeof value === "number" && Number.isInteger(value) && (value > 0 || (allowZero && value === 0)) ? value : fallback;
}

function assertUniqueObservationIds(observations: SourceObservationV2[]): void {
  if (new Set(observations.map((observation) => observation.id)).size !== observations.length) {
    throw new Error("SCAN_BATCH_DUPLICATE_OBSERVATION_ID");
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("CANONICAL_JSON_VALUE_INVALID");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
