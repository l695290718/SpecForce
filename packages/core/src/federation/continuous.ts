import type { ArchitectureScopeRef } from "../architecture/types";
import { contentDigest } from "./digest";

export const CONTINUOUS_OBSERVATION_CONTRACT_VERSION = "continuous-observation/v1";
export const CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION = "continuous-observation/v2";
export const CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE = 500;
export const CONTINUOUS_OBSERVATION_MAX_BATCH_BYTES = 4_194_304;

export type ObservationRunMode = "FULL_SNAPSHOT" | "DELTA";
export type ObservationOperation = "UPSERT" | "TOMBSTONE";

export interface ContinuousObservation {
  id: string;
  externalAssetType: string;
  externalId: string;
  payload: Record<string, unknown>;
  sourceVersion: string;
  observedAt?: string;
}

export interface ContinuousObservationBatch {
  contractVersion: string;
  architectureScope: ArchitectureScopeRef;
  connectorId: string;
  sourceNamespace: string;
  sequence: number;
  previousBatchDigest: string | null;
  sourceCursor: string | null;
  observedAt: string;
  observations: ContinuousObservation[];
  coverage: Record<string, unknown>;
  payloadDigest: string;
  batchDigest: string;
}

export interface ContinuousObservationV2 {
  id: string;
  operation: ObservationOperation;
  externalAssetType: string;
  externalId: string;
  payload?: Record<string, unknown>;
  deletionReason?: string;
  sourceVersion: string;
  observedAt?: string;
}

export interface ContinuousObservationBatchV2 {
  contractVersion: typeof CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION;
  architectureScope: ArchitectureScopeRef;
  connectorId: string;
  sourceNamespace: string;
  runId: string;
  fencingToken: string;
  mode: ObservationRunMode;
  snapshotId: string | null;
  mappingVersion: string;
  mappingDigest: string;
  inventoryBoundaryDigest: string;
  sequence: number;
  previousBatchDigest: string | null;
  pageIndex: number;
  isLastPage: boolean;
  sourceCursor: string | null;
  sourceHighWaterMark: string | null;
  observedAt: string;
  coverage: Record<string, unknown>;
  observations: ContinuousObservationV2[];
  payloadDigest: string;
  batchDigest: string;
}

export interface ContinuousObservationCheckpoint {
  acceptedSequence: number;
  acceptedBatchDigest: string | null;
  sourceCursor: string | null;
}

export interface ContinuousBatchIntegrity {
  payloadDigest: string;
  batchDigest: string;
  canonicalBytes: number;
}

export interface ContinuousObservationBatchV2Integrity extends ContinuousBatchIntegrity {}

export function computeContinuousBatchIntegrity(batch: Omit<ContinuousObservationBatch, "payloadDigest" | "batchDigest"> | ContinuousObservationBatch): ContinuousBatchIntegrity {
  const payloadDigest = contentDigest({ observations: batch.observations, coverage: batch.coverage });
  const batchDigest = contentDigest({
    contractVersion: batch.contractVersion,
    architectureScope: batch.architectureScope,
    connectorId: batch.connectorId,
    sourceNamespace: batch.sourceNamespace,
    sequence: batch.sequence,
    previousBatchDigest: batch.previousBatchDigest,
    sourceCursor: batch.sourceCursor,
    observedAt: batch.observedAt,
    payloadDigest
  });
  return {
    payloadDigest,
    batchDigest,
    canonicalBytes: new TextEncoder().encode(JSON.stringify(batch)).byteLength
  };
}

export function assertContinuousBatchShape(batch: ContinuousObservationBatch): void {
  if (batch.contractVersion !== CONTINUOUS_OBSERVATION_CONTRACT_VERSION) throw new Error("OBSERVATION_BATCH_CONTRACT_UNSUPPORTED");
  if (!Number.isInteger(batch.sequence) || batch.sequence < 0) throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
  if (!batch.connectorId || !batch.sourceNamespace || !batch.observedAt) throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
  if (!Array.isArray(batch.observations) || batch.observations.length > CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE) throw new Error("OBSERVATION_BATCH_BUDGET_EXCEEDED");
  const identities = new Set<string>();
  for (const observation of batch.observations) {
    if (!observation.id || !observation.externalAssetType || !observation.externalId || !observation.sourceVersion || typeof observation.payload !== "object" || observation.payload === null || Array.isArray(observation.payload)) {
      throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
    }
    const identity = `${observation.externalAssetType}:${observation.externalId}:${observation.sourceVersion}`;
    if (identities.has(identity)) throw new Error("OBSERVATION_BATCH_DUPLICATE_IDENTITY");
    identities.add(identity);
  }
}

export function assertContinuousBatchIntegrity(batch: ContinuousObservationBatch): ContinuousBatchIntegrity {
  assertContinuousBatchShape(batch);
  const integrity = computeContinuousBatchIntegrity(batch);
  if (integrity.payloadDigest !== batch.payloadDigest || integrity.batchDigest !== batch.batchDigest) throw new Error("OBSERVATION_BATCH_DIGEST_MISMATCH");
  if (integrity.canonicalBytes > CONTINUOUS_OBSERVATION_MAX_BATCH_BYTES) throw new Error("OBSERVATION_BATCH_BUDGET_EXCEEDED");
  return integrity;
}

export function assertContinuousBatchSequence(checkpoint: ContinuousObservationCheckpoint, batch: Pick<ContinuousObservationBatch, "sequence" | "previousBatchDigest">): void {
  if (batch.sequence !== checkpoint.acceptedSequence + 1) throw new Error("OBSERVATION_BATCH_SEQUENCE_GAP");
  if (batch.previousBatchDigest !== checkpoint.acceptedBatchDigest) throw new Error("OBSERVATION_BATCH_CHAIN_MISMATCH");
}

export function computeContinuousObservationBatchV2Integrity(batch: Omit<ContinuousObservationBatchV2, "payloadDigest" | "batchDigest"> | ContinuousObservationBatchV2): ContinuousObservationBatchV2Integrity {
  const payloadDigest = contentDigest({ observations: batch.observations, coverage: batch.coverage });
  const batchDigest = contentDigest({
    contractVersion: batch.contractVersion,
    architectureScope: batch.architectureScope,
    connectorId: batch.connectorId,
    sourceNamespace: batch.sourceNamespace,
    runId: batch.runId,
    fencingToken: batch.fencingToken,
    mode: batch.mode,
    snapshotId: batch.snapshotId,
    mappingVersion: batch.mappingVersion,
    mappingDigest: batch.mappingDigest,
    inventoryBoundaryDigest: batch.inventoryBoundaryDigest,
    sequence: batch.sequence,
    previousBatchDigest: batch.previousBatchDigest,
    pageIndex: batch.pageIndex,
    isLastPage: batch.isLastPage,
    sourceCursor: batch.sourceCursor,
    sourceHighWaterMark: batch.sourceHighWaterMark,
    observedAt: batch.observedAt,
    payloadDigest
  });
  return {
    payloadDigest,
    batchDigest,
    canonicalBytes: new TextEncoder().encode(JSON.stringify(batch)).byteLength
  };
}

export function assertContinuousObservationBatchV2(batch: ContinuousObservationBatchV2): void {
  if (batch.contractVersion !== CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION) throw new Error("OBSERVATION_BATCH_CONTRACT_UNSUPPORTED");
  if (!batch.architectureScope?.applicationServiceId || !batch.architectureScope.scopePath) throw new Error("OBSERVATION_BATCH_SCOPE_REQUIRED");
  if (!batch.connectorId || !batch.sourceNamespace || !batch.runId || !batch.fencingToken) throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
  if (!batch.mappingVersion || !batch.mappingDigest || !batch.inventoryBoundaryDigest) throw new Error("OBSERVATION_BATCH_MAPPING_REQUIRED");
  if (!Number.isInteger(batch.sequence) || batch.sequence < 0 || !Number.isInteger(batch.pageIndex) || batch.pageIndex < 0) throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
  if (!batch.observedAt || !batch.sourceNamespace || !Array.isArray(batch.observations)) throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
  if (batch.observations.length > CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE) throw new Error("OBSERVATION_BATCH_BUDGET_EXCEEDED");
  if (batch.mode === "FULL_SNAPSHOT" && !batch.snapshotId) throw new Error("SNAPSHOT_ID_REQUIRED");
  if (batch.mode === "DELTA" && batch.snapshotId !== null) throw new Error("DELTA_SNAPSHOT_UNSUPPORTED");
  const identities = new Set<string>();
  for (const observation of batch.observations) {
    if (!observation.id || !observation.externalAssetType || !observation.externalId || !observation.sourceVersion) throw new Error("OBSERVATION_BATCH_INPUT_INVALID");
    const identity = `${observation.externalAssetType}:${observation.externalId}`;
    if (identities.has(identity)) throw new Error("OBSERVATION_BATCH_DUPLICATE_IDENTITY");
    identities.add(identity);
    if (observation.operation === "TOMBSTONE") {
      if (observation.payload !== undefined) throw new Error("TOMBSTONE_PAYLOAD_FORBIDDEN");
      if (!observation.deletionReason) throw new Error("TOMBSTONE_REASON_REQUIRED");
    } else if (!observation.payload || typeof observation.payload !== "object" || Array.isArray(observation.payload)) {
      throw new Error("UPSERT_PAYLOAD_REQUIRED");
    }
  }
}

export function assertContinuousObservationBatchV2Integrity(batch: ContinuousObservationBatchV2): ContinuousObservationBatchV2Integrity {
  assertContinuousObservationBatchV2(batch);
  const integrity = computeContinuousObservationBatchV2Integrity(batch);
  if (integrity.payloadDigest !== batch.payloadDigest || integrity.batchDigest !== batch.batchDigest) throw new Error("OBSERVATION_BATCH_DIGEST_MISMATCH");
  if (integrity.canonicalBytes > CONTINUOUS_OBSERVATION_MAX_BATCH_BYTES) throw new Error("OBSERVATION_BATCH_BUDGET_EXCEEDED");
  return integrity;
}

export function assertSnapshotFinalizationInput(input: { mode: ObservationRunMode; snapshotId: string | null; inventoryBoundaryDigest: string; complete: boolean; isLastPage: boolean }): void {
  if (input.mode !== "FULL_SNAPSHOT" || !input.snapshotId) throw new Error("SNAPSHOT_ID_REQUIRED");
  if (!input.inventoryBoundaryDigest) throw new Error("SNAPSHOT_BOUNDARY_REQUIRED");
  if (!input.complete || !input.isLastPage) throw new Error("SNAPSHOT_NOT_COMPLETE");
}
