import { generateKeyPairSync, sign } from "node:crypto";
import type { ArchitectureScopeRef } from "@specforge/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  prisma: {
    designChangeSession: { findUnique: vi.fn() },
    reconciliationSnapshot: { findFirst: vi.fn() }
  }
}));

vi.mock("../persistence", () => persistence);

import { verifyChangeAttestation, verifyPersistedChangeAttestation, type AttestationEnvelope } from "./attestation-verification";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;

const keyPair = generateKeyPairSync("ed25519");
const publicKey = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

function canonical(value: unknown): Buffer {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return Buffer.from(JSON.stringify(value));
  if (Array.isArray(value)) return Buffer.from(`[${value.map((item) => canonical(item).toString("utf8")).join(",")}]`);
  const record = value as Record<string, unknown>;
  return Buffer.from(`{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key]).toString("utf8")}`).join(",")}}`);
}

function envelope(overrides: Record<string, unknown> = {}): AttestationEnvelope {
  const payload = {
    schemaVersion: 1,
    attestationId: "change-attestation:test",
    issuer: "specforge-governance",
    keyId: "test-key",
    algorithm: "Ed25519",
    issuedAt: "2026-08-09T14:00:00.000Z",
    expiresAt: "2999-01-01T00:00:00.000Z",
    policyVersion: "ci-v1",
    repositoryId: "repo-specforge",
    parentCommit: "parent-1",
    stagedTreeHash: "tree-1",
    fileManifestDigest: "manifest-1",
    scopeMappingDigest: "mapping-1",
    scopes: [{ architectureScope: scope, sessionId: "session-1" }],
    ...overrides
  };
  return { payload, publicKey, signature: sign(null, canonical(payload), keyPair.privateKey).toString("base64") };
}

function evidence(requiredScopes: ArchitectureScopeRef[] = [scope]) {
  return {
    repositoryId: "repo-specforge",
    parentCommit: "parent-1",
    committedTreeHash: "tree-1",
    fileManifestDigest: "manifest-1",
    scopeMappingDigest: "mapping-1",
    requiredScopes
  };
}

afterEach(() => {
  delete process.env.SPECFORGE_REVOKED_ATTESTATION_KEYS;
  vi.clearAllMocks();
});

describe("provider-neutral change attestation verification", () => {
  it("verifies a valid committed tree and exact Scope coverage", () => {
    expect(verifyChangeAttestation({ attestation: envelope(), evidence: evidence() })).toMatchObject({ status: "VERIFIED", attestationId: "change-attestation:test", stagedTreeHash: "tree-1" });
  });

  it("rejects a stale committed tree and incomplete Scope coverage", () => {
    expect(() => verifyChangeAttestation({ attestation: envelope(), evidence: { ...evidence(), committedTreeHash: "tree-2" } })).toThrow("ATTESTATION_TREE_MISMATCH");
    const sibling: ArchitectureScopeRef = { applicationServiceId: "com.huawei.celon.runtime", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-runtime/com.huawei.celon.runtime" };
    expect(() => verifyChangeAttestation({ attestation: envelope(), evidence: evidence([sibling]) })).toThrow("ATTESTATION_SCOPE_COVERAGE_INCOMPLETE");
  });

  it("rejects revoked and invalid signatures", () => {
    process.env.SPECFORGE_REVOKED_ATTESTATION_KEYS = "test-key";
    expect(() => verifyChangeAttestation({ attestation: envelope(), evidence: evidence() })).toThrow("ATTESTATION_KEY_REVOKED");
    delete process.env.SPECFORGE_REVOKED_ATTESTATION_KEYS;
    expect(() => verifyChangeAttestation({ attestation: { ...envelope(), signature: Buffer.from("invalid").toString("base64") }, evidence: evidence() })).toThrow("ATTESTATION_SIGNATURE_INVALID");
  });

  it("blocks a non-converged persisted session", async () => {
    persistence.prisma.designChangeSession.findUnique.mockResolvedValue({ status: "OPEN" });
    expect(await verifyPersistedChangeAttestation({ attestation: envelope(), evidence: evidence() }).catch((error) => error.message)).toBe("ATTESTATION_SESSION_NOT_CONVERGED");
  });
});
