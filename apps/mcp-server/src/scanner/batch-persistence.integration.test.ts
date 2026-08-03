import { scopeById } from "@specforge/core";
import type { KnowledgeScanBatch, ScannerReleaseManifest, SourceObservationV2 } from "@specforge/scan-contract";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDesignChangeSession, registerConnector } from "../federation/persistence";
import { disconnectMcpPersistence, prisma } from "../persistence";
import { computeBatchIntegrity, submitScanBatch } from "./batch-persistence";
import { canonicalUnsignedReleaseBytes, persistScannerRelease } from "./release";
import { finalizeKnowledgeScan, getScanCheckpoint, startKnowledgeScan } from "./session";

const integrationEnabled = process.env.SPECFORGE_KNOWLEDGE_INTEGRATION === "1";
const scope = scopeById("com.huawei.celon.desiner")!;
const siblingScope = scopeById("com.huawei.celon.policyhub")!;
const architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
const prefix = "test-governed-scan-v2";
const releaseId = `${prefix}-release`;
const connectorId = `${prefix}-connector`;
const designChangeSessionId = `${prefix}-design-change`;
const snapshotDigest = "e".repeat(64);

describe.runIf(integrationEnabled)("governed scan batch persistence", () => {
  beforeAll(async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    await deleteFixtures();
    const { manifest, trustBundle } = signedRelease();
    await persistScannerRelease({ manifest }, trustBundle);
    await registerConnector({ id: connectorId, kind: "local-scanner-v2", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope });
    await createDesignChangeSession({
      id: designChangeSessionId,
      actorId: "specforge-seed",
      intent: "Verify governed scan ingestion",
      affectedFactIds: [`${prefix}-pending`],
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

  it("atomically persists observations and checkpoint, supports retry, and rejects cross-Scope/conflicting reuse", async () => {
    const descriptor = await startKnowledgeScan({
      architectureScope,
      connectorId,
      designChangeSessionId,
      scannerReleaseId: releaseId,
      snapshotIdentity: { repositoryId: "repo:fixture", snapshotDigest },
      repositoryPolicy: { allowDirtyWorktree: false, ignorePatterns: ["node_modules/**"] }
    });
    const acceptedBatch = buildBatch(descriptor.sessionId, descriptor.sessionNonce);

    const accepted = await submitScanBatch({ architectureScope, batch: acceptedBatch });
    const retried = await submitScanBatch({ architectureScope, batch: acceptedBatch });
    expect(accepted).toMatchObject({ acceptedSequence: 0, idempotent: false });
    expect(retried).toMatchObject({ acceptedSequence: 0, idempotent: true });
    expect(await prisma.knowledgeScanBatch.count({ where: { ...architectureScope, sessionId: descriptor.sessionId } })).toBe(1);
    expect(await prisma.sourceObservation.count({ where: { ...architectureScope, idempotencyKey: { startsWith: `scan-batch:${descriptor.sessionId}:` } } })).toBe(1);
    expect(await getScanCheckpoint({ architectureScope, sessionId: descriptor.sessionId })).toMatchObject({ latestAcceptedSequence: 0, observationCount: 1, cumulativeDigest: acceptedBatch.batchDigest });

    await expect(submitScanBatch({
      architectureScope: { applicationServiceId: siblingScope.id, scopePath: siblingScope.scopePath },
      batch: acceptedBatch
    })).rejects.toThrow("SCOPE_MISMATCH");

    const conflicting = buildBatch(descriptor.sessionId, descriptor.sessionNonce, { payload: { method: "DELETE" } });
    await expect(submitScanBatch({ architectureScope, batch: conflicting })).rejects.toThrow("SCAN_BATCH_SEQUENCE_CONFLICT");

    const duplicateObservation = buildBatch(descriptor.sessionId, descriptor.sessionNonce, {
      sequence: 1,
      previousBatchDigest: acceptedBatch.batchDigest,
      payload: { method: "POST" }
    });
    await expect(submitScanBatch({ architectureScope, batch: duplicateObservation })).rejects.toThrow("SCAN_SESSION_DUPLICATE_OBSERVATION_ID");

    const finalized = await finalizeKnowledgeScan({
      architectureScope,
      sessionId: descriptor.sessionId,
      finalization: {
        contractVersion: "2.0",
        sessionId: descriptor.sessionId,
        architectureScope,
        repositorySnapshotDigest: snapshotDigest,
        manifestDigest: "9".repeat(64),
        finalBatchDigest: acceptedBatch.batchDigest,
        batchCount: 1,
        observationCount: 1,
        coverage: { indexedFiles: 1, skippedFiles: 0, observationCount: 1, coverageGaps: [] },
        generatedAt: "2026-08-03T00:00:00.000Z"
      }
    });
    expect(finalized.status).toBe("READY_FOR_ANALYSIS");
    await expect(submitScanBatch({ architectureScope, batch: acceptedBatch })).resolves.toMatchObject({ acceptedSequence: 0, idempotent: true });
  }, 30000);
});

function buildBatch(sessionId: string, nonce: string, overrides: { payload?: Record<string, unknown>; sequence?: number; previousBatchDigest?: string | null } = {}): KnowledgeScanBatch {
  const observation: SourceObservationV2 = {
    id: "observation:api-1",
    observationType: "api-operation",
    architectureLayer: "SYS",
    aspectHint: "public-contract",
    repository: { repositoryId: "repo:fixture", snapshotKind: "COMMIT", snapshotDigest, commit: "0123456789abcdef" },
    source: { path: "src/api.ts", symbol: "getPolicy", lineStart: 1, lineEnd: 5 },
    parser: { id: "typescript-ast", version: "1.0.0" },
    payload: overrides.payload ?? { method: "GET" },
    sensitivity: "INTERNAL",
    redaction: { status: "NONE", reasons: [] },
    evidenceRefs: [{ id: "evidence:api-1", kind: "SOURCE_EXCERPT", digest: "f".repeat(64), excerpt: "GET /policy" }],
    normalizedDigest: createHash("sha256").update(JSON.stringify(overrides.payload ?? { method: "GET" })).digest("hex"),
    warnings: [],
    coverageGaps: []
  };
  const unsigned = {
    contractVersion: "2.0" as const,
    sessionId,
    sequence: overrides.sequence ?? 0,
    previousBatchDigest: overrides.previousBatchDigest ?? null,
    sessionNonceDigest: createHash("sha256").update(nonce).digest("hex"),
    architectureScope,
    observations: [observation],
    coverageDelta: { indexedFiles: 1, skippedFiles: 0, observationCount: 1, coverageGaps: [] }
  };
  return { ...unsigned, batchDigest: computeBatchIntegrity(unsigned).batchDigest };
}

function signedRelease(): { manifest: ScannerReleaseManifest; trustBundle: Record<string, string> } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const unsigned = {
    contractVersion: "2.0" as const,
    releaseId,
    scannerVersion: "2.0.0-test",
    platform: "windows-amd64",
    artifact: { uri: "file:///test/specforge.exe", sha256: "a".repeat(64), sizeBytes: 1024 },
    schemaVersions: ["2.0"],
    extractors: [{ id: "fixture", version: "1.0.0" }],
    signingKeyId: `${prefix}-key`,
    algorithm: "Ed25519" as const,
    issuedAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2099-08-03T00:00:00.000Z",
    status: "ACTIVE" as const
  };
  const signature = sign(null, canonicalUnsignedReleaseBytes(unsigned), privateKey).toString("base64");
  const manifest = { ...unsigned, signature };
  const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { manifest, trustBundle: { [manifest.signingKeyId]: rawPublicKey } };
}

async function deleteFixtures() {
  const sessions = await prisma.knowledgeScanSession.findMany({ where: { ...architectureScope, id: { startsWith: prefix } }, select: { id: true } }).catch(() => []);
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length > 0) {
    await prisma.knowledgeScanBatch.deleteMany({ where: { ...architectureScope, sessionId: { in: sessionIds } } });
    for (const sessionId of sessionIds) {
      await prisma.sourceObservation.deleteMany({ where: { ...architectureScope, idempotencyKey: { startsWith: `scan-batch:${sessionId}:` } } });
    }
  }
  await prisma.knowledgeScanSession.deleteMany({ where: { ...architectureScope, id: { startsWith: prefix } } }).catch(() => undefined);
  await prisma.scannerRelease.deleteMany({ where: { id: releaseId } }).catch(() => undefined);
  await prisma.designChangeSession.deleteMany({ where: { ...architectureScope, id: designChangeSessionId } }).catch(() => undefined);
  await prisma.connectorInstance.deleteMany({ where: { ...architectureScope, id: connectorId } }).catch(() => undefined);
}
