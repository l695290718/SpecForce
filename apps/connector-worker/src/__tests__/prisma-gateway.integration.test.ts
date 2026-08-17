import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaConnectorWorkerGateway } from "../prisma-gateway";
import { prisma } from "@specforge/mcp-server/persistence";
import { createConnectorRun } from "@specforge/mcp-server/connectors/v2-persistence";

const enabled = process.env.SPECFORGE_CONTINUOUS_INTEGRATION === "1";
const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" } as const;
const prefix = `gateway-${process.pid}`;
const connectorId = `${prefix}-connector`;
const runId = `${prefix}-run`;

describe.runIf(enabled)("Prisma connector worker gateway", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    process.env.SPECFORGE_MCP_SEED_SCOPE = scope.applicationServiceId;
    await prisma.connectorInstance.create({ data: { ...scope, id: connectorId, kind: "postgres-schema", capabilities: ["OBSERVE"], status: "ACTIVE", configuration: { schemas: ["public"] } } });
    await createConnectorRun({ architectureScope: scope, id: runId, connectorId, sourceNamespace: "postgres-schema-v1", mode: "FULL_SNAPSHOT", snapshotId: `${prefix}-snapshot`, mappingVersion: "postgres-schema-v1", mappingDigest: "a".repeat(64), inventoryBoundaryDigest: "b".repeat(64) });
  });
  afterAll(async () => {
    await prisma.connectorLease.deleteMany({ where: { ...scope, connectorId } });
    await prisma.connectorRun.deleteMany({ where: { ...scope, id: runId } });
    await prisma.connectorInstance.deleteMany({ where: { ...scope, id: connectorId } });
    delete process.env.SPECFORGE_MCP_SEED;
    delete process.env.SPECFORGE_MCP_SEED_SCOPE;
  });
  it("lists and claims a run through the shared MCP persistence boundary", async () => {
    const gateway = new PrismaConnectorWorkerGateway({ architectureScope: scope });
    const runs = await gateway.listDueRuns(new Date(), 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ id: runId, kind: "postgres-schema", configuration: { schemas: ["public"] }, sourceNamespace: "postgres-schema-v1" });
    const claimed = await gateway.claimRun({ runId, owner: "integration-worker", now: new Date() });
    expect(claimed.fencingToken).toBeGreaterThan(0);
    expect(claimed.run.status).toBe("RUNNING");
  }, 30_000);
});
