import { generateKeyPairSync, sign } from "node:crypto";
import type { ScannerReleaseManifest } from "@specforge/scan-contract";
import { describe, expect, it } from "vitest";
import {
  assertScannerReleaseImmutable,
  assertScannerReleaseAvailable,
  canonicalUnsignedReleaseBytes,
  isScannerReleaseCompatible,
  selectScannerRelease,
  type ScannerCapabilities,
  verifyScannerReleaseManifest,
  type ScannerReleaseCandidate
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

  it("prefers a compatible portable release and rejects an incompatible explicit release", async () => {
    const { manifest: native } = signedManifest();
    const portable = {
      ...native,
      releaseId: "scanner-release-portable",
      scannerVersion: "2.1.0",
      platform: "any",
      artifactKind: "PORTABLE_SCRIPT" as const,
      architecture: "any",
      runtime: { name: "node" as const, versionRange: ">=20 <23" },
      entrypoint: "scanner.mjs"
    };
    const rows = [
      candidate(native, new Date("2026-08-03T00:00:00.000Z")),
      candidate({ ...portable, releaseId: "scanner-release-portable-older", scannerVersion: "2.0.1" }, new Date("2026-08-02T00:00:00.000Z")),
      candidate(portable, new Date("2026-08-04T00:00:00.000Z"))
    ];
    const capabilities: ScannerCapabilities = { artifactKinds: ["PORTABLE_SCRIPT", "NATIVE_BINARY"], platform: "windows-amd64", architecture: "amd64", runtimes: [{ name: "node", version: "20.11.0" }] };

    expect(isScannerReleaseCompatible(rows[2]!, capabilities, "2.0")).toBe(true);
    await expect(selectScannerRelease({ capabilities, contractVersion: "2.0", now: new Date("2026-08-05T00:00:00.000Z") }, rows)).resolves.toMatchObject({ id: "scanner-release-portable" });
    await expect(selectScannerRelease({ requestedReleaseId: native.releaseId, capabilities, contractVersion: "2.0", now: new Date("2026-08-05T00:00:00.000Z") }, rows)).resolves.toMatchObject({ id: native.releaseId });
    await expect(selectScannerRelease({ requestedReleaseId: native.releaseId, capabilities: { ...capabilities, artifactKinds: ["PORTABLE_SCRIPT"] }, contractVersion: "2.0", now: new Date("2026-08-05T00:00:00.000Z") }, rows)).rejects.toThrow("SCANNER_RELEASE_INCOMPATIBLE");
  });
});

function candidate(manifest: ScannerReleaseManifest, publishedAt: Date): ScannerReleaseCandidate {
  return { id: manifest.releaseId, version: manifest.scannerVersion, contractVersion: manifest.contractVersion, status: manifest.status, revokedAt: null, revocationReason: null, manifest, publishedAt };
}
