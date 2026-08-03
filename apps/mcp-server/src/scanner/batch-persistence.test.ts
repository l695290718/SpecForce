import type { KnowledgeScanBatch } from "@specforge/scan-contract";
import { describe, expect, it } from "vitest";
import {
  assertBatchBudgets,
  assertBatchSequence,
  computeBatchIntegrity,
  requireIdenticalBatchRetry
} from "./batch-persistence";

function batch(sequence = 0, previousBatchDigest: string | null = null): KnowledgeScanBatch {
  const unsigned = {
    contractVersion: "2.0" as const,
    sessionId: "scan-session-1",
    sequence,
    previousBatchDigest,
    sessionNonceDigest: "1".repeat(64),
    architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" },
    observations: [{
      id: "observation-1",
      observationType: "api-operation",
      architectureLayer: "SYS" as const,
      aspectHint: "contract",
      repository: { repositoryId: "repo:test", snapshotKind: "COMMIT" as const, snapshotDigest: "2".repeat(64), commit: "abc123" },
      source: { path: "src/api.ts", symbol: "getOrder", lineStart: 1, lineEnd: 2 },
      parser: { id: "typescript-ast", version: "1.0.0" },
      payload: {},
      sensitivity: "INTERNAL" as const,
      redaction: { status: "NONE" as const, reasons: [] },
      evidenceRefs: [{ id: "evidence-1", kind: "CONTENT_ADDRESS" as const, digest: "3".repeat(64) }],
      normalizedDigest: "4".repeat(64),
      warnings: [],
      coverageGaps: []
    }],
    coverageDelta: { indexedFiles: 1, skippedFiles: 0, observationCount: 1, coverageGaps: [] }
  };
  return { ...unsigned, batchDigest: computeBatchIntegrity(unsigned).batchDigest };
}

describe("resumable batch persistence", () => {
  it("accepts the next digest-chain sequence and rejects gaps", () => {
    expect(() => assertBatchSequence({ acceptedSequence: -1, acceptedBatchDigest: null }, batch())).not.toThrow();
    expect(() => assertBatchSequence({ acceptedSequence: 0, acceptedBatchDigest: "a".repeat(64) }, batch(2, "a".repeat(64)))).toThrow("SCAN_BATCH_SEQUENCE_GAP");
    expect(() => assertBatchSequence({ acceptedSequence: 0, acceptedBatchDigest: "a".repeat(64) }, batch(1, "b".repeat(64)))).toThrow("SCAN_BATCH_CHAIN_MISMATCH");
  });

  it("treats only an identical sequence payload as an idempotent retry", () => {
    const accepted = batch();
    expect(requireIdenticalBatchRetry({
      sequence: accepted.sequence,
      previousBatchDigest: accepted.previousBatchDigest,
      batchDigest: accepted.batchDigest,
      payloadDigest: computeBatchIntegrity(accepted).payloadDigest,
      observationCount: accepted.observations.length,
      canonicalBytes: computeBatchIntegrity(accepted).canonicalBytes
    }, accepted)).toEqual(expect.objectContaining({ idempotent: true, acceptedSequence: 0 }));
    expect(() => requireIdenticalBatchRetry({
      sequence: 0,
      previousBatchDigest: null,
      batchDigest: "f".repeat(64),
      payloadDigest: "e".repeat(64),
      observationCount: 1,
      canonicalBytes: 1
    }, accepted)).toThrow("SCAN_BATCH_SEQUENCE_CONFLICT");
  });

  it("enforces per-batch and cumulative limits", () => {
    const accepted = batch();
    const integrity = computeBatchIntegrity(accepted);
    expect(() => assertBatchBudgets({ maxObservationsPerBatch: 1, maxBatchBytes: integrity.canonicalBytes, maxExcerptBytes: 8_192, maxObservationsPerSession: 2 }, 1, accepted, integrity)).not.toThrow();
    expect(() => assertBatchBudgets({ maxObservationsPerBatch: 1, maxBatchBytes: integrity.canonicalBytes, maxExcerptBytes: 8_192, maxObservationsPerSession: 1 }, 1, accepted, integrity)).toThrow("SCAN_SESSION_OBSERVATION_BUDGET_EXCEEDED");
  });

  it("enforces a zero excerpt disclosure budget", () => {
    const accepted = batch();
    accepted.observations[0]!.evidenceRefs[0] = { ...accepted.observations[0]!.evidenceRefs[0]!, kind: "SOURCE_EXCERPT", excerpt: "GET /orders" };
    const integrity = computeBatchIntegrity(accepted);

    expect(() => assertBatchBudgets({ maxObservationsPerBatch: 1, maxBatchBytes: integrity.canonicalBytes, maxExcerptBytes: 0, maxObservationsPerSession: 2 }, 0, accepted, integrity)).toThrow("SCAN_EVIDENCE_EXCERPT_BUDGET_EXCEEDED");
  });
});
