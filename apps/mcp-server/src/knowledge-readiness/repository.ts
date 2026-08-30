import { Prisma, type PrismaClient } from "@prisma/client";
import type { ArchitectureScopeRef, KnowledgeReadinessPolicyOverlay } from "@specforge/core";

export type ReadinessDb = PrismaClient | Prisma.TransactionClient;

export interface PolicyOverlayInput {
  architectureScope: ArchitectureScopeRef;
  actorId: string;
  overlay: KnowledgeReadinessPolicyOverlay;
}

export interface ImmutableReceiptInput {
  architectureScope: ArchitectureScopeRef;
  id: string;
  deterministicKey: string;
  subjectId: string;
  grantDigest: string;
  profileId: string;
  selectorDigest: string;
  purpose: string;
  locale: string;
  policyId: string;
  policyVersion: number;
  trustStatus: string;
  dimensionStatuses: unknown;
  baselineBindings: unknown;
  sourceWaterlines: unknown;
  coverageSummary: unknown;
  freshnessSummary: unknown;
  reasonCodes: unknown;
  remediationActions: unknown;
  asOf: Date;
  validUntil: Date;
  receiptDigest: string;
}

function scopeWhere(scope: ArchitectureScopeRef) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function getActivePolicyOverlay(
  db: ReadinessDb,
  architectureScope: ArchitectureScopeRef,
  profileId: KnowledgeReadinessPolicyOverlay["profileId"]
) {
  return db.knowledgeReadinessPolicy.findFirst({
    where: { ...scopeWhere(architectureScope), profileId, status: "ACTIVE" },
    orderBy: { version: "desc" }
  });
}

export async function upsertPolicyOverlay(db: PrismaClient, input: PolicyOverlayInput) {
  const scope = scopeWhere(input.architectureScope);
  return db.$transaction(async (tx) => {
    const current = await tx.knowledgeReadinessPolicy.findFirst({
      where: { ...scope, profileId: input.overlay.profileId },
      orderBy: { version: "desc" }
    });
    if (current && input.overlay.version <= current.version) throw new Error("KNOWLEDGE_POLICY_VERSION_MUST_INCREASE");
    await tx.knowledgeReadinessPolicy.updateMany({
      where: { ...scope, profileId: input.overlay.profileId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" }
    });
    return tx.knowledgeReadinessPolicy.create({
      data: {
        ...scope,
        id: input.overlay.id,
        version: input.overlay.version,
        profileId: input.overlay.profileId,
        overlay: json(input.overlay),
        status: "ACTIVE",
        actorId: input.actorId
      }
    });
  });
}

export async function findReusableReceipt(
  db: ReadinessDb,
  architectureScope: ArchitectureScopeRef,
  deterministicKey: string,
  now: Date
) {
  const receipt = await db.systemKnowledgeReadinessReceipt.findUnique({
    where: {
      applicationServiceId_scopePath_deterministicKey: {
        ...scopeWhere(architectureScope),
        deterministicKey
      }
    }
  });
  return receipt && receipt.validUntil > now && receipt.lifecycleStatus === "ACTIVE" ? receipt : null;
}

export async function insertImmutableReceipt(db: ReadinessDb, input: ImmutableReceiptInput) {
  const data = {
    ...scopeWhere(input.architectureScope),
    id: input.id,
    deterministicKey: input.deterministicKey,
    subjectId: input.subjectId,
    grantDigest: input.grantDigest,
    profileId: input.profileId,
    selectorDigest: input.selectorDigest,
    purpose: input.purpose,
    locale: input.locale,
    policyId: input.policyId,
    policyVersion: input.policyVersion,
    trustStatus: input.trustStatus,
    dimensionStatuses: json(input.dimensionStatuses),
    baselineBindings: json(input.baselineBindings),
    sourceWaterlines: json(input.sourceWaterlines),
    coverageSummary: json(input.coverageSummary),
    freshnessSummary: json(input.freshnessSummary),
    reasonCodes: json(input.reasonCodes),
    remediationActions: json(input.remediationActions),
    asOf: input.asOf,
    validUntil: input.validUntil,
    receiptDigest: input.receiptDigest,
    lifecycleStatus: "ACTIVE"
  } satisfies Prisma.SystemKnowledgeReadinessReceiptCreateInput;

  const existing = await db.systemKnowledgeReadinessReceipt.findUnique({
    where: {
      applicationServiceId_scopePath_deterministicKey: {
        ...scopeWhere(input.architectureScope),
        deterministicKey: input.deterministicKey
      }
    }
  });
  if (existing) {
    if (existing.receiptDigest !== input.receiptDigest) throw new Error("KNOWLEDGE_RECEIPT_IDENTITY_COLLISION");
    return existing;
  }
  try {
    return await db.systemKnowledgeReadinessReceipt.create({ data });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const raced = await db.systemKnowledgeReadinessReceipt.findUnique({
      where: {
        applicationServiceId_scopePath_deterministicKey: {
          ...scopeWhere(input.architectureScope),
          deterministicKey: input.deterministicKey
        }
      }
    });
    if (!raced || raced.receiptDigest !== input.receiptDigest) throw new Error("KNOWLEDGE_RECEIPT_IDENTITY_COLLISION");
    return raced;
  }
}
