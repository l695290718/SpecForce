import { contentDigest, factTypeForAssetFamily, scopeById, semanticEvidenceClusterDigest, type FullAssetFamily, type FullAssetSemanticCandidate, type SemanticCandidateBatch } from "@specforge/core";
import type { KnowledgeScanBatch, ScanFinalization, ScannerReleaseManifest } from "@specforge/scan-contract";
import { execFileSync } from "node:child_process";
import { createHash, generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { principalFromAuthInfo, withRequestPrincipal } from "../auth";
import { createDesignChangeSession, registerConnector } from "../federation/persistence";
import { assembleKnowledgeReviewBundle, submitSemanticCandidateBatch } from "../knowledge/candidate-persistence";
import { createIdentityCandidate, createWorkingStream, decideKnowledgeReviewBundle, publishKnowledgeBaseline } from "../knowledge/persistence";
import { promoteKnowledgeCandidates, reconcileKnowledgeBaseline } from "../knowledge/promotion";
import { disconnectMcpPersistence, prisma } from "../persistence";
import { submitScanBatch } from "./batch-persistence";
import { canonicalUnsignedReleaseBytes, persistScannerRelease } from "./release";
import { finalizeKnowledgeScan, getScanCheckpoint, startKnowledgeScan } from "./session";

const integrationEnabled = process.env.SPECFORGE_KNOWLEDGE_INTEGRATION === "1";
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "fixtures", "legacy-scan");
const scannerBinary = join(repositoryRoot, "apps", "specforge-cli", "dist", process.platform === "win32" ? "specforge.exe" : "specforge");
const designer = scopeById("com.huawei.celon.desiner")!;
const sibling = scopeById("com.huawei.celon.policyhub")!;
const architectureScope = { applicationServiceId: designer.id, scopePath: designer.scopePath };
const siblingScope = { applicationServiceId: sibling.id, scopePath: sibling.scopePath };
const runPrefix = `test-legacy-baseline-e2e-${randomUUID()}`;
const semanticPrefix = `${runPrefix}.legacy`;
const releaseId = `${runPrefix}-release`;
const connectorId = `${runPrefix}-connector`;
const streamId = `${runPrefix}-stream`;
let temporaryRoot: string | undefined;
let temporaryControlRoot: string | undefined;
let releaseManifest: ScannerReleaseManifest;
let trustStore: Record<string, unknown>;

describe.runIf(integrationEnabled)("legacy baseline production flow", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await assertScannerBinary();
    temporaryRoot = await mkdtemp(join(tmpdir(), "specforge-legacy-e2e-"));
    temporaryControlRoot = await mkdtemp(join(tmpdir(), "specforge-legacy-control-"));
    await prepareFixtureRepository(temporaryRoot);
    ({ manifest: releaseManifest, trustStore } = await signedRelease(scannerBinary));
    await persistScannerRelease({ manifest: releaseManifest }, trustStore.keys as Record<string, string>);
    await registerConnector({ id: connectorId, kind: "local-scanner-v2", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope });
  }, 60_000);

  afterAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await deleteFixtures();
    delete process.env.SPECFORGE_MCP_SEED;
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    if (temporaryControlRoot) await rm(temporaryControlRoot, { recursive: true, force: true });
    await disconnectMcpPersistence();
  }, 60_000);

  it("publishes Baseline v1 after resume and preserves canonical identity on rescan", async () => {
    const first = await executeBaselineRun(1, true);
    expect(first.producedBatchCount).toBeGreaterThanOrEqual(3);
    expect(first.interruptedCheckpoint).toMatchObject({ latestAcceptedSequence: 1, observationCount: 2 });
    expect(first.retryWasIdempotent).toBe(true);
    expect(first.baseline.status).toBe("PUBLISHED");
    expect(first.reconciliation.status).toBe("CONVERGED");

    const canonicalCountAfterFirst = await prisma.designAsset.count({ where: { ...architectureScope, id: { in: first.canonicalAssetIds } } });
    const second = await executeBaselineRun(2, false);
    expect(second.canonicalAssetIds).toEqual(first.canonicalAssetIds);
    expect(await prisma.designAsset.count({ where: { ...architectureScope, id: { in: first.canonicalAssetIds } } })).toBe(canonicalCountAfterFirst);
    expect(second.baseline.status).toBe("PUBLISHED");
    expect(await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...architectureScope, id: first.baseline.id } } })).toMatchObject({ status: "SUPERSEDED" });

    const siblingCounts = await Promise.all([
      prisma.knowledgeScanSession.count({ where: { ...siblingScope, connectorId } }),
      prisma.designAsset.count({ where: { ...siblingScope, id: { in: first.canonicalAssetIds } } }),
      prisma.assetLink.count({ where: { ...siblingScope, id: { in: [...first.relationshipRevisionIds, ...second.relationshipRevisionIds] } } }),
      prisma.knowledgeBaseline.count({ where: { ...siblingScope, id: { startsWith: runPrefix } } })
    ]);
    expect(siblingCounts).toEqual([0, 0, 0, 0]);
  }, 120_000);
});

async function executeBaselineRun(runNumber: number, interruptAfterSecondBatch: boolean) {
  if (!temporaryRoot || !temporaryControlRoot) throw new Error("E2E_TEMPORARY_REPOSITORY_MISSING");
  process.env.SPECFORGE_MCP_SEED = "1";
  const designChangeSessionId = `${runPrefix}-design-session-${runNumber}`;
  await createDesignChangeSession({
    id: designChangeSessionId,
    actorId: "specforge-seed",
    intent: `Discover legacy baseline run ${runNumber}`,
    affectedFactIds: [],
    expectedEvidenceRefs: [`${runPrefix}-scan-${runNumber}`],
    status: "OPEN",
    architectureScope
  });
  const commit = git(temporaryRoot, "rev-parse", "HEAD").trim();
  const snapshotDigest = sha256(commit);
  const descriptor = await startKnowledgeScan({
    architectureScope,
    connectorId,
    designChangeSessionId,
    scannerReleaseId: releaseId,
    snapshotIdentity: { repositoryId: `${runPrefix}-repository`, snapshotKind: "COMMIT", snapshotDigest, commit },
    repositoryPolicy: { allowDirtyWorktree: false, ignorePatterns: [".git/**", ".specforge/**"] },
    evidencePolicy: { sourceExcerpt: "forbidden" },
    budgets: { maxObservationsPerBatch: 1, maxExcerptBytes: 0 }
  });

  const runDirectory = join(temporaryControlRoot, String(runNumber));
  const spoolBase = join(runDirectory, "spool");
  const manifestPath = join(runDirectory, "manifest.json");
  const sessionPath = join(runDirectory, "session.json");
  const trustPath = join(runDirectory, "trust.json");
  await writeJson(manifestPath, releaseManifest);
  await writeJson(sessionPath, descriptor);
  await writeJson(trustPath, trustStore);
  const summary = JSON.parse(execFileSync(scannerBinary, ["scan", "--release", manifestPath, "--session", sessionPath, "--trust", trustPath, "--spool", spoolBase, "--artifact", scannerBinary], { cwd: temporaryRoot, encoding: "utf8" })) as { spoolPath: string; batchCount: number };
  const batchFiles = (await readdir(summary.spoolPath)).filter((name) => /^\d{8}-[a-f0-9]{64}\.json$/u.test(name)).sort();
  expect(batchFiles.length).toBe(summary.batchCount);
  expect(batchFiles.length).toBeGreaterThanOrEqual(3);
  const batches = await Promise.all(batchFiles.map(async (name) => JSON.parse(await readFile(join(summary.spoolPath, name), "utf8")) as KnowledgeScanBatch));

  await submitScanBatch({ architectureScope, batch: batches[0]! });
  const secondReceipt = await submitScanBatch({ architectureScope, batch: batches[1]! });
  let interruptedCheckpoint: Awaited<ReturnType<typeof getScanCheckpoint>> | undefined;
  let retryWasIdempotent = false;
  if (interruptAfterSecondBatch) {
    interruptedCheckpoint = await getScanCheckpoint({ architectureScope, sessionId: descriptor.sessionId });
    const retry = await submitScanBatch({ architectureScope, batch: batches[1]! });
    retryWasIdempotent = retry.idempotent;
  }
  for (const batch of batches.slice(2)) await submitScanBatch({ architectureScope, batch });
  const finalization = JSON.parse(await readFile(join(summary.spoolPath, "finalization.json"), "utf8")) as ScanFinalization;
  if (finalization.coverage.coverageGaps.length > 0) throw new Error(`E2E_COVERAGE_GAPS:${finalization.coverage.coverageGaps.join(",")}`);
  const finalized = await finalizeKnowledgeScan({ architectureScope, sessionId: descriptor.sessionId, finalization });
  expect(finalized.status).toBe("READY_FOR_ANALYSIS");

  const observations = await prisma.sourceObservation.findMany({ where: { ...architectureScope, payload: { path: ["scanSessionId"], equals: descriptor.sessionId } }, orderBy: { externalId: "asc" } });
  expect(observations.length).toBe(finalization.observationCount);
  const semanticCluster = {
    id: `${semanticPrefix}.cluster`,
    architectureScope,
    domainHint: `${semanticPrefix}.domain`,
    observationIds: observations.map((observation) => observation.id),
    evidenceTypes: ["source-code", "executable-test"] as const,
    tokenEstimate: Math.max(1, observations.length * 100)
  };
  const semanticCandidates = candidateFixtures(
    observations.map((observation) => ({ id: observation.id, normalizedDigest: observation.normalizedDigest })),
    semanticCluster.id,
    descriptor.policyReceipt.semanticPromptPackDigest,
    descriptor.policyReceipt.effectivePolicyDigest
  );
  const semanticBatch: SemanticCandidateBatch = {
    sessionId: descriptor.sessionId,
    sequence: 0,
    complete: true,
    provenance: { agent: "claude-code", model: "enterprise-agent", runId: `${runPrefix}-${runNumber}` },
    clusters: [{ ...semanticCluster, evidenceTypes: [...semanticCluster.evidenceTypes], clusterDigest: semanticEvidenceClusterDigest({ ...semanticCluster, evidenceTypes: [...semanticCluster.evidenceTypes] }) }],
    candidates: semanticCandidates
  };
  await submitSemanticCandidateBatch({ architectureScope, batch: semanticBatch });
  const identityTimestamp = new Date().toISOString();
  await createIdentityCandidate({
    architectureScope,
    candidate: {
      id: `${runPrefix}-identity-${runNumber}`,
      semanticIdentity: semanticCandidates[0]!.semanticIdentity,
      sourceObservationId: observations[0]!.id,
      targetAssetType: "api",
      architectureScope,
      confidence: 1,
      matchingEvidence: [`source-observation:${observations[0]!.id}`],
      counterEvidence: [],
      decision: "UNDECIDED",
      createdAt: identityTimestamp,
      updatedAt: identityTimestamp
    }
  });
  const review = await assembleKnowledgeReviewBundle({ architectureScope, sessionId: descriptor.sessionId });
  expect(review).toMatchObject({ status: "READY", riskTier: "T2", blockingIssues: [] });

  delete process.env.SPECFORGE_MCP_SEED;
  const reviewer = principalFromAuthInfo({
    clientId: `${runPrefix}-reviewer-${runNumber}`,
    tenantId: "local-development",
    scopes: ["knowledge:write", "governance:run"],
    extra: {
      actor: {
        actorType: "user",
        actorId: `${runPrefix}-reviewer-${runNumber}`,
        grants: [{ scopeId: architectureScope.applicationServiceId, action: "write" }]
      }
    }
  });
  const { baseline, reconciliation, promotion, retryPromotion } = await withRequestPrincipal(reviewer, async () => {
    const decision = await decideKnowledgeReviewBundle({
      id: `${runPrefix}-decision-${runNumber}`,
      reviewBundleId: review.id,
      architectureScope,
      decision: "APPROVE",
      approvedAssertionIds: review.assertionIds,
      approvedIdentityCandidateIds: review.identityCandidateIds,
      evidenceRefs: review.evidenceRefs,
      reason: "Independent human reviewer approved complete bilingual evidence and unambiguous identities."
    });
    await createWorkingStream({ id: streamId, name: "Legacy baseline main", architectureScope });
    const promoted = await promoteKnowledgeCandidates({ architectureScope, promotionDecisionId: decision.id, streamId });
    const retried = await promoteKnowledgeCandidates({ architectureScope, promotionDecisionId: decision.id, streamId });
    const reconciled = await reconcileKnowledgeBaseline({ architectureScope, promotionReceiptId: promoted.id });
    const published = await publishKnowledgeBaseline({
      id: `${runPrefix}-baseline-${runNumber}`,
      streamId,
      changeSetId: promoted.changeSetId,
      architectureScope,
      sourceRevisionIds: promoted.assetRevisionIds,
      relationshipVersion: promoted.relationshipVersion,
      reconciliationReceiptId: reconciled.id
    });
    return { baseline: published, reconciliation: reconciled, promotion: promoted, retryPromotion: retried };
  });
  expect(retryPromotion).toMatchObject({ id: promotion.id, idempotent: true });
  const canonicalAssetIds = (await prisma.designAsset.findMany({ where: { ...architectureScope, id: { startsWith: "knowledge-asset:" }, payload: { contains: semanticPrefix } }, select: { id: true }, orderBy: { id: "asc" } })).map((asset) => asset.id);
  return { baseline, reconciliation, canonicalAssetIds, relationshipRevisionIds: promotion.relationshipRevisionIds, interruptedCheckpoint, retryWasIdempotent, producedBatchCount: batches.length };
}

function candidateFixtures(observations: Array<{ id: string; normalizedDigest: string }>, clusterId: string, promptPackDigest: string, policyDigest: string): FullAssetSemanticCandidate[] {
  const candidates = observations.map<FullAssetSemanticCandidate>((observation, index) => {
    const assetFamily: FullAssetFamily = index === 0 ? "api" : index === 1 ? "dataModel" : "domain";
    const factType = factTypeForAssetFamily[assetFamily];
    const semanticIdentity = `${semanticPrefix}.fact.${index}`;
    const canonicalContent = { name: `Legacy fixture fact ${index}`, description: `Verified semantic fact ${index} extracted from the legacy fixture.` };
    const localizedContent = { zh: { name: `存量夹具事实 ${index}`, description: `从存量夹具提取并验证的语义事实 ${index}。` } };
    return {
      semanticIdentity,
      normalizedDigest: contentDigest({ semanticIdentity, source: observation.normalizedDigest }),
      factType,
      layer: "SYS",
      aspect: factType === "data-model" ? "information" : "contract",
      domainCluster: `${semanticPrefix}.domain`,
      value: { canonicalContent, localizedContent },
      confidence: 0.99,
      matchingEvidence: [`source-observation:${observation.id}`, `executable-test:${runPrefix}`],
      counterEvidence: [],
      unresolvedQuestions: [],
      evidenceRefs: [`source-observation:${observation.id}`, `executable-test:${runPrefix}`],
      sourceObservationIds: [observation.id],
      identityDecision: "UNAMBIGUOUS",
      assetFamily,
      promptPackDigest,
      policyDigest,
      clusterId,
      evidenceTypes: ["source-code", "executable-test"],
      canonicalContent,
      localizedContent
    };
  });
  if (candidates.length >= 2) {
    const source = candidates[0]!;
    const target = candidates[1]!;
    const canonicalContent = { summary: "The discovered API writes the discovered data model.", source: { semanticIdentity: source.semanticIdentity }, target: { semanticIdentity: target.semanticIdentity }, relationType: "WRITES" };
    const localizedContent = { zh: { summary: "发现的 API 写入发现的数据模型。" } };
    candidates.push({
      semanticIdentity: `${semanticPrefix}.relationship.api-writes-model`,
      normalizedDigest: contentDigest({ source: source.semanticIdentity, target: target.semanticIdentity, relationType: "WRITES" }),
      factType: "typed-relationship",
      layer: "SYS",
      aspect: "structure",
      domainCluster: `${semanticPrefix}.domain`,
      value: { canonicalContent, localizedContent },
      confidence: 0.99,
      matchingEvidence: source.matchingEvidence,
      counterEvidence: [],
      unresolvedQuestions: [],
      evidenceRefs: source.evidenceRefs,
      sourceObservationIds: source.sourceObservationIds,
      identityDecision: "UNAMBIGUOUS",
      assetFamily: "typedRelationship",
      promptPackDigest,
      policyDigest,
      clusterId,
      evidenceTypes: ["source-code", "executable-test"],
      canonicalContent,
      localizedContent
    });
  }
  return candidates;
}

async function prepareFixtureRepository(root: string): Promise<void> {
  await cp(fixtureRoot, root, { recursive: true });
  for (const excluded of ["hostile-workspace", "java-spring", "typescript-node", join("contracts", "schema.sql")]) {
    await rm(join(root, excluded), { recursive: true, force: true });
  }
  await writeFile(join(root, ".specforge.yaml"), `version: 1\nrepository:\n  id: ${runPrefix}-repository\n  defaultApplicationServiceId: ${architectureScope.applicationServiceId}\ngovernance:\n  endpoint: http://127.0.0.1:3001/mcp\n`, "utf8");
  git(root, "init");
  git(root, "add", ".");
  git(root, "-c", "user.name=SpecForge E2E", "-c", "user.email=specforge-e2e@example.invalid", "commit", "-m", "legacy fixture");
}

async function signedRelease(artifactPath: string): Promise<{ manifest: ScannerReleaseManifest; trustStore: Record<string, unknown> }> {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const artifact = await stat(artifactPath);
  const artifactDigest = createHash("sha256").update(await readFile(artifactPath)).digest("hex");
  const platform = `${process.platform === "win32" ? "windows" : process.platform}-${process.arch === "x64" ? "amd64" : process.arch}`;
  const unsigned = {
    contractVersion: "2.0" as const,
    releaseId,
    scannerVersion: "2.0.0",
    platform,
    artifact: { uri: pathToFileURL(artifactPath).href, sha256: artifactDigest, sizeBytes: artifact.size },
    schemaVersions: ["2.0"],
    extractors: [{ id: "legacy-baseline-e2e", version: "1.0.0" }],
    signingKeyId: `${runPrefix}-key`,
    algorithm: "Ed25519" as const,
    issuedAt: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    status: "ACTIVE" as const
  };
  const signature = sign(null, canonicalUnsignedReleaseBytes(unsigned), privateKey).toString("base64");
  const manifest: ScannerReleaseManifest = { ...unsigned, signature };
  const publicKeyValue = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { manifest, trustStore: { keys: { [unsigned.signingKeyId]: publicKeyValue }, revokedReleaseIds: [], minimumScannerVersion: unsigned.scannerVersion } };
}

async function assertScannerBinary(): Promise<void> {
  try { await stat(scannerBinary); } catch { throw new Error(`SCANNER_BINARY_REQUIRED:${scannerBinary}`); }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function deleteFixtures(): Promise<void> {
  const sessions = await prisma.knowledgeScanSession.findMany({ where: { ...architectureScope, connectorId }, select: { id: true } }).catch(() => []);
  const sessionIds = sessions.map((session) => session.id);
  const decisions = await prisma.knowledgePromotionDecision.findMany({ where: { ...architectureScope, id: { startsWith: runPrefix } }, select: { id: true } }).catch(() => []);
  const decisionIds = decisions.map((decision) => decision.id);
  const receipts = await prisma.knowledgePromotionReceipt.findMany({ where: { ...architectureScope, promotionDecisionId: { in: decisionIds } } }).catch(() => []);
  const assetIds = [...new Set(receipts.flatMap((receipt) => receipt.assetRevisionIds as string[]))];
  const events = await prisma.relationshipEvent.findMany({ where: { enterpriseId: process.env.SPECFORGE_ENTERPRISE_ID ?? "legacy-enterprise", ...architectureScope, correlationId: { startsWith: `knowledge-promotion:${runPrefix}` } }, select: { dbId: true } }).catch(() => []);
  const eventIds = events.map((event) => event.dbId);
  await prisma.knowledgeBaseline.deleteMany({ where: { ...architectureScope, id: { startsWith: runPrefix } } });
  await prisma.relationshipOutbox.deleteMany({ where: { relationshipEventId: { in: eventIds } } });
  await prisma.relationshipCommandReceipt.deleteMany({ where: { ...configuredEnterpriseScope(), idempotencyKey: { startsWith: `knowledge-promotion:${runPrefix}` } } });
  await prisma.relationshipEvent.deleteMany({ where: { dbId: { in: eventIds } } });
  await prisma.relationshipCurrent.deleteMany({ where: { ...configuredEnterpriseScope(), sourceReference: { startsWith: `knowledge-promotion:${runPrefix}` } } });
  await prisma.assetLink.deleteMany({ where: { ...architectureScope, id: { in: eventIds } } });
  await prisma.assetNode.deleteMany({ where: { ...configuredEnterpriseScope(), rootAssetId: { in: assetIds } } });
  await prisma.federationOutbox.deleteMany({ where: { ...architectureScope, OR: [{ idempotencyKey: { contains: runPrefix } }, { designChangeSessionId: { startsWith: runPrefix } }] } });
  await prisma.knowledgePromotionReceipt.deleteMany({ where: { ...architectureScope, promotionDecisionId: { in: decisionIds } } });
  await prisma.knowledgePromotionDecision.deleteMany({ where: { ...architectureScope, id: { startsWith: runPrefix } } });
  await prisma.knowledgeReviewBundle.deleteMany({ where: { ...architectureScope, designChangeSessionId: { startsWith: runPrefix } } });
  await prisma.knowledgeChangeSet.deleteMany({ where: { ...architectureScope, promotionDecisionId: { in: decisionIds } } });
  await prisma.workingStream.deleteMany({ where: { ...architectureScope, id: streamId } });
  await prisma.identityCandidate.deleteMany({ where: { ...architectureScope, id: { startsWith: runPrefix } } });
  await prisma.knowledgeAssertion.deleteMany({ where: { ...architectureScope, semanticIdentity: { startsWith: semanticPrefix } } });
  await prisma.knowledgeScanBatch.deleteMany({ where: { ...architectureScope, sessionId: { in: sessionIds } } });
  await prisma.sourceObservation.deleteMany({ where: { ...architectureScope, connectorId } });
  await prisma.knowledgeScanSession.deleteMany({ where: { ...architectureScope, id: { in: sessionIds } } });
  await prisma.designChangeSession.deleteMany({ where: { ...architectureScope, id: { startsWith: runPrefix } } });
  await prisma.designAsset.deleteMany({ where: { ...architectureScope, id: { in: assetIds } } });
  await prisma.connectorInstance.deleteMany({ where: { ...architectureScope, id: connectorId } });
  await prisma.scannerRelease.deleteMany({ where: { id: releaseId } });
}

function configuredEnterpriseScope() {
  return { enterpriseId: process.env.SPECFORGE_ENTERPRISE_ID ?? "legacy-enterprise", ...architectureScope };
}
