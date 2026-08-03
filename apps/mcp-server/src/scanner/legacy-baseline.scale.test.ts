import { scopeById } from "@specforge/core";
import type { KnowledgeScanBatch, ScannerReleaseManifest, SourceObservationV2 } from "@specforge/scan-contract";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDesignChangeSession, registerConnector } from "../federation/persistence";
import { disconnectMcpPersistence, prisma } from "../persistence";
import { computeBatchIntegrity, submitScanBatch } from "./batch-persistence";
import { canonicalUnsignedReleaseBytes, persistScannerRelease } from "./release";
import { finalizeKnowledgeScan, getScanCheckpoint, startKnowledgeScan } from "./session";

const scaleEnabled = process.env.SPECFORGE_KNOWLEDGE_INTEGRATION === "1" && process.env.SPECFORGE_KNOWLEDGE_SCALE === "1";
const scope = scopeById("com.huawei.celon.desiner")!;
const sibling = scopeById("com.huawei.celon.policyhub")!;
const architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
const siblingScope = { applicationServiceId: sibling.id, scopePath: sibling.scopePath };
const prefix = "test-legacy-baseline-scale";
const releaseId = `${prefix}-release`;
const connectorId = `${prefix}-connector`;
const designSessionId = `${prefix}-design-session`;
const snapshotDigest = "7".repeat(64);

describe.runIf(scaleEnabled)("legacy baseline bounded scale", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await deleteFixtures();
    const { manifest, trustBundle } = signedRelease();
    await persistScannerRelease({ manifest }, trustBundle);
    await registerConnector({ id: connectorId, kind: "local-scanner-v2", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope });
    await createDesignChangeSession({
      id: designSessionId,
      actorId: "specforge-seed",
      intent: "Prove bounded 100,000-observation ingestion",
      affectedFactIds: [`${prefix}-baseline`],
      expectedEvidenceRefs: [`${prefix}-evidence`],
      status: "OPEN",
      architectureScope
    });
  });

  afterAll(async () => {
    await deleteFixtures();
    delete process.env.SPECFORGE_MCP_SEED;
    await disconnectMcpPersistence();
  });

  it("accepts 100,000 observations in bounded batches, resumes exactly, and rejects overflow", async () => {
    const descriptor = await startKnowledgeScan({
      architectureScope,
      connectorId,
      designChangeSessionId: designSessionId,
      scannerReleaseId: releaseId,
      snapshotIdentity: { repositoryId: "repo:scale-fixture", snapshotDigest },
      budgets: { maxObservationsPerBatch: 500, maxObservationsPerSession: 100_000, maxExcerptBytes: 8_192 }
    });
    let previousBatchDigest: string | null = null;
    const initialRss = process.memoryUsage().rss;
    let highWaterRss = initialRss;

    for (let sequence = 0; sequence < 200; sequence += 1) {
      const batch = scaleBatch(descriptor.sessionId, descriptor.sessionNonce, sequence, previousBatchDigest, 500);
      const accepted = await submitScanBatch({ architectureScope, batch });
      previousBatchDigest = accepted.acceptedBatchDigest;
      highWaterRss = Math.max(highWaterRss, process.memoryUsage().rss);

      if (sequence === 99) {
        const retry = await submitScanBatch({ architectureScope, batch });
        expect(retry).toMatchObject({ acceptedSequence: sequence, acceptedBatchDigest: previousBatchDigest, idempotent: true });
        expect(await getScanCheckpoint({ architectureScope, sessionId: descriptor.sessionId })).toMatchObject({ latestAcceptedSequence: sequence, cumulativeDigest: previousBatchDigest, observationCount: 50_000 });
      }
    }

    const checkpoint = await getScanCheckpoint({ architectureScope, sessionId: descriptor.sessionId });
    expect(checkpoint).toMatchObject({ latestAcceptedSequence: 199, cumulativeDigest: previousBatchDigest, observationCount: 100_000 });
    const overflow = scaleBatch(descriptor.sessionId, descriptor.sessionNonce, 200, previousBatchDigest, 1);
    await expect(submitScanBatch({ architectureScope, batch: overflow })).rejects.toThrow("SCAN_SESSION_OBSERVATION_BUDGET_EXCEEDED");

    const finalized = await finalizeKnowledgeScan({
      architectureScope,
      sessionId: descriptor.sessionId,
      finalization: {
        contractVersion: "2.0",
        sessionId: descriptor.sessionId,
        architectureScope,
        repositorySnapshotDigest: snapshotDigest,
        manifestDigest: "8".repeat(64),
        finalBatchDigest: previousBatchDigest!,
        batchCount: 200,
        observationCount: 100_000,
        coverage: { indexedFiles: 100_000, skippedFiles: 0, observationCount: 100_000, coverageGaps: [] },
        generatedAt: new Date().toISOString()
      }
    });
    expect(finalized.status).toBe("READY_FOR_ANALYSIS");
    expect(highWaterRss - initialRss).toBeLessThan(512 * 1024 * 1024);
    expect(await prisma.knowledgeScanSession.count({ where: { ...siblingScope, connectorId } })).toBe(0);
    expect(await prisma.sourceObservation.count({ where: { ...siblingScope, connectorId } })).toBe(0);
  }, 15 * 60 * 1000);

  it("rejects excerpts when the Session disclosure budget is zero", async () => {
    const descriptor = await startKnowledgeScan({
      architectureScope,
      connectorId,
      designChangeSessionId: designSessionId,
      scannerReleaseId: releaseId,
      snapshotIdentity: { repositoryId: "repo:zero-excerpt", snapshotDigest },
      budgets: { maxExcerptBytes: 0 }
    });
    const batch = scaleBatch(descriptor.sessionId, descriptor.sessionNonce, 0, null, 1);
    batch.observations[0]!.evidenceRefs[0] = { ...batch.observations[0]!.evidenceRefs[0]!, kind: "SOURCE_EXCERPT", excerpt: "must not be accepted" };
    batch.batchDigest = computeBatchIntegrity(batch).batchDigest;
    await expect(submitScanBatch({ architectureScope, batch })).rejects.toThrow("SCAN_EVIDENCE_EXCERPT_BUDGET_EXCEEDED");
  });
});

function scaleBatch(sessionId: string, nonce: string, sequence: number, previousBatchDigest: string | null, count: number): KnowledgeScanBatch {
  const observations = Array.from({ length: count }, (_, offset) => scaleObservation(sequence * 500 + offset));
  const unsigned = {
    contractVersion: "2.0" as const,
    sessionId,
    sequence,
    previousBatchDigest,
    sessionNonceDigest: digest(nonce),
    architectureScope,
    observations,
    coverageDelta: { indexedFiles: count, skippedFiles: 0, observationCount: count, coverageGaps: [] }
  };
  return { ...unsigned, batchDigest: computeBatchIntegrity(unsigned).batchDigest };
}

function scaleObservation(index: number): SourceObservationV2 {
  const id = `observation:scale:${index}`;
  const evidenceDigest = digest(`evidence:${index}`);
  return {
    id,
    observationType: "repository-metadata",
    architectureLayer: "TECH",
    aspectHint: "structure",
    repository: { repositoryId: "repo:scale-fixture", snapshotKind: "COMMIT", snapshotDigest, commit: "0123456789abcdef0123456789abcdef01234567" },
    source: { path: `metadata/component-${index}.json`, symbol: `component-${index}`, lineStart: null, lineEnd: null },
    parser: { id: "scale-fixture", version: "1.0.0" },
    payload: { component: `component-${index}` },
    sensitivity: "INTERNAL",
    redaction: { status: "BLOCKED", reasons: ["METADATA_ONLY_SCALE_PROOF"] },
    evidenceRefs: [{ id: `evidence:scale:${index}`, kind: "CONTENT_ADDRESS", digest: evidenceDigest }],
    normalizedDigest: digest(id),
    warnings: [],
    coverageGaps: []
  };
}

function signedRelease(): { manifest: ScannerReleaseManifest; trustBundle: Record<string, string> } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const unsigned = {
    contractVersion: "2.0" as const,
    releaseId,
    scannerVersion: "9.9.9",
    platform: "windows-amd64",
    artifact: { uri: "file:///scale/specforge.exe", sha256: "6".repeat(64), sizeBytes: 1024 },
    schemaVersions: ["2.0"],
    extractors: [{ id: "scale-fixture", version: "1.0.0" }],
    signingKeyId: `${prefix}-key`,
    algorithm: "Ed25519" as const,
    issuedAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2099-08-03T00:00:00.000Z",
    status: "ACTIVE" as const
  };
  const signature = sign(null, canonicalUnsignedReleaseBytes(unsigned), privateKey).toString("base64");
  const manifest = { ...unsigned, signature };
  return { manifest, trustBundle: { [manifest.signingKeyId]: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64") } };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function deleteFixtures(): Promise<void> {
  const sessions = await prisma.knowledgeScanSession.findMany({ where: { ...architectureScope, connectorId }, select: { id: true } }).catch(() => []);
  for (const session of sessions) {
    await prisma.knowledgeScanBatch.deleteMany({ where: { ...architectureScope, sessionId: session.id } });
    await prisma.sourceObservation.deleteMany({ where: { ...architectureScope, idempotencyKey: { startsWith: `scan-batch:${session.id}:` } } });
  }
  await prisma.knowledgeScanSession.deleteMany({ where: { ...architectureScope, connectorId } }).catch(() => undefined);
  await prisma.scannerRelease.deleteMany({ where: { id: releaseId } }).catch(() => undefined);
  await prisma.designChangeSession.deleteMany({ where: { ...architectureScope, id: designSessionId } }).catch(() => undefined);
  await prisma.connectorInstance.deleteMany({ where: { ...architectureScope, id: connectorId } }).catch(() => undefined);
}
