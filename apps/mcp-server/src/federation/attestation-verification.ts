import { createHash, createPublicKey, verify } from "node:crypto";
import type { ArchitectureScopeRef } from "@specforge/core";
import { prisma } from "../persistence";

export type AttestationEnvelope = {
  payload: Record<string, unknown>;
  signature: string;
  publicKey: string;
};

export type AttestationVerificationEvidence = {
  repositoryId: string;
  parentCommit?: string;
  committedTreeHash: string;
  fileManifestDigest?: string;
  scopeMappingDigest?: string;
  requiredScopes: ArchitectureScopeRef[];
};

export type VerifiedAttestation = {
  status: "VERIFIED";
  attestationId: string;
  repositoryId: string;
  stagedTreeHash: string;
  policyVersion: string;
  expiresAt: string;
  scopes: Array<{ architectureScope: ArchitectureScopeRef; sessionId: string }>;
};

export async function verifyPersistedChangeAttestation(input: {
  attestation: AttestationEnvelope;
  evidence: AttestationVerificationEvidence;
}): Promise<VerifiedAttestation> {
  const result = verifyChangeAttestation(input);
  for (const binding of result.scopes) {
    const session = await prisma.designChangeSession.findUnique({
      where: { applicationServiceId_scopePath_id: { ...binding.architectureScope, id: binding.sessionId } }
    });
    if (!session) throw new Error("ATTESTATION_SESSION_NOT_FOUND");
    if (session.status !== "CONVERGED") throw new Error("ATTESTATION_SESSION_NOT_CONVERGED");
    const reconciliation = await prisma.reconciliationSnapshot.findFirst({ where: binding.architectureScope, orderBy: { createdAt: "desc" } });
    if (!reconciliation || reconciliation.status !== "CONVERGED") throw new Error("ATTESTATION_RECONCILIATION_NOT_CONVERGED");
  }
  return result;
}

export function verifyChangeAttestation(input: {
  attestation: AttestationEnvelope;
  evidence: AttestationVerificationEvidence;
}): VerifiedAttestation {
  const payload = input.attestation.payload;
  const attestationId = stringValue(payload.attestationId);
  const repositoryId = stringValue(payload.repositoryId);
  const stagedTreeHash = stringValue(payload.stagedTreeHash);
  const expiresAt = stringValue(payload.expiresAt);
  const policyVersion = stringValue(payload.policyVersion);
  if (payload.schemaVersion !== 1 || !attestationId || !repositoryId || !stagedTreeHash || !expiresAt || !policyVersion || payload.algorithm !== "Ed25519") throw new Error("ATTESTATION_PAYLOAD_INVALID");
  if (repositoryId !== input.evidence.repositoryId) throw new Error("ATTESTATION_REPOSITORY_MISMATCH");
  if (stagedTreeHash !== input.evidence.committedTreeHash) throw new Error("ATTESTATION_TREE_MISMATCH");
  if (input.evidence.parentCommit && payload.parentCommit !== input.evidence.parentCommit) throw new Error("ATTESTATION_PARENT_COMMIT_MISMATCH");
  if (input.evidence.fileManifestDigest && payload.fileManifestDigest !== input.evidence.fileManifestDigest) throw new Error("ATTESTATION_MANIFEST_MISMATCH");
  if (input.evidence.scopeMappingDigest && payload.scopeMappingDigest !== input.evidence.scopeMappingDigest) throw new Error("ATTESTATION_SCOPE_MAPPING_MISMATCH");
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("ATTESTATION_EXPIRED");

  const keyId = stringValue(payload.keyId);
  if (revokedKeys().includes(keyId)) throw new Error("ATTESTATION_KEY_REVOKED");
  if (process.env.SPECFORGE_TRUSTED_ATTESTATION_KEY && process.env.SPECFORGE_TRUSTED_ATTESTATION_KEY !== input.attestation.publicKey) throw new Error("ATTESTATION_KEY_UNTRUSTED");
  let publicKey: ReturnType<typeof createPublicKey>;
  try { publicKey = createPublicKey({ key: Buffer.from(input.attestation.publicKey, "base64"), format: "der", type: "spki" }); } catch { throw new Error("ATTESTATION_KEY_INVALID"); }
  let signature: Buffer;
  try { signature = Buffer.from(input.attestation.signature, "base64"); } catch { throw new Error("ATTESTATION_SIGNATURE_INVALID"); }
  if (!verify(null, canonicalJson(payload), publicKey, signature)) throw new Error("ATTESTATION_SIGNATURE_INVALID");

  const scopes = parseScopes(payload.scopes);
  for (const required of input.evidence.requiredScopes) {
    if (!scopes.some((binding) => binding.architectureScope.applicationServiceId === required.applicationServiceId && binding.architectureScope.scopePath === required.scopePath)) throw new Error("ATTESTATION_SCOPE_COVERAGE_INCOMPLETE");
  }
  return { status: "VERIFIED", attestationId, repositoryId, stagedTreeHash, policyVersion, expiresAt, scopes };
}

function parseScopes(value: unknown): Array<{ architectureScope: ArchitectureScopeRef; sessionId: string }> {
  if (!Array.isArray(value) || value.length === 0) throw new Error("ATTESTATION_SCOPE_COVERAGE_INCOMPLETE");
  const result: Array<{ architectureScope: ArchitectureScopeRef; sessionId: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || !isRecord(item.architectureScope)) throw new Error("ATTESTATION_PAYLOAD_INVALID");
    const scope = item.architectureScope;
    const architectureScope = { applicationServiceId: stringValue(scope.applicationServiceId), scopePath: stringValue(scope.scopePath) };
    const sessionId = stringValue(item.sessionId);
    if (!architectureScope.applicationServiceId || !architectureScope.scopePath || !sessionId) throw new Error("ATTESTATION_PAYLOAD_INVALID");
    if (result.some((binding) => binding.architectureScope.applicationServiceId === architectureScope.applicationServiceId && binding.architectureScope.scopePath === architectureScope.scopePath)) throw new Error("ATTESTATION_PAYLOAD_INVALID");
    result.push({ architectureScope, sessionId });
  }
  return result;
}

function revokedKeys(): string[] {
  return (process.env.SPECFORGE_REVOKED_ATTESTATION_KEYS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
}

function canonicalJson(value: unknown): Buffer {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return Buffer.from(JSON.stringify(value));
  if (Array.isArray(value)) return Buffer.from(`[${value.map((item) => canonicalJson(item).toString("utf8")).join(",")}]`);
  if (!isRecord(value)) throw new Error("ATTESTATION_PAYLOAD_INVALID");
  return Buffer.from(`{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]).toString("utf8")}`).join(",")}}`);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function attestationDiagnosticDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
