#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildBatchDigest, canonicalJson, collectRepositoryFiles, fileDescriptor, sha256 } from "./runtime.mjs";

export async function scanRepository({ repository, sessionPath, output }) {
  const session = JSON.parse(await readFile(resolve(sessionPath), "utf8"));
  assertSession(session);
  const files = await collectRepositoryFiles(repository, {
    ignorePatterns: session.repositoryPolicy.ignorePatterns,
    maxSourceFileBytes: session.limits.maxSourceFileBytes
  });
  const snapshot = session.snapshotIdentity ?? session.repositorySnapshot;
  if (!snapshot || typeof snapshot.snapshotDigest !== "string" || !/^[0-9a-f]{64}$/u.test(snapshot.snapshotDigest)) throw new Error("SCAN_SNAPSHOT_IDENTITY_REQUIRED");
  const observations = files.flatMap((file) => {
    const descriptor = fileDescriptor(file.path);
    if (!descriptor) return [];
    const digest = sha256(canonicalJson({ path: file.path, content: file.content }));
    const payload = { path: file.path, sizeBytes: file.sizeBytes, digest, language: descriptor.language, sourceKind: descriptor.observationType };
    return [{
      id: `observation:${digest}`,
      observationType: descriptor.observationType,
      architectureLayer: descriptor.architectureLayer,
      aspectHint: descriptor.aspectHint,
      repository: { repositoryId: String(snapshot.repositoryId ?? "local-repository"), snapshotKind: snapshot.snapshotKind ?? "DIRTY_MANIFEST", snapshotDigest: snapshot.snapshotDigest, commit: snapshot.commit ?? null },
      source: { path: file.path, symbol: null, lineStart: null, lineEnd: null },
      parser: { id: "specforge-portable-scanner", version: "1.0.0" },
      payload,
      sensitivity: "INTERNAL",
      redaction: { status: "NONE", reasons: [] },
      evidenceRefs: [{ id: `evidence:${digest}`, kind: "CONTENT_ADDRESS", digest }],
      normalizedDigest: sha256(canonicalJson(payload)),
      warnings: [],
      coverageGaps: []
    }];
  });
  const maxBatchSize = session.limits.maxObservationsPerBatch;
  const batches = [];
  let previousBatchDigest = null;
  for (let offset = 0; offset < observations.length || offset === 0; offset += maxBatchSize) {
    const page = observations.slice(offset, offset + maxBatchSize);
    const batch = {
      contractVersion: "2.0",
      sessionId: session.sessionId,
      sequence: batches.length,
      previousBatchDigest,
      sessionNonceDigest: sha256(session.sessionNonce),
      architectureScope: session.architectureScope,
      observations: page,
      coverageDelta: { indexedFiles: files.length, skippedFiles: 0, observationCount: page.length, coverageGaps: [] },
      batchDigest: ""
    };
    batch.batchDigest = buildBatchDigest(batch);
    previousBatchDigest = batch.batchDigest;
    batches.push(batch);
    if (page.length === 0) break;
  }
  const manifest = files.map((file) => ({ path: file.path, sizeBytes: file.sizeBytes, digest: sha256(canonicalJson({ path: file.path, content: file.content })) }));
  const finalization = {
    contractVersion: "2.0",
    sessionId: session.sessionId,
    architectureScope: session.architectureScope,
    repositorySnapshotDigest: snapshot.snapshotDigest,
    manifestDigest: sha256(canonicalJson(manifest)),
    finalBatchDigest: previousBatchDigest,
    batchCount: batches.length,
    observationCount: observations.length,
    coverage: { indexedFiles: files.length, skippedFiles: 0, observationCount: observations.length, coverageGaps: [] },
    coveragePlan: session.coveragePlan,
    policyReceipt: session.policyReceipt,
    generatedAt: new Date().toISOString()
  };
  const outputDirectory = resolve(output);
  await mkdir(outputDirectory, { recursive: true });
  for (const batch of batches) await writeFile(resolve(outputDirectory, `batch-${String(batch.sequence).padStart(5, "0")}.json`), `${JSON.stringify(batch, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDirectory, "finalization.json"), `${JSON.stringify(finalization, null, 2)}\n`, "utf8");
  await writeFile(resolve(outputDirectory, "scan-summary.json"), `${JSON.stringify({ sessionId: session.sessionId, observationCount: observations.length, batchCount: batches.length, finalBatchDigest: previousBatchDigest }, null, 2)}\n`, "utf8");
  return { sessionId: session.sessionId, observationCount: observations.length, batchCount: batches.length, finalBatchDigest: previousBatchDigest };
}

function assertSession(session) {
  if (!session || session.contractVersion !== "2.0" || typeof session.sessionId !== "string" || !session.architectureScope || !session.repositoryPolicy || !session.limits || !session.coveragePlan || !session.policyReceipt || typeof session.sessionNonce !== "string") throw new Error("SCAN_SESSION_INVALID");
  if (session.limits.maxObservationsPerBatch < 1 || session.limits.maxObservationsPerBatch > 500) throw new Error("SCAN_LIMITS_EXCEEDED");
}

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith("scanner.mjs")) {
  const repository = valueAfter(process.argv.slice(2), "--repository");
  const sessionPath = valueAfter(process.argv.slice(2), "--session");
  const output = valueAfter(process.argv.slice(2), "--output");
  if (!repository || !sessionPath || !output) {
    process.stderr.write("usage: scanner.mjs --repository <path> --session <file> --output <directory>\n");
    process.exitCode = 2;
  } else {
    scanRepository({ repository, sessionPath, output }).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : "SCAN_FAILED"}\n`);
      process.exitCode = 1;
    });
  }
}
