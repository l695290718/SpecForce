import { scopeById, type KnowledgeAssertion } from "@specforge/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { disconnectMcpPersistence, ensureMcpPersistenceSchema, prisma } from "../persistence";
import { createDesignChangeSession } from "../federation/persistence";
import { createKnowledgeAssertion, createKnowledgeReviewBundle, createWorkingStream, decideKnowledgeReviewBundle, publishKnowledgeBaseline } from "./persistence";
import { mapKnowledgeAssertionForPromotion, promoteKnowledgeCandidates, reconcileKnowledgeBaseline } from "./promotion";

const integrationEnabled = process.env.SPECFORGE_KNOWLEDGE_INTEGRATION === "1";
const registeredScope = scopeById("com.huawei.celon.desiner")!;
const architectureScope = { applicationServiceId: registeredScope.id, scopePath: registeredScope.scopePath };
const siblingScope = { applicationServiceId: "com.huawei.celon.policyhub", scopePath: scopeById("com.huawei.celon.policyhub")!.scopePath };
const prefix = "test-knowledge-promotion-v1";
const enterpriseId = process.env.SPECFORGE_ENTERPRISE_ID ?? "legacy-enterprise";

describe.runIf(integrationEnabled)("transactional knowledge promotion", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await ensureMcpPersistenceSchema();
    await deleteFixtures();
  });

  afterAll(async () => {
    await deleteFixtures();
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
  });

  it("atomically promotes, retries, reconciles, and publishes an immutable Baseline", async () => {
    const fixture = await createFixture("success", "WRITES");
    const receipt = await promoteKnowledgeCandidates({ architectureScope, promotionDecisionId: fixture.decisionId, streamId: fixture.streamId });
    const retry = await promoteKnowledgeCandidates({ architectureScope, promotionDecisionId: fixture.decisionId, streamId: fixture.streamId });

    expect(receipt).toMatchObject({ idempotent: false, changeSetSequence: 1, scanSessionDigest: fixture.scanDigest });
    expect(retry).toMatchObject({ id: receipt.id, sourceDigest: receipt.sourceDigest, changeSetId: receipt.changeSetId, idempotent: true });
    expect(await prisma.designAsset.count({ where: { ...architectureScope, id: { in: receipt.assetRevisionIds } } })).toBe(receipt.assetRevisionIds.length);
    expect(await prisma.assetLink.count({ where: { ...architectureScope, id: { in: receipt.relationshipRevisionIds } } })).toBe(receipt.relationshipRevisionIds.length);
    expect(await prisma.relationshipOutbox.count({ where: { enterpriseId, ...architectureScope, relationshipEventId: { in: receipt.relationshipRevisionIds } } })).toBe(receipt.relationshipRevisionIds.length);
    expect(await prisma.designAsset.count({ where: { ...siblingScope, id: { in: receipt.assetRevisionIds } } })).toBe(0);

    const reconciliation = await reconcileKnowledgeBaseline({ architectureScope, promotionReceiptId: receipt.id });
    expect(reconciliation).toMatchObject({ status: "CONVERGED", issues: [], changeSetId: receipt.changeSetId });
    const baseline = await publishKnowledgeBaseline({
      id: `${prefix}-baseline-success`,
      streamId: fixture.streamId,
      changeSetId: receipt.changeSetId,
      architectureScope,
      sourceRevisionIds: receipt.assetRevisionIds,
      relationshipVersion: receipt.relationshipVersion,
      reconciliationReceiptId: reconciliation.id
    });
    expect(baseline).toMatchObject({ status: "PUBLISHED", changeSetId: receipt.changeSetId });
    expect(baseline.manifest).toMatchObject({ promotionReceiptId: receipt.id, reconciliationReceiptId: reconciliation.id, scanSessionDigest: fixture.scanDigest });

    await expect(publishKnowledgeBaseline({
      id: `${prefix}-baseline-rejected`,
      streamId: fixture.streamId,
      changeSetId: "wrong-change-set",
      architectureScope,
      sourceRevisionIds: receipt.assetRevisionIds,
      relationshipVersion: receipt.relationshipVersion,
      reconciliationReceiptId: reconciliation.id
    })).rejects.toThrow("BASELINE_RECONCILIATION_CHANGESET_MISMATCH");
    expect(await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...architectureScope, id: baseline.id } } })).toMatchObject({ status: "PUBLISHED" });

    const replacement = await publishKnowledgeBaseline({
      id: `${prefix}-baseline-success-v2`,
      streamId: fixture.streamId,
      changeSetId: receipt.changeSetId,
      architectureScope,
      sourceRevisionIds: receipt.assetRevisionIds,
      relationshipVersion: receipt.relationshipVersion,
      reconciliationReceiptId: reconciliation.id
    });
    expect(replacement.status).toBe("PUBLISHED");
    expect(await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...architectureScope, id: baseline.id } } })).toMatchObject({ status: "SUPERSEDED" });
    await expect(publishKnowledgeBaseline({
      id: replacement.id,
      streamId: fixture.streamId,
      changeSetId: "different-change-set",
      architectureScope,
      sourceRevisionIds: receipt.assetRevisionIds,
      relationshipVersion: receipt.relationshipVersion,
      reconciliationReceiptId: reconciliation.id
    })).rejects.toThrow("BASELINE_RECONCILIATION_CHANGESET_MISMATCH");
    expect(await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...architectureScope, id: replacement.id } } })).toMatchObject({ status: "PUBLISHED", changeSetId: receipt.changeSetId });
  }, 30000);

  it("reconciles an asset-only promotion against the authoritative current graph version", async () => {
    const fixture = await createFixture("asset-only", null);
    const receipt = await promoteKnowledgeCandidates({ architectureScope, promotionDecisionId: fixture.decisionId, streamId: fixture.streamId });
    expect(receipt.relationshipRevisionIds).toEqual([]);
    const reconciliation = await reconcileKnowledgeBaseline({ architectureScope, promotionReceiptId: receipt.id });
    expect(reconciliation).toMatchObject({ status: "CONVERGED", relationshipVersion: receipt.relationshipVersion, relationshipRevisionIds: [] });
  }, 30000);

  it("rolls back assets, links, outbox, ChangeSet, and receipt when relationship persistence fails", async () => {
    const fixture = await createFixture("rollback", "PROVIDES");
    const expectedAssetIds = fixture.assertions
      .map((assertion) => mapKnowledgeAssertionForPromotion(assertion, architectureScope))
      .flatMap((item) => "assetType" in item ? [item.id] : []);

    await expect(promoteKnowledgeCandidates({ architectureScope, promotionDecisionId: fixture.decisionId, streamId: fixture.streamId })).rejects.toThrow("PROMOTION_TRANSACTION_FAILED");
    expect(await prisma.designAsset.count({ where: { ...architectureScope, id: { in: expectedAssetIds } } })).toBe(0);
    expect(await prisma.knowledgeChangeSet.count({ where: { ...architectureScope, promotionDecisionId: fixture.decisionId } })).toBe(0);
    expect(await prisma.knowledgePromotionReceipt.count({ where: { ...architectureScope, promotionDecisionId: fixture.decisionId } })).toBe(0);
    expect(await prisma.relationshipOutbox.count({ where: { enterpriseId, ...architectureScope, relationshipEvent: { correlationId: `knowledge-promotion:${fixture.decisionId}` } } })).toBe(0);
  }, 30000);
});

async function createFixture(suffix: string, relationType: "WRITES" | "PROVIDES" | null) {
  const designSessionId = `${prefix}-design-session-${suffix}`;
  const scanSessionId = `${prefix}-scan-session-${suffix}`;
  const streamId = `${prefix}-stream-${suffix}`;
  const decisionId = `${prefix}-decision-${suffix}`;
  const scanDigest = `${prefix}-scan-digest-${suffix}`;
  const now = new Date();
  await createDesignChangeSession({ id: designSessionId, actorId: "semantic-agent", intent: "Promote baseline fixture", affectedFactIds: [], expectedEvidenceRefs: [`${prefix}-evidence-${suffix}`], status: "OPEN", architectureScope });
  await createWorkingStream({ id: streamId, name: `Promotion ${suffix}`, architectureScope });
  await prisma.scannerRelease.upsert({
    where: { id: `${prefix}-scanner-release` },
    create: { id: `${prefix}-scanner-release`, version: `${prefix}-1.0.0`, contractVersion: "2.0.0", artifactDigests: {}, manifest: {}, signature: "test", keyId: "test", status: "ACTIVE", publishedAt: now },
    update: { status: "ACTIVE" }
  });
  await prisma.knowledgeScanSession.create({
    data: {
      id: scanSessionId,
      ...architectureScope,
      actorId: "semantic-agent",
      connectorId: `${prefix}-connector`,
      designChangeSessionId: designSessionId,
      scannerReleaseId: `${prefix}-scanner-release`,
      contractVersion: "2.0.0",
      nonceDigest: `${prefix}-nonce-${suffix}`,
      snapshotIdentity: {},
      repositoryPolicy: {},
      evidencePolicy: {},
      parserPolicy: {},
      budgets: {},
      status: "READY_FOR_ANALYSIS",
      acceptedSequence: 0,
      acceptedBatchDigest: `${prefix}-batch-${suffix}`,
      observationCount: relationType ? 3 : 2,
      finalizationManifest: {},
      finalizationDigest: scanDigest,
      expiresAt: new Date(now.getTime() + 60_000),
      finalizedAt: now
    }
  });

  const sourceIds = ["api", "model", ...(relationType ? ["relationship"] : [])].map((kind) => `${prefix}-source-${suffix}-${kind}`);
  for (const sourceId of sourceIds) {
    await prisma.sourceObservation.create({ data: { id: sourceId, connectorId: `${prefix}-connector`, sourceNamespace: "knowledge-scan-v2", externalAssetType: "source", externalId: sourceId, payload: { scanSessionId }, normalizedDigest: `${sourceId}-digest`, sourceVersion: "1", observedAt: now, status: "OBSERVED", provenance: {}, idempotencyKey: sourceId, ...architectureScope } });
  }
  const assertions: KnowledgeAssertion[] = [
    candidate(`${prefix}-assertion-${suffix}-api`, `${prefix}.${suffix}.api`, "api-contract", sourceIds[0]!, scanSessionId, { summary: "Creates an order.", method: "POST", path: "/orders" }, { summary: "创建订单。" }),
    candidate(`${prefix}-assertion-${suffix}-model`, `${prefix}.${suffix}.model`, "data-model", sourceIds[1]!, scanSessionId, { summary: "Stores orders." }, { summary: "存储订单。" })
  ];
  if (relationType) assertions.push(candidate(`${prefix}-assertion-${suffix}-relationship`, `${prefix}.${suffix}.relationship`, "typed-relationship", sourceIds[2]!, scanSessionId, {
      summary: "The API writes the order model.",
      source: { semanticIdentity: `${prefix}.${suffix}.api` },
      target: { semanticIdentity: `${prefix}.${suffix}.model` },
      relationType
    }, { summary: "API 写入订单数据模型。" }));
  for (const item of assertions) await createKnowledgeAssertion({ architectureScope, assertion: item });
  const review = await createKnowledgeReviewBundle({ id: `${prefix}-review-${suffix}`, designChangeSessionId: designSessionId, architectureScope, riskTier: "T1", assertionIds: assertions.map((item) => item.id), identityCandidateIds: [], evidenceRefs: sourceIds, coverage: { totalSources: sourceIds.length, processedSources: sourceIds.length, supportedSources: sourceIds.length, candidateCount: assertions.length, complete: true }, blockingIssues: [] });
  await decideKnowledgeReviewBundle({ id: decisionId, reviewBundleId: review.id, architectureScope, decision: "APPROVE", approvedAssertionIds: assertions.map((item) => item.id), approvedIdentityCandidateIds: [], evidenceRefs: sourceIds, reason: "Reviewed by an independent integration actor." });
  return { assertions, decisionId, streamId, scanDigest };
}

function candidate(id: string, semanticIdentity: string, factType: string, sourceObservationId: string, scanSessionId: string, canonicalContent: Record<string, unknown>, chineseContent: Record<string, unknown>): KnowledgeAssertion {
  const timestamp = "2026-08-03T00:00:00.000Z";
  return {
    id,
    semanticIdentity,
    factType,
    layer: "SYS",
    aspect: factType === "data-model" ? "information" : "contract",
    value: { canonicalContent, localizedContent: { zh: chineseContent }, review: { normalizedDigest: `${id}-revision`, identityDecision: "UNAMBIGUOUS", agentEvidenceComplete: true }, agentProvenance: { sessionId: scanSessionId } },
    architectureScope,
    status: "CANDIDATE",
    confidence: 0.95,
    matchingEvidence: [`source-observation:${sourceObservationId}`],
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: [`source-observation:${sourceObservationId}`],
    sourceObservationIds: [sourceObservationId],
    extractorId: "agent:integration",
    riskTier: "T1",
    domainCluster: "orders",
    generatedByActorId: "semantic-agent",
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

async function deleteFixtures(): Promise<void> {
  const receipts = await prisma.knowledgePromotionReceipt.findMany({ where: { ...architectureScope, promotionDecisionId: { startsWith: prefix } } });
  const assetIds = [...new Set(receipts.flatMap((receipt) => receipt.assetRevisionIds as string[]))];
  const events = await prisma.relationshipEvent.findMany({ where: { enterpriseId, ...architectureScope, correlationId: { startsWith: `knowledge-promotion:${prefix}` } }, select: { dbId: true } });
  const eventIds = events.map((event) => event.dbId);
  await prisma.projectionManifest.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeBaseline.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.relationshipOutbox.deleteMany({ where: { enterpriseId, ...architectureScope, relationshipEventId: { in: eventIds } } });
  await prisma.relationshipCommandReceipt.deleteMany({ where: { enterpriseId, ...architectureScope, idempotencyKey: { startsWith: `knowledge-promotion:${prefix}` } } });
  await prisma.relationshipEvent.deleteMany({ where: { enterpriseId, ...architectureScope, dbId: { in: eventIds } } });
  await prisma.relationshipCurrent.deleteMany({ where: { enterpriseId, ...architectureScope, sourceReference: { startsWith: `knowledge-promotion:${prefix}` } } });
  await prisma.assetLink.deleteMany({ where: { ...architectureScope, id: { in: eventIds } } });
  await prisma.assetNode.deleteMany({ where: { enterpriseId, ...architectureScope, rootAssetId: { in: assetIds } } });
  await prisma.federationOutbox.deleteMany({ where: { ...architectureScope, OR: [{ idempotencyKey: { contains: prefix } }, { designChangeSessionId: { startsWith: prefix } }] } });
  await prisma.knowledgePromotionReceipt.deleteMany({ where: { ...architectureScope, promotionDecisionId: { startsWith: prefix } } });
  await prisma.knowledgePromotionDecision.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeReviewBundle.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeChangeSet.deleteMany({ where: { ...architectureScope, id: { startsWith: "knowledge-changeset:" }, promotionDecisionId: { startsWith: prefix } } });
  await prisma.workingStream.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeAssertion.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.sourceObservation.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.knowledgeScanBatch.deleteMany({ where: { ...architectureScope, sessionId: { startsWith: prefix } } });
  await prisma.knowledgeScanSession.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.designChangeSession.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } });
  await prisma.designAsset.deleteMany({ where: { ...architectureScope, id: { in: assetIds } } });
  await prisma.scannerRelease.deleteMany({ where: { id: `${prefix}-scanner-release` } });
}
