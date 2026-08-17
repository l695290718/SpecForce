import { describe, expect, it } from "vitest";
import {
  assertContinuousObservationBatchV2,
  assertContinuousObservationBatchV2Integrity,
  assertSnapshotFinalizationInput,
  computeContinuousObservationBatchV2Integrity,
  CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION,
  type ContinuousObservationBatchV2
} from "../federation/continuous";

const architectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;

function batch(overrides: Partial<ContinuousObservationBatchV2> = {}): ContinuousObservationBatchV2 {
  const base = {
    contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION,
    architectureScope,
    connectorId: "postgres-schema",
    sourceNamespace: "postgres-schema-v1",
    runId: "run-1",
    fencingToken: "fence-1",
    mode: "FULL_SNAPSHOT",
    snapshotId: "snapshot-1",
    mappingVersion: "mapping-1",
    mappingDigest: "a".repeat(64),
    inventoryBoundaryDigest: "b".repeat(64),
    sequence: 0,
    previousBatchDigest: null,
    pageIndex: 0,
    isLastPage: true,
    sourceCursor: "catalog:1",
    sourceHighWaterMark: "catalog:1",
    observedAt: "2026-08-17T00:00:00.000Z",
    coverage: { complete: true },
    observations: [{ id: "table-1", operation: "UPSERT", externalAssetType: "table", externalId: "public.orders", payload: { columns: 3 }, sourceVersion: "catalog-1" }],
    payloadDigest: "",
    batchDigest: ""
  } satisfies ContinuousObservationBatchV2;
  const integrity = computeContinuousObservationBatchV2Integrity(base);
  return { ...base, ...integrity, ...overrides };
}

describe("continuous observation v2 contract", () => {
  it("covers run, lease, snapshot, mapping, and page fields in stable digests", () => {
    const first = batch();
    const second = batch();
    expect(first.batchDigest).toBe(second.batchDigest);
    expect(assertContinuousObservationBatchV2Integrity(first).batchDigest).toBe(first.batchDigest);
    expect(computeContinuousObservationBatchV2Integrity({ ...first, fencingToken: "fence-2", batchDigest: "", payloadDigest: "" }).batchDigest).not.toBe(first.batchDigest);
  });

  it("requires a snapshot for full observations and rejects a snapshot on delta", () => {
    expect(() => assertContinuousObservationBatchV2(batch({ snapshotId: null }))).toThrow("SNAPSHOT_ID_REQUIRED");
    expect(() => assertContinuousObservationBatchV2(batch({ mode: "DELTA", snapshotId: "snapshot-1" }))).toThrow("DELTA_SNAPSHOT_UNSUPPORTED");
  });

  it("requires tombstone reasons and forbids tombstone payloads", () => {
    expect(() => assertContinuousObservationBatchV2(batch({ observations: [{ id: "gone", operation: "TOMBSTONE", externalAssetType: "table", externalId: "public.old", sourceVersion: "catalog-2" }] }))).toThrow("TOMBSTONE_REASON_REQUIRED");
    expect(() => assertContinuousObservationBatchV2(batch({ observations: [{ id: "gone", operation: "TOMBSTONE", externalAssetType: "table", externalId: "public.old", sourceVersion: "catalog-2", deletionReason: "source-deleted", payload: {} }] }))).toThrow("TOMBSTONE_PAYLOAD_FORBIDDEN");
  });

  it("only permits finalization for a complete terminal full snapshot", () => {
    expect(() => assertSnapshotFinalizationInput({ mode: "FULL_SNAPSHOT", snapshotId: "snapshot-1", inventoryBoundaryDigest: "boundary", complete: false, isLastPage: true })).toThrow("SNAPSHOT_NOT_COMPLETE");
    expect(() => assertSnapshotFinalizationInput({ mode: "FULL_SNAPSHOT", snapshotId: "snapshot-1", inventoryBoundaryDigest: "boundary", complete: true, isLastPage: true })).not.toThrow();
  });
});
