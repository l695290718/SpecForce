import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeContinuousObservationBatchV2Integrity, CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION, type ContinuousObservationBatchV2 } from "@specforge/core";
import { prisma } from "../persistence";
import { claimConnectorRun, createConnectorRun, finalizeContinuousSnapshot, submitContinuousObservationBatchV2 } from "./v2-persistence";
import { registerConnector } from "../federation/persistence";

const integrationEnabled = process.env.SPECFORGE_CONTINUOUS_INTEGRATION === "1";
const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;
const prefix = `v2-persistence-${process.pid}`;
const connectorId = `${prefix}-connector`;
const sourceNamespace = `${prefix}-source`;
const boundary = `${prefix}-boundary`;
const mappingDigest = `${prefix}-mapping`;

function batch(input: { runId: string; fencingToken: number; sequence: number; previousBatchDigest: string | null; snapshotId: string; externalId: string; sourceVersion: string; inventoryBoundaryDigest?: string; isLastPage?: boolean }): ContinuousObservationBatchV2 {
  const base = {
    contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION,
    architectureScope: scope,
    connectorId,
    sourceNamespace,
    runId: input.runId,
    fencingToken: String(input.fencingToken),
    mode: "FULL_SNAPSHOT" as const,
    snapshotId: input.snapshotId,
    mappingVersion: "mapping-v1",
    mappingDigest,
    inventoryBoundaryDigest: input.inventoryBoundaryDigest ?? boundary,
    sequence: input.sequence,
    previousBatchDigest: input.previousBatchDigest,
    pageIndex: 0,
    isLastPage: input.isLastPage ?? true,
    sourceCursor: `cursor:${input.sequence}`,
    sourceHighWaterMark: input.sourceVersion,
    observedAt: "2026-08-17T00:00:00.000Z",
    coverage: { complete: input.isLastPage ?? true },
    observations: [{ id: `${input.runId}-${input.externalId}`, operation: "UPSERT" as const, externalAssetType: "table", externalId: input.externalId, payload: { sourceVersion: input.sourceVersion }, sourceVersion: input.sourceVersion }],
    payloadDigest: "",
    batchDigest: ""
  } satisfies ContinuousObservationBatchV2;
  return { ...base, ...computeContinuousObservationBatchV2Integrity(base) };
}

describe.runIf(integrationEnabled)("continuous observation v2 PostgreSQL persistence", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    process.env.SPECFORGE_MCP_SEED_SCOPE = scope.applicationServiceId;
    await registerConnector({ id: connectorId, kind: "postgres-schema", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope: scope });
  });

  afterAll(async () => {
    await prisma.connectorHealthSnapshot.deleteMany({ where: { ...scope, connectorId } });
    await prisma.connectorDeadLetter.deleteMany({ where: { ...scope, connectorId } });
    await prisma.connectorSnapshotIdentity.deleteMany({ where: { ...scope, runId: { startsWith: prefix } } });
    await prisma.connectorLease.deleteMany({ where: { ...scope, connectorId } });
    await prisma.connectorRun.deleteMany({ where: { ...scope, id: { startsWith: prefix } } });
    await prisma.sourceObservation.deleteMany({ where: { ...scope, connectorId, sourceNamespace } });
    await prisma.federationObservationBatch.deleteMany({ where: { ...scope, connectorId, sourceNamespace } });
    await prisma.federationObservationCursor.deleteMany({ where: { ...scope, connectorId, sourceNamespace } });
    await prisma.federationOutbox.deleteMany({ where: { ...scope, idempotencyKey: { contains: prefix } } });
    await prisma.connectorInstance.deleteMany({ where: { ...scope, id: connectorId } });
    delete process.env.SPECFORGE_MCP_SEED;
    delete process.env.SPECFORGE_MCP_SEED_SCOPE;
  });

  it("accepts a complete snapshot, finalizes it, and produces same-boundary tombstones", async () => {
    const firstRunId = `${prefix}-run-1`;
    await createConnectorRun({ architectureScope: scope, id: firstRunId, connectorId, sourceNamespace, mode: "FULL_SNAPSHOT", snapshotId: "snapshot-1", mappingVersion: "mapping-v1", mappingDigest, inventoryBoundaryDigest: boundary });
    const firstLease = await claimConnectorRun({ architectureScope: scope, runId: firstRunId, owner: "worker-a" });
    const first = batch({ runId: firstRunId, fencingToken: firstLease.fencingToken, sequence: 0, previousBatchDigest: null, snapshotId: "snapshot-1", externalId: "public.old", sourceVersion: "source-1" });
    await expect(submitContinuousObservationBatchV2({ architectureScope: scope, batch: first })).resolves.toMatchObject({ status: "ACCEPTED", idempotent: false });
    await expect(submitContinuousObservationBatchV2({ architectureScope: scope, batch: first })).resolves.toMatchObject({ status: "ACCEPTED", idempotent: true });
    await finalizeContinuousSnapshot({ architectureScope: scope, runId: firstRunId, snapshotId: "snapshot-1", inventoryBoundaryDigest: boundary, sourceVersion: "source-1", observedAt: "2026-08-17T00:00:00.000Z" });

    const secondRunId = `${prefix}-run-2`;
    await createConnectorRun({ architectureScope: scope, id: secondRunId, connectorId, sourceNamespace, mode: "FULL_SNAPSHOT", snapshotId: "snapshot-2", mappingVersion: "mapping-v1", mappingDigest, inventoryBoundaryDigest: boundary });
    const secondLease = await claimConnectorRun({ architectureScope: scope, runId: secondRunId, owner: "worker-a" });
    const second = batch({ runId: secondRunId, fencingToken: secondLease.fencingToken, sequence: 1, previousBatchDigest: first.batchDigest, snapshotId: "snapshot-2", externalId: "public.new", sourceVersion: "source-2" });
    await submitContinuousObservationBatchV2({ architectureScope: scope, batch: second });
    const finalized = await finalizeContinuousSnapshot({ architectureScope: scope, runId: secondRunId, snapshotId: "snapshot-2", inventoryBoundaryDigest: boundary, sourceVersion: "source-2", observedAt: "2026-08-17T00:01:00.000Z" });

    expect(finalized).toMatchObject({ status: "SUCCEEDED", tombstoneCount: 1 });
    expect(await prisma.sourceObservation.findFirst({ where: { ...scope, connectorId, sourceNamespace, externalId: "public.old", operation: "TOMBSTONE" } })).toBeTruthy();
  }, 30_000);

  it("rejects stale fencing and never infers deletion across a changed boundary", async () => {
    const runId = `${prefix}-run-3`;
    await createConnectorRun({ architectureScope: scope, id: runId, connectorId, sourceNamespace, mode: "FULL_SNAPSHOT", snapshotId: "snapshot-3", mappingVersion: "mapping-v1", mappingDigest, inventoryBoundaryDigest: `${boundary}-changed` });
    const lease = await claimConnectorRun({ architectureScope: scope, runId, owner: "worker-b" });
    const cursor = await prisma.federationObservationCursor.findUnique({ where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scope, connectorId, sourceNamespace } } });
    const current = batch({ runId, fencingToken: lease.fencingToken, sequence: 2, previousBatchDigest: cursor?.acceptedBatchDigest ?? null, snapshotId: "snapshot-3", externalId: "public.newer", sourceVersion: "source-3", inventoryBoundaryDigest: `${boundary}-changed` });
    const stale = { ...current, fencingToken: String(lease.fencingToken - 1), payloadDigest: "", batchDigest: "" };
    await expect(submitContinuousObservationBatchV2({ architectureScope: scope, batch: { ...stale, ...computeContinuousObservationBatchV2Integrity(stale) } })).rejects.toThrow("CONNECTOR_FENCING_TOKEN_INVALID");
    await submitContinuousObservationBatchV2({ architectureScope: scope, batch: current });
    const result = await finalizeContinuousSnapshot({ architectureScope: scope, runId, snapshotId: "snapshot-3", inventoryBoundaryDigest: `${boundary}-changed`, sourceVersion: "source-3", observedAt: "2026-08-17T00:02:00.000Z" });
    expect(result.tombstoneCount).toBe(0);
  }, 30_000);
});
