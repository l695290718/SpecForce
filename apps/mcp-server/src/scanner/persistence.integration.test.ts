import { buildScanReport, scopeById } from "@specforge/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerConnector } from "../federation/persistence";
import { disconnectMcpPersistence, prisma } from "../persistence";
import { createDesignChangeSession } from "../federation/persistence";
import { submitScanReport } from "./persistence";
import { generateKnowledgeCandidates } from "../knowledge/semantic-persistence";
import { matchKnowledgeIdentities } from "../knowledge/identity-persistence";

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

  it("generates scoped semantic candidates and an idempotent ReviewBundle", async () => {
    await registerConnector({ id: `${prefix}-semantic-connector`, kind: "local-scanner", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope });
    const session = await createDesignChangeSession({ id: `${prefix}-semantic-session`, actorId: "semantic-agent", intent: "Generate semantic candidates", affectedFactIds: [`${prefix}-semantic-pending`], expectedEvidenceRefs: [`${prefix}-semantic-report`], status: "OPEN", architectureScope });
    const report = semanticReport();
    await submitScanReport({ id: `${prefix}-semantic-report`, connectorId: `${prefix}-semantic-connector`, designChangeSessionId: session.id, architectureScope, report });

    const generated = await generateKnowledgeCandidates({ scanReportId: `${prefix}-semantic-report`, architectureScope, provider: "mock" });
    const retried = await generateKnowledgeCandidates({ scanReportId: `${prefix}-semantic-report`, architectureScope, provider: "mock" });

    expect(generated.provider).toBe("mock");
    expect(generated.assertionIds).toHaveLength(2);
    expect(generated.reviewBundle.status).toBe("READY");
    expect(retried.reviewBundle.id).toBe(generated.reviewBundle.id);
    const assertions = await prisma.knowledgeAssertion.findMany({ where: { ...architectureScope, id: { startsWith: `knowledge:${report.reportDigest}:` } } });
    expect(assertions).toHaveLength(2);
    expect(assertions.every((assertion) => assertion.status === "CANDIDATE")).toBe(true);
    expect(await prisma.federationOutbox.count({ where: { ...architectureScope, idempotencyKey: `semantic-candidates:${report.reportDigest}` } })).toBe(1);
  }, 30000);

  it("creates deterministic identity candidates, excludes sibling Scope assets, and blocks ambiguity", async () => {
    const siblingScope = scopeById("com.huawei.celon.policyhub")!;
    const siblingArchitectureScope = { applicationServiceId: siblingScope.id, scopePath: siblingScope.scopePath };
    const connectorId = `${prefix}-identity-connector`;
    const sessionId = `${prefix}-identity-session`;
    const report = identityReport();
    await registerConnector({ id: connectorId, kind: "local-scanner", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope });
    await createDesignChangeSession({ id: sessionId, actorId: "identity-agent", intent: "Match scanned API identity", affectedFactIds: [`${prefix}-identity-pending`], expectedEvidenceRefs: [`${prefix}-identity-report`], status: "OPEN", architectureScope });
    await submitScanReport({ id: `${prefix}-identity-report`, connectorId, designChangeSessionId: sessionId, architectureScope, report });
    await generateKnowledgeCandidates({ scanReportId: `${prefix}-identity-report`, architectureScope, provider: "mock" });
    await prisma.designAsset.create({ data: { id: `${prefix}-orders-api`, type: "api", name: "Orders API", code: "orders", description: "", domainId: null, applicationServiceId: architectureScope.applicationServiceId, scopePath: architectureScope.scopePath, payload: JSON.stringify({ id: `${prefix}-orders-api`, name: "Orders API", code: "orders" }), createdAt: new Date(), updatedAt: new Date() } });
    await prisma.designAsset.create({ data: { id: `${prefix}-sibling-orders-api`, type: "api", name: "Orders API", code: "orders", description: "", domainId: null, applicationServiceId: siblingArchitectureScope.applicationServiceId, scopePath: siblingArchitectureScope.scopePath, payload: JSON.stringify({ id: `${prefix}-sibling-orders-api`, name: "Orders API", code: "orders" }), createdAt: new Date(), updatedAt: new Date() } });

    const unique = await matchKnowledgeIdentities({ scanReportId: `${prefix}-identity-report`, architectureScope });
    const retried = await matchKnowledgeIdentities({ scanReportId: `${prefix}-identity-report`, architectureScope });
    expect(unique.decisions).toEqual({ UNMATCHED: 0, UNAMBIGUOUS: 1, AMBIGUOUS: 0 });
    expect(unique.reviewBundle.status).toBe("READY");
    expect(retried.identityCandidateIds).toEqual(unique.identityCandidateIds);
    expect(await prisma.identityCandidate.count({ where: { ...architectureScope, id: { startsWith: `identity:${report.reportDigest}:` } } })).toBe(1);
    expect((await prisma.identityCandidate.findFirst({ where: { ...architectureScope, id: { startsWith: `identity:${report.reportDigest}:` } } }))?.targetAssetId).toBe(`${prefix}-orders-api`);

    await prisma.designAsset.create({ data: { id: `${prefix}-orders-api-legacy`, type: "api", name: "Orders API Legacy", code: "orders", description: "", domainId: null, applicationServiceId: architectureScope.applicationServiceId, scopePath: architectureScope.scopePath, payload: JSON.stringify({ id: `${prefix}-orders-api-legacy`, name: "Orders API Legacy", code: "orders" }), createdAt: new Date(), updatedAt: new Date() } });
    const ambiguous = await matchKnowledgeIdentities({ scanReportId: `${prefix}-identity-report`, architectureScope });
    expect(ambiguous.decisions).toEqual({ UNMATCHED: 0, UNAMBIGUOUS: 0, AMBIGUOUS: 1 });
    expect(ambiguous.reviewBundle.status).toBe("BLOCKED");
    expect(ambiguous.reviewBundle.blockingIssues).toContain(`IDENTITY_AMBIGUOUS:contracts/openapi-orders.yaml`);
    expect(await prisma.identityCandidate.count({ where: { ...architectureScope, id: { startsWith: `identity:${report.reportDigest}:` } } })).toBe(2);
  }, 30000);
});

async function deleteFixtures(): Promise<void> {
  await prisma.sourceObservation.deleteMany({ where: { ...architectureScope, connectorId: { startsWith: prefix } } });
  const reportDigest = semanticReport().reportDigest;
  const identityDigest = identityReport().reportDigest;
  await prisma.knowledgeReviewBundle.deleteMany({ where: { ...architectureScope, id: `knowledge-review:${reportDigest}` } });
  await prisma.knowledgeReviewBundle.deleteMany({ where: { ...architectureScope, id: `knowledge-review:${identityDigest}` } });
  await prisma.knowledgeAssertion.deleteMany({ where: { ...architectureScope, id: { startsWith: `knowledge:${reportDigest}:` } } });
  await prisma.knowledgeAssertion.deleteMany({ where: { ...architectureScope, id: { startsWith: `knowledge:${identityDigest}:` } } });
  await prisma.identityCandidate.deleteMany({ where: { ...architectureScope, id: { startsWith: `identity:${identityDigest}:` } } });
  await prisma.knowledgeScanReport.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.federationOutbox.deleteMany({ where: { ...architectureScope, OR: [{ idempotencyKey: { startsWith: "scan-report:" } }, { idempotencyKey: `semantic-candidates:${reportDigest}` }, { idempotencyKey: `scan-report:${identityDigest}` }, { idempotencyKey: `semantic-candidates:${identityDigest}` }, { idempotencyKey: `identity-candidates:${identityDigest}` }] } });
  await prisma.designAsset.deleteMany({ where: { id: { startsWith: prefix } } });
  await prisma.designChangeSession.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.connectorInstance.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
}

function semanticReport() {
  return buildScanReport({ rootLabel: "semantic-fixture", architectureScope, generatedAt: "2026-08-02T00:00:00.000Z", files: [
    { path: "src/orders.ts", content: "export const orders = true;", sizeBytes: 28 },
    { path: "contracts/openapi-orders.yaml", content: "openapi: 3.0.0", sizeBytes: 15 }
  ] });
}

function identityReport() {
  return buildScanReport({ rootLabel: "identity-fixture", architectureScope, generatedAt: "2026-08-02T00:00:00.000Z", files: [
    { path: "contracts/openapi-orders.yaml", content: "openapi: 3.0.0", sizeBytes: 15 }
  ] });
}
