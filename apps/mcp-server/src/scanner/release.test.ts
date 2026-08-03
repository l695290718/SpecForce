import { generateKeyPairSync, sign } from "node:crypto";
import type { ScannerReleaseManifest } from "@specforge/scan-contract";
import { describe, expect, it } from "vitest";
import {
  assertScannerReleaseImmutable,
  assertScannerReleaseAvailable,
  canonicalUnsignedReleaseBytes,
  verifyScannerReleaseManifest
} from "./release";

function signedManifest(): { manifest: ScannerReleaseManifest; rawPublicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const unsigned = {
    releaseId: "scanner-release-2.0.0",
    scannerVersion: "2.0.0",
    contractVersion: "2.0" as const,
    platform: "windows-amd64",
    artifact: { uri: "https://artifacts.example/scanner.exe", sha256: "a".repeat(64), sizeBytes: 1024 },
    schemaVersions: ["2.0"],
    extractors: [],
    algorithm: "Ed25519" as const,
    signingKeyId: "release-key-2026-08",
    issuedAt: "2026-08-03T00:00:00.000Z",
    expiresAt: "2026-09-03T00:00:00.000Z",
    status: "ACTIVE" as const
  };
  const signature = sign(null, canonicalUnsignedReleaseBytes(unsigned), privateKey).toString("base64");
  const rawPublicKey = publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64");
  return { manifest: { ...unsigned, signature }, rawPublicKey };
}

describe("scanner release trust", () => {
  it("verifies an Ed25519 manifest against an explicitly trusted raw public key", () => {
    const { manifest, rawPublicKey } = signedManifest();

    expect(verifyScannerReleaseManifest(manifest, { [manifest.signingKeyId]: rawPublicKey })).toBe(true);
    expect(verifyScannerReleaseManifest({ ...manifest, artifact: { ...manifest.artifact, sha256: "b".repeat(64) } }, { [manifest.signingKeyId]: rawPublicKey })).toBe(false);
  });

  it("fails closed for revoked and expired releases", () => {
    const { manifest } = signedManifest();
    const base = { status: "ACTIVE", revokedAt: null, revocationReason: null, manifest };

    expect(() => assertScannerReleaseAvailable({ ...base, status: "REVOKED" }, new Date("2026-08-04T00:00:00.000Z"))).toThrow("SCANNER_RELEASE_REVOKED");
    expect(() => assertScannerReleaseAvailable(base, new Date("2026-10-04T00:00:00.000Z"))).toThrow("SCANNER_RELEASE_EXPIRED");
  });

  it("keeps a persisted release immutable and never reactivates a revoked record", () => {
    const { manifest } = signedManifest();
    const stored = { id: manifest.releaseId, version: manifest.scannerVersion, contractVersion: manifest.contractVersion, signature: manifest.signature, keyId: manifest.signingKeyId, status: "ACTIVE", manifest };

    expect(() => assertScannerReleaseImmutable(stored, manifest, "ACTIVE")).not.toThrow();
    expect(() => assertScannerReleaseImmutable({ ...stored, status: "REVOKED" }, manifest, "ACTIVE")).toThrow("SCANNER_RELEASE_REACTIVATION_FORBIDDEN");
    expect(() => assertScannerReleaseImmutable(stored, { ...manifest, artifact: { ...manifest.artifact, uri: "https://artifacts.example/changed.exe" } }, "ACTIVE")).toThrow("SCANNER_RELEASE_IMMUTABLE");
  });
});
