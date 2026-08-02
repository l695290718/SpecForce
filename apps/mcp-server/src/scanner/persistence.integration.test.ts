import { buildScanReport, scopeById } from "@specforge/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerConnector } from "../federation/persistence";
import { disconnectMcpPersistence, prisma } from "../persistence";
import { createDesignChangeSession } from "../federation/persistence";
import { submitScanReport } from "./persistence";

const integrationEnabled = process.env.SPECFORGE_KNOWLEDGE_INTEGRATION === "1";
const scope = scopeById("com.huawei.celon.desiner")!;
const architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
const prefix = "test-local-scanner";

describe.runIf(integrationEnabled)("local scanner MCP persistence", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await deleteFixtures();
  });

  afterAll(async () => {
    await deleteFixtures();
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
  });

  it("persists a deterministic source-minimized report and idempotent observations", async () => {
    await registerConnector({ id: `${prefix}-connector`, kind: "local-scanner", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope });
    const session = await createDesignChangeSession({ id: `${prefix}-session`, actorId: "scanner-agent", intent: "Scan existing service", affectedFactIds: [`${prefix}-pending`], expectedEvidenceRefs: [`${prefix}-report`], status: "OPEN", architectureScope });
    const report = buildScanReport({ rootLabel: "fixture", architectureScope, generatedAt: "2026-08-02T00:00:00.000Z", files: [
      { path: "src/orders.ts", content: "export const orders = true;", sizeBytes: 28 },
      { path: "contracts/openapi-orders.yaml", content: "openapi: 3.0.0", sizeBytes: 15 }
    ] });
    const stored = await submitScanReport({ id: `${prefix}-report`, connectorId: `${prefix}-connector`, designChangeSessionId: session.id, architectureScope, report });
    const retried = await submitScanReport({ id: `${prefix}-report`, connectorId: `${prefix}-connector`, designChangeSessionId: session.id, architectureScope, report });
    expect(stored.status).toBe("RECEIVED");
    expect(retried.reportDigest).toBe(stored.reportDigest);
    expect(await prisma.sourceObservation.count({ where: { ...architectureScope, connectorId: `${prefix}-connector` } })).toBe(2);
    expect(await prisma.federationOutbox.count({ where: { ...architectureScope, idempotencyKey: `scan-report:${report.reportDigest}` } })).toBe(1);
  }, 30000);
});

async function deleteFixtures(): Promise<void> {
  await prisma.sourceObservation.deleteMany({ where: { ...architectureScope, connectorId: { startsWith: prefix } } });
  await prisma.knowledgeScanReport.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.federationOutbox.deleteMany({ where: { ...architectureScope, idempotencyKey: { startsWith: "scan-report:" } } });
  await prisma.designChangeSession.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.connectorInstance.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
}
