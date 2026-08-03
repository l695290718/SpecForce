import type { ScannerReleaseManifest } from "@specforge/scan-contract";
import { createPublicKey, verify as verifySignature } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { ArchitectureScopeRef } from "@specforge/core";
import { ensureMcpPersistenceSchema, prisma, writableActor } from "../persistence";

type ManifestRecord = ScannerReleaseManifest & Record<string, unknown>;
type TrustedReleaseKeys = Readonly<Record<string, string>>;

export interface ScannerReleasePolicyRow {
  status: string;
  revokedAt: Date | null;
  revocationReason: string | null;
  manifest: unknown;
}

export interface GetScannerReleaseInput {
  sessionId: string;
  architectureScope: ArchitectureScopeRef;
}

export interface PersistScannerReleaseInput {
  manifest: ScannerReleaseManifest;
  artifactDigests?: Record<string, string>;
  status?: "ACTIVE" | "REVOKED" | "SUPERSEDED";
}

export function canonicalUnsignedReleaseBytes(value: unknown): Uint8Array {
  const manifest = requireRecord(value, "SCANNER_RELEASE_MANIFEST_INVALID");
  const unsigned = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "signature"));
  return Buffer.from(canonicalJson(unsigned), "utf8");
}

export function verifyScannerReleaseManifest(value: unknown, trustedKeys: TrustedReleaseKeys): boolean {
  try {
    const manifest = requireRecord(value, "SCANNER_RELEASE_MANIFEST_INVALID");
    if (manifest.algorithm !== "Ed25519") return false;
    const keyId = requireString(manifest.signingKeyId, "SCANNER_RELEASE_KEY_ID_REQUIRED");
    const signature = Buffer.from(requireString(manifest.signature, "SCANNER_RELEASE_SIGNATURE_REQUIRED"), "base64");
    const rawPublicKey = Buffer.from(trustedKeys[keyId] ?? "", "base64");
    if (rawPublicKey.length !== 32 || signature.length !== 64) return false;
    const spkiPrefix = Buffer.from("302a300506032b6570032100", "hex");
    const publicKey = createPublicKey({ key: Buffer.concat([spkiPrefix, rawPublicKey]), format: "der", type: "spki" });
    return verifySignature(null, canonicalUnsignedReleaseBytes(manifest), publicKey, signature);
  } catch {
    return false;
  }
}

export function assertScannerReleaseAvailable(row: ScannerReleasePolicyRow, now = new Date()): void {
  if (row.status === "REVOKED" || row.revokedAt) throw new Error("SCANNER_RELEASE_REVOKED");
  if (row.status !== "ACTIVE") throw new Error("SCANNER_RELEASE_NOT_ACTIVE");
  const manifest = requireRecord(row.manifest, "SCANNER_RELEASE_MANIFEST_INVALID");
  if (typeof manifest.expiresAt === "string" && new Date(manifest.expiresAt).getTime() <= now.getTime()) {
    throw new Error("SCANNER_RELEASE_EXPIRED");
  }
}

export async function persistScannerRelease(input: PersistScannerReleaseInput, trustedKeys = configuredTrustBundle()) {
  const manifest = requireRecord(input.manifest, "SCANNER_RELEASE_MANIFEST_INVALID") as ManifestRecord;
  assertManifestIdentity(manifest);
  if (!verifyScannerReleaseManifest(manifest, trustedKeys)) throw new Error("SCANNER_RELEASE_SIGNATURE_INVALID");
  await ensureMcpPersistenceSchema();
  const id = requireString(manifest.releaseId, "SCANNER_RELEASE_ID_REQUIRED");
  const requestedStatus = input.status ?? "ACTIVE";
  const existing = await prisma.scannerRelease.findUnique({ where: { id } });
  if (existing) {
    assertScannerReleaseImmutable(existing, manifest, requestedStatus);
    return existing;
  }
  return prisma.scannerRelease.create({
    data: {
      id: requireString(manifest.releaseId, "SCANNER_RELEASE_ID_REQUIRED"),
      version: requireString(manifest.scannerVersion, "SCANNER_RELEASE_VERSION_REQUIRED"),
      contractVersion: requireString(manifest.contractVersion, "SCAN_CONTRACT_VERSION_REQUIRED"),
      artifactDigests: jsonValue(input.artifactDigests ?? artifactDigestsOf(manifest)),
      manifest: jsonValue(manifest),
      signature: requireString(manifest.signature, "SCANNER_RELEASE_SIGNATURE_REQUIRED"),
      keyId: requireString(manifest.signingKeyId, "SCANNER_RELEASE_KEY_ID_REQUIRED"),
      status: requestedStatus,
      publishedAt: new Date(requireString(manifest.issuedAt, "SCANNER_RELEASE_PUBLISHED_AT_REQUIRED"))
    }
  });
}

export function assertScannerReleaseImmutable(
  existing: { id: string; version: string; contractVersion: string; signature: string; keyId: string; status: string; manifest: unknown },
  manifest: ScannerReleaseManifest,
  requestedStatus: string
): void {
  if (existing.status === "REVOKED" && requestedStatus !== "REVOKED") throw new Error("SCANNER_RELEASE_REACTIVATION_FORBIDDEN");
  if (existing.status !== requestedStatus || canonicalJson(existing.manifest) !== canonicalJson(manifest)) throw new Error("SCANNER_RELEASE_IMMUTABLE");
  assertStoredManifestMatches(existing, manifest as ManifestRecord);
}

export async function getScannerRelease(input: GetScannerReleaseInput) {
  if (!input.sessionId) throw new Error("SCAN_SESSION_ID_REQUIRED");
  await ensureMcpPersistenceSchema();
  const matches = await prisma.knowledgeScanSession.findMany({ where: { id: input.sessionId }, take: 2 });
  if (matches.length === 0) throw new Error("SCAN_SESSION_NOT_FOUND");
  if (matches.length > 1) throw new Error("SCAN_SESSION_ID_AMBIGUOUS");
  const session = matches[0]!;
  assertScopeEquals({ applicationServiceId: session.applicationServiceId, scopePath: session.scopePath }, input.architectureScope);
  if (session.actorId !== writableActor().actorId) throw new Error("SCAN_SESSION_ACTOR_MISMATCH");
  const release = await prisma.scannerRelease.findUnique({ where: { id: session.scannerReleaseId } });
  if (!release) throw new Error("SCANNER_RELEASE_NOT_FOUND");
  assertScannerReleaseAvailable(release);
  const manifest = requireRecord(release.manifest, "SCANNER_RELEASE_MANIFEST_INVALID") as ManifestRecord;
  assertStoredManifestMatches(release, manifest);
  const trustedKeys = configuredTrustBundle();
  if (Object.keys(trustedKeys).length > 0 && !verifyScannerReleaseManifest(manifest, trustedKeys)) {
    throw new Error("SCANNER_RELEASE_SIGNATURE_INVALID");
  }
  if (process.env.NODE_ENV === "production" && Object.keys(trustedKeys).length === 0) {
    throw new Error("SCANNER_RELEASE_TRUST_BUNDLE_REQUIRED");
  }
  return {
    releaseId: release.id,
    version: release.version,
    contractVersion: release.contractVersion,
    artifactDigests: release.artifactDigests,
    manifest
  };
}

function assertStoredManifestMatches(release: { id: string; version: string; contractVersion: string; signature: string; keyId: string }, manifest: ManifestRecord): void {
  if (manifest.releaseId !== release.id || manifest.scannerVersion !== release.version || manifest.contractVersion !== release.contractVersion || manifest.signature !== release.signature || manifest.signingKeyId !== release.keyId) {
    throw new Error("SCANNER_RELEASE_RECORD_MISMATCH");
  }
}

function assertManifestIdentity(manifest: ManifestRecord): void {
  requireString(manifest.releaseId, "SCANNER_RELEASE_ID_REQUIRED");
  requireString(manifest.scannerVersion, "SCANNER_RELEASE_VERSION_REQUIRED");
  requireString(manifest.contractVersion, "SCAN_CONTRACT_VERSION_REQUIRED");
  requireString(manifest.signingKeyId, "SCANNER_RELEASE_KEY_ID_REQUIRED");
  requireString(manifest.signature, "SCANNER_RELEASE_SIGNATURE_REQUIRED");
  const publishedAt = new Date(requireString(manifest.issuedAt, "SCANNER_RELEASE_PUBLISHED_AT_REQUIRED"));
  if (Number.isNaN(publishedAt.getTime())) throw new Error("SCANNER_RELEASE_PUBLISHED_AT_INVALID");
}

function artifactDigestsOf(manifest: ManifestRecord): Record<string, string> {
  if (manifest.artifact && typeof manifest.artifact === "object" && !Array.isArray(manifest.artifact)) {
    const artifact = manifest.artifact as unknown as Record<string, unknown>;
    if (typeof artifact.sha256 === "string") return { [String(manifest.platform ?? "default")]: artifact.sha256 };
  }
  return {};
}

function configuredTrustBundle(): TrustedReleaseKeys {
  const raw = process.env.SPECFORGE_SCANNER_RELEASE_TRUST_BUNDLE;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return requireRecord(parsed, "SCANNER_RELEASE_TRUST_BUNDLE_INVALID") as Record<string, string>;
  } catch {
    throw new Error("SCANNER_RELEASE_TRUST_BUNDLE_INVALID");
  }
}

function assertScopeEquals(authoritative: ArchitectureScopeRef, assertion: ArchitectureScopeRef): void {
  if (authoritative.applicationServiceId !== assertion.applicationServiceId || authoritative.scopePath !== assertion.scopePath) {
    throw new Error("SCOPE_MISMATCH");
  }
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(code);
  return value;
}

function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error("CANONICAL_JSON_UNSUPPORTED_VALUE");
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
