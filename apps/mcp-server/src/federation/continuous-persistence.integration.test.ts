import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeContinuousBatchIntegrity, CONTINUOUS_OBSERVATION_CONTRACT_VERSION } from "@specforge/core";
import { prisma } from "../persistence";
import { getContinuousObservationCursor, submitContinuousObservationBatch } from "./continuous-persistence";
import { registerConnector } from "./persistence";

const integrationEnabled = process.env.SPECFORGE_CONTINUOUS_INTEGRATION === "1";
const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;
const connectorId = `phase3-integration-${process.pid}`;
const sourceNamespace = "phase3-integration";

function makeBatch(sequence: number, previousBatchDigest: string | null) {
  const base = {
    contractVersion: CONTINUOUS_OBSERVATION_CONTRACT_VERSION,
    architectureScope: scope,
    connectorId,
    sourceNamespace,
    sequence,
    previousBatchDigest,
    sourceCursor: `cursor:${sequence}`,
    observedAt: `2026-08-03T10:0${sequence}:00.000Z`,
    observations: [{ id: `observation-${sequence}`, externalAssetType: "api", externalId: `phase3-api-${sequence}`, payload: { sequence }, sourceVersion: `version-${sequence}` }],
    coverage: { complete: true },
    payloadDigest: "",
    batchDigest: ""
  };
  return { ...base, ...computeContinuousBatchIntegrity(base) };
}

describe.runIf(integrationEnabled)("continuous observation PostgreSQL transaction", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    process.env.SPECFORGE_MCP_SEED_SCOPE = scope.applicationServiceId;
    await registerConnector({ id: connectorId, kind: "integration-test", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope: scope });
  });

  afterAll(async () => {
    await prisma.federationOutbox.deleteMany({ where: { ...scope, eventType: "FEDERATION_CONTINUOUS_BATCH_ACCEPTED", payload: { path: ["connectorId"], equals: connectorId } } });
    await prisma.sourceObservation.deleteMany({ where: { ...scope, connectorId, sourceNamespace } });
    await prisma.federationObservationBatch.deleteMany({ where: { ...scope, connectorId, sourceNamespace } });
    await prisma.federationObservationCursor.deleteMany({ where: { ...scope, connectorId, sourceNamespace } });
    await prisma.connectorInstance.deleteMany({ where: { ...scope, id: connectorId } });
    delete process.env.SPECFORGE_MCP_SEED;
    delete process.env.SPECFORGE_MCP_SEED_SCOPE;
  });

  it("persists a batch, makes identical retry idempotent, and rejects a sequence gap", async () => {
    const first = makeBatch(0, null);
    const accepted = await submitContinuousObservationBatch({ architectureScope: scope, batch: first });
    expect(accepted).toMatchObject({ sequence: 0, status: "ACCEPTED", idempotent: false });

    const retry = await submitContinuousObservationBatch({ architectureScope: scope, batch: first });
    expect(retry).toMatchObject({ sequence: 0, status: "ACCEPTED", idempotent: true });

    const cursor = await getContinuousObservationCursor(scope, connectorId, sourceNamespace);
    expect(cursor).toMatchObject({ connectorId, sourceNamespace, acceptedSequence: 0, acceptedBatchDigest: first.batchDigest, sourceCursor: "cursor:0" });

    const skipped = makeBatch(2, first.batchDigest);
    await expect(submitContinuousObservationBatch({ architectureScope: scope, batch: skipped })).rejects.toThrowError("OBSERVATION_BATCH_SEQUENCE_GAP");
  });
});
