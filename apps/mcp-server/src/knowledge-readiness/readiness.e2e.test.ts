import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { ScopedPrincipal } from "@specforge/core";
import { prisma } from "../persistence";
import { readSystemKnowledge } from "./read";

const enabled = process.env.SPECFORGE_KNOWLEDGE_READINESS_E2E === "1";
const prefix = `readiness-e2e-${Date.now()}`;
const scope = {
  applicationServiceId: `e2e.${prefix}`,
  scopePath: `e2e/${prefix}`
};
const sourceNamespace = `${prefix}.source-code`;
const connectorId = `${prefix}.connector`;
const snapshotId = `${prefix}.snapshot`;
const baselineId = `${prefix}.baseline`;
const firstReconciliationRoot = `${prefix}.reconciliation.1`;
const secondReconciliationRoot = `${prefix}.reconciliation.2`;
const assetId = `${prefix}.asset`;
const subject = `${prefix}.agent`;
const now = new Date(Date.now() - 1_000);

const caller: ScopedPrincipal = {
  actorType: "agent",
  actorId: subject,
  subject,
  tenantId: "e2e",
  authSource: "seed",
  permissions: ["knowledge:consume"],
  grants: [{ scopeId: scope.applicationServiceId, action: "read" }],
  decisionRef: `${prefix}.decision`
};

const request = {
  architectureScope: scope,
  knowledgeProfile: "ARCHITECTURE_OVERVIEW" as const,
  selectors: [],
  purpose: "readiness lifecycle acceptance",
  locale: "en" as const,
  pageSize: 10
};

describe.runIf(enabled)("system knowledge readiness lifecycle", () => {
  beforeAll(async () => {
    await prisma.authoredCatalogCursor.create({ data: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, nextVersion: 1n } });
    await prisma.connectorInstance.create({ data: { id: connectorId, kind: "readiness-e2e-source", capabilities: ["OBSERVE"], configuration: { sourceRole: "SOURCE_CODE", sourceNamespace }, status: "ACTIVE", ...scope } });
    await prisma.connectorRun.create({ data: { id: `${prefix}.run`, connectorId, sourceNamespace, mode: "FULL_SNAPSHOT", snapshotId, mappingVersion: "mapping-v1", mappingDigest: "mapping-digest", inventoryBoundaryDigest: "boundary", status: "SUCCEEDED", startedAt: now, finishedAt: now, ...scope } });
    await prisma.federationObservationCursor.create({ data: { connectorId, sourceNamespace, contractVersion: "continuous-observation/v1", acceptedSequence: 0, acceptedBatchDigest: "batch-digest", status: "READY", lastObservedAt: now, lastCompletedSnapshotId: snapshotId, lastCompletedBoundaryDigest: "boundary", updatedAt: now, ...scope } });
    await prisma.knowledgeBaseline.create({ data: { id: baselineId, streamId: `${prefix}.stream`, changeSetId: `${prefix}.changes`, status: "PUBLISHED", manifest: { source: prefix }, publishedAt: now, ...scope } });
    await prisma.reconciliationSnapshot.create({ data: { root: firstReconciliationRoot, status: "CONVERGED", factDigests: [], issues: [], createdAt: now, ...scope } });
    await prisma.assetSearchProjection.create({ data: { assetType: "api", assetId, canonicalName: "Readiness E2E API", canonicalSummary: "A bounded readiness test asset.", localizedNameZh: "就绪验收 API", localizedSummaryZh: "有界就绪验收资产。", updatedAt: now, catalogVersion: 1n, contentDigest: "e2e-asset-digest", searchDocument: "readiness", ...scope } });
  });

  afterAll(async () => {
    await prisma.systemKnowledgeReadinessReceipt.deleteMany({ where: { ...scope } });
    await prisma.assetSearchProjection.deleteMany({ where: { ...scope } });
    await prisma.reconciliationSnapshot.deleteMany({ where: { ...scope } });
    await prisma.knowledgeBaseline.deleteMany({ where: { ...scope } });
    await prisma.federationObservationCursor.deleteMany({ where: { ...scope } });
    await prisma.connectorRun.deleteMany({ where: { ...scope } });
    await prisma.connectorInstance.deleteMany({ where: { ...scope } });
    await prisma.sourceObservation.deleteMany({ where: { ...scope } });
    await prisma.authoredCatalogCursor.deleteMany({ where: { ...scope } });
  });

  it("allows a converged generation, denies pending drift, then allows the next generation", async () => {
    const current = await readSystemKnowledge(prisma, request, caller, now);
    expect(current).toMatchObject({ accessDecision: "ALLOW", trustStatus: "SELF_CONTAINED", responseCompleteness: "COMPLETE" });
    expect(current.assets).toHaveLength(1);

    await prisma.sourceObservation.create({ data: { id: `${prefix}.pending`, connectorId, sourceNamespace, externalAssetType: "api", externalId: "pending", normalizedDigest: "pending-digest", sourceVersion: "2", observedAt: now, status: "CANDIDATE", idempotencyKey: `${prefix}.pending`, ...scope } });
    const drifted = await readSystemKnowledge(prisma, request, caller, new Date(now.getTime() + 1_000));
    expect(drifted).toMatchObject({ accessDecision: "DENY", trustStatus: "SOURCE_CHECK_REQUIRED", assets: [], relationships: [] });

    await prisma.sourceObservation.deleteMany({ where: { ...scope, id: `${prefix}.pending` } });
    await prisma.reconciliationSnapshot.create({ data: { root: secondReconciliationRoot, status: "CONVERGED", factDigests: [], issues: [], createdAt: new Date(now.getTime() + 2_000), ...scope } });
    const restored = await readSystemKnowledge(prisma, request, caller, new Date(now.getTime() + 3_000));
    expect(restored.accessDecision).toBe("ALLOW");
    expect(restored.trustStatus).toBe("SELF_CONTAINED");
    expect(restored.receiptId).not.toBe(current.receiptId);
  });
});
