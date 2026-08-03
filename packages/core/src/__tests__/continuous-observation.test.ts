import { describe, expect, it } from "vitest";
import {
  assertContinuousBatchIntegrity,
  assertContinuousBatchSequence,
  computeContinuousBatchIntegrity,
  CONTINUOUS_OBSERVATION_CONTRACT_VERSION,
  type ContinuousObservationBatch
} from "../federation/continuous";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;

function batch(overrides: Partial<ContinuousObservationBatch> = {}): ContinuousObservationBatch {
  const base = {
    contractVersion: CONTINUOUS_OBSERVATION_CONTRACT_VERSION,
    architectureScope: scope,
    connectorId: "repository-connector",
    sourceNamespace: "github",
    sequence: 0,
    previousBatchDigest: null,
    sourceCursor: "commit:1",
    observedAt: "2026-08-03T10:00:00.000Z",
    observations: [{ id: "api-1", externalAssetType: "api", externalId: "payments", payload: { method: "GET" }, sourceVersion: "commit-1" }],
    coverage: { complete: true },
    payloadDigest: "",
    batchDigest: ""
  } satisfies ContinuousObservationBatch;
  const integrity = computeContinuousBatchIntegrity(base);
  return { ...base, payloadDigest: integrity.payloadDigest, batchDigest: integrity.batchDigest, ...overrides };
}

describe("continuous observation contract", () => {
  it("computes a stable payload and hash-chain digest", () => {
    const first = batch();
    const second = batch();
    expect(first.payloadDigest).toBe(second.payloadDigest);
    expect(first.batchDigest).toBe(second.batchDigest);
    expect(assertContinuousBatchIntegrity(first).batchDigest).toBe(first.batchDigest);
  });

  it("requires the immediate next sequence and previous digest", () => {
    const first = batch();
    expect(() => assertContinuousBatchSequence({ acceptedSequence: -1, acceptedBatchDigest: null, sourceCursor: null }, first)).not.toThrow();
    expect(() => assertContinuousBatchSequence({ acceptedSequence: -1, acceptedBatchDigest: null, sourceCursor: null }, { ...first, sequence: 2 })).toThrowError("OBSERVATION_BATCH_SEQUENCE_GAP");
    expect(() => assertContinuousBatchSequence({ acceptedSequence: 0, acceptedBatchDigest: first.batchDigest, sourceCursor: first.sourceCursor }, { ...first, sequence: 1, previousBatchDigest: "wrong" })).toThrowError("OBSERVATION_BATCH_CHAIN_MISMATCH");
  });

  it("rejects duplicate external identity inside one batch", () => {
    const first = batch();
    const duplicate = {
      ...first,
      observations: [first.observations[0]!, { ...first.observations[0]!, id: "api-2" }]
    } satisfies ContinuousObservationBatch;
    const integrity = computeContinuousBatchIntegrity(duplicate);
    expect(() => assertContinuousBatchIntegrity({ ...duplicate, ...integrity })).toThrowError("OBSERVATION_BATCH_DUPLICATE_IDENTITY");
  });
});
