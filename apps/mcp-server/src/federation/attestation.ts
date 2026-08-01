import { createHash, createPrivateKey, createPublicKey, randomUUID, sign } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../persistence";
import type { ArchitectureScopeRef } from "@specforge/core";

export type AttestationScopeBinding = {
  architectureScope: ArchitectureScopeRef;
  sessionId: string;
};

export type IssueChangeAttestationInput = {
  repositoryId: string;
  parentCommit: string;
  stagedTreeHash: string;
  fileManifestDigest: string;
  configDigest: string;
  scopeMappingDigest: string;
  manifest: Array<Record<string, unknown>>;
  scopes: AttestationScopeBinding[];
  actorId: string;
  verificationEvidenceRefs: string[];
};

export type IssuedChangeAttestation = {
  payload: Record<string, unknown>;
  signature: string;
  keyId: string;
  publicKey: string;
};

type JsonRecord = Record<string, unknown>;

export async function issueChangeAttestation(input: IssueChangeAttestationInput): Promise<IssuedChangeAttestation> {
  if (!input.scopes.length || !input.verificationEvidenceRefs.length) throw new Error("ATTESTATION_INPUT_INVALID");
  const key = signingKey();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
  const attestationId = `change-attestation:${randomUUID()}`;
  const scopeFacts = await Promise.all(input.scopes.map(async (binding) => {
    const session = await prisma.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...binding.architectureScope, id: binding.sessionId } } });
    if (!session) throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
    if (session.status === "BLOCKED") throw new Error("DESIGN_CHANGE_SESSION_BLOCKED");
    const reconciliation = await prisma.reconciliationSnapshot.findFirst({ where: binding.architectureScope, orderBy: { createdAt: "desc" } });
    if (!reconciliation || reconciliation.status !== "CONVERGED") throw new Error("DESIGN_CONTEXT_RECONCILIATION_BLOCKED");
    return {
      architectureScope: binding.architectureScope,
      sessionId: binding.sessionId,
      affectedFactIds: session.affectedFactIds,
      designContextDigest: session.preflightDigest,
      relationshipDigest: session.preflightRelationshipDigest,
      readAssetIds: session.preflightReadAssetIds,
      reconciliation: { root: reconciliation.root, status: reconciliation.status }
    };
  }));
  const payload: JsonRecord = {
    schemaVersion: 1,
    attestationId,
    issuer: process.env.SPECFORGE_ATTESTATION_ISSUER ?? "specforge-governance",
    keyId: key.keyId,
    algorithm: "Ed25519",
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    policyVersion: process.env.SPECFORGE_ATTESTATION_POLICY_VERSION ?? "local-hook-v1",
    repositoryId: input.repositoryId,
    parentCommit: input.parentCommit,
    stagedTreeHash: input.stagedTreeHash,
    fileManifestDigest: input.fileManifestDigest,
    configDigest: input.configDigest,
    scopeMappingDigest: input.scopeMappingDigest,
    actorId: input.actorId,
    manifest: input.manifest,
    scopes: scopeFacts,
    verificationEvidenceDigest: digest(input.verificationEvidenceRefs)
  };
  const payloadBytes = canonicalJson(payload);
  const signature = sign(null, payloadBytes, key.privateKey);
  const publicKey = createPublicKey(key.privateKey).export({ format: "der", type: "spki" }).toString("base64");
  await prisma.$transaction(async (transaction) => {
    for (const scopeFact of scopeFacts) {
      const scope = scopeFact.architectureScope;
      const session = await transaction.designChangeSession.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: scopeFact.sessionId } } });
      if (!session || session.status === "BLOCKED") throw new Error("DESIGN_CHANGE_SESSION_NOT_FOUND");
      const reconciliation = await transaction.reconciliationSnapshot.findFirst({ where: scope, orderBy: { createdAt: "desc" } });
      if (!reconciliation || reconciliation.status !== "CONVERGED") throw new Error("DESIGN_CONTEXT_RECONCILIATION_BLOCKED");
      const expectedEvidence = Array.isArray(session.expectedEvidenceRefs) ? session.expectedEvidenceRefs as string[] : [];
      const mergedEvidence = [...new Set([...expectedEvidence, ...input.verificationEvidenceRefs])];
      await transaction.designChangeSession.update({
        where: { applicationServiceId_scopePath_id: { ...scope, id: scopeFact.sessionId } },
        data: { status: "CONVERGED", expectedEvidenceRefs: mergedEvidence }
      });
      const persistedPayload = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
      await transaction.changeAttestation.upsert({
        where: { applicationServiceId_scopePath_attestationId: { ...scope, attestationId } },
        create: { ...scope, attestationId, issuer: String(payload.issuer), keyId: key.keyId, algorithm: "Ed25519", payload: persistedPayload, signature: signature.toString("base64"), repositoryId: input.repositoryId, parentCommit: input.parentCommit, stagedTreeHash: input.stagedTreeHash, fileManifestDigest: input.fileManifestDigest, scopeMappingDigest: input.scopeMappingDigest, actorId: input.actorId, expiresAt, policyVersion: String(payload.policyVersion) },
        update: { payload: persistedPayload, signature: signature.toString("base64"), expiresAt, keyId: key.keyId }
      });
      await transaction.federationOutbox.upsert({
        where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: `CHANGE_ATTESTATION_ISSUED:${attestationId}` } },
        create: { ...scope, eventType: "CHANGE_ATTESTATION_ISSUED", payload: { attestationId, sessionId: scopeFact.sessionId, stagedTreeHash: input.stagedTreeHash }, idempotencyKey: `CHANGE_ATTESTATION_ISSUED:${attestationId}`, status: "PENDING", designChangeSessionId: scopeFact.sessionId },
        update: { payload: { attestationId, sessionId: scopeFact.sessionId, stagedTreeHash: input.stagedTreeHash }, status: "PENDING" }
      });
      await transaction.auditLog.create({ data: { actorType: "agent", actorId: input.actorId, channel: "MCP", action: "issue_change_attestation", targetType: "change-attestation", targetId: attestationId, inputSummary: digest({ repositoryId: input.repositoryId, stagedTreeHash: input.stagedTreeHash, architectureScope: scope }), outputSummary: digest({ attestationId, keyId: key.keyId }), status: "success" } });
    }
  });
  return { payload, signature: signature.toString("base64"), keyId: key.keyId, publicKey };
}

function signingKey() {
  const encoded = process.env.SPECFORGE_ATTESTATION_PRIVATE_KEY_PKCS8;
  if (!encoded) throw new Error("ATTESTATION_SIGNING_KEY_UNAVAILABLE");
  let privateKey;
  try { privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" }); } catch { throw new Error("ATTESTATION_SIGNING_KEY_INVALID"); }
  return { privateKey, keyId: process.env.SPECFORGE_ATTESTATION_KEY_ID ?? "local-env-ed25519-1" };
}

function digest(value: unknown): string {
  const bytes = canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: unknown): Buffer {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return Buffer.from(JSON.stringify(value));
  if (Array.isArray(value)) return Buffer.from(`[${value.map((item) => canonicalJson(item).toString("utf8")).join(",")}]`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return Buffer.from(`{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key]).toString("utf8")}`).join(",")}}`);
}
