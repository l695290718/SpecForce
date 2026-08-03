import type { ArchitectureScopeRef } from "../architecture/types";
import { contentDigest } from "./digest";

export const CONTINUOUS_OBSERVATION_CONTRACT_VERSION = "continuous-observation/v1";
export const CONTINUOUS_OBSERVATION_MAX_BATCH_SIZE = 500;
export const CONTINUOUS_OBSERVATION_MAX_BATCH_BYTES = 4_194_304;

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
