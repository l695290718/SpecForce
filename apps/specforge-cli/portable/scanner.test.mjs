import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { scanRepository } from "./scanner.mjs";

test("portable scanner emits bounded v2 batches and finalization", async () => {
  const root = await mkdtemp(join(tmpdir(), "specforge-portable-"));
  const output = join(root, "out");
  const sessionPath = join(root, "session.json");
  try {
    await writeFile(join(root, "openapi.yaml"), "openapi: 3.0.0\npaths: {}\n", "utf8");
    await writeFile(join(root, "README.md"), "# Existing service\n", "utf8");
    await writeFile(join(root, ".env"), "SECRET=never-read\n", "utf8");
    await writeFile(sessionPath, JSON.stringify({
      contractVersion: "2.0",
      sessionId: "knowledge-scan:test-portable",
      sessionNonce: "nonce-for-portable-test",
      architectureScope: { applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" },
      repositoryPolicy: { ignorePatterns: [], allowDirtyWorktree: true },
      limits: { maxObservationsPerBatch: 1, maxSourceFileBytes: 1_000_000 },
      coveragePlan: { assetFamilies: ["api", "evidence"], capabilities: [], complete: false, digest: "a".repeat(64) },
      policyReceipt: { systemGovernanceDigest: "a".repeat(64), extractorCatalogDigest: "b".repeat(64), semanticPromptPackDigest: "c".repeat(64), scopeRuntimeProfileDigest: "d".repeat(64), effectivePolicyDigest: "e".repeat(64) },
      snapshotIdentity: { repositoryId: "portable-test", snapshotKind: "DIRTY_MANIFEST", snapshotDigest: "f".repeat(64) }
    }), "utf8");

    const result = await scanRepository({ repository: root, sessionPath, output });
    assert.equal(result.observationCount, 2);
    assert.equal(result.batchCount, 2);
    const finalization = JSON.parse(await readFile(join(output, "finalization.json"), "utf8"));
    assert.equal(finalization.observationCount, 2);
    assert.equal(finalization.batchCount, 2);
    assert.equal(finalization.architectureScope.applicationServiceId, "com.specforge.designcenter");
    assert.equal(finalization.finalBatchDigest.length, 64);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("portable scanner rejects an invalid session before reading the repository", async () => {
  const root = await mkdtemp(join(tmpdir(), "specforge-portable-invalid-"));
  const sessionPath = join(root, "session.json");
  try {
    await writeFile(sessionPath, JSON.stringify({ contractVersion: "1.0" }), "utf8");
    await assert.rejects(() => scanRepository({ repository: root, sessionPath, output: join(root, "out") }), /SCAN_SESSION_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
