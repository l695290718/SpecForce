import { contentDigest, type ArchitectureScopeRef, type KnowledgeReadinessPolicyOverlay, type KnowledgeTrustStatus, type ScopedPrincipal } from "@specforge/core";
import type { Prisma } from "@prisma/client";
import type { KnowledgeProfileId, KnowledgeReasonCode, KnowledgeRemediationAction } from "@specforge/core";
import { evaluateKnowledgeReadiness } from "@specforge/core";
import { loadKnowledgeEvidenceSnapshot } from "./evidence-snapshot";
import { composeKnowledgeReadinessPolicy, enterpriseMinimumPolicy } from "@specforge/core";
import { findReusableReceipt, insertImmutableReceipt, getActivePolicyOverlay, type ReadinessDb } from "./repository";

export interface KnowledgeSelector {
  assetTypes?: string[];
  assetIds?: string[];
  relationshipTypes?: string[];
}

export interface KnowledgeReadRequest {
  architectureScope: ArchitectureScopeRef;
  knowledgeProfile: KnowledgeProfileId;
  selectors: readonly KnowledgeSelector[];
  purpose: string;
  locale: "en" | "zh";
  receiptId?: string;
  pageSize?: number;
  cursor?: string;
}

export interface KnowledgeReadinessResult {
  accessDecision: "ALLOW" | "DENY";
  receiptId: string;
  trustStatus: KnowledgeTrustStatus;
  dimensionStatuses: unknown;
  architectureScope: ArchitectureScopeRef;
  profileId: KnowledgeProfileId;
  grantDigest: string;
  selectorDigest: string;
  policyVersion: number;
  catalogVersion: string;
  waterlineDigest: string;
  asOf: string;
  validUntil: string;
  coverageSummary: unknown;
  freshnessSummary: unknown;
  reasonCodes: readonly KnowledgeReasonCode[];
  remediationActions: readonly KnowledgeRemediationAction[];
}

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function sortedStrings(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].sort();
}

export function knowledgeQueryDigest(input: Pick<KnowledgeReadRequest, "architectureScope" | "knowledgeProfile" | "selectors" | "purpose" | "locale">): string {
  return contentDigest({
    architectureScope: input.architectureScope,
    knowledgeProfile: input.knowledgeProfile,
    selectors: normalizeKnowledgeSelectors(input.selectors),
    purpose: input.purpose.trim(),
    locale: input.locale
  });
}

export function normalizeKnowledgeSelectors(selectors: readonly KnowledgeSelector[]): KnowledgeSelector[] {
  return selectors.map((selector) => ({
    ...(selector.assetTypes?.length ? { assetTypes: sortedStrings(selector.assetTypes) } : {}),
    ...(selector.assetIds?.length ? { assetIds: sortedStrings(selector.assetIds) } : {}),
    ...(selector.relationshipTypes?.length ? { relationshipTypes: sortedStrings(selector.relationshipTypes) } : {})
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function principalGrantDigest(caller: ScopedPrincipal): string {
  return contentDigest({
    subject: caller.subject,
    tenantId: caller.tenantId,
    authSource: caller.authSource,
    permissions: [...caller.permissions].sort(),
    grants: caller.grants.map((grant) => ({ ...grant })).sort((left, right) => `${left.scopeId}:${left.action}`.localeCompare(`${right.scopeId}:${right.action}`)),
    decisionRef: caller.decisionRef
  });
}

function requestBinding(input: KnowledgeReadRequest, caller: ScopedPrincipal, selectorDigest: string, policy: { id: string; version: number }, waterlineDigest: string) {
  return {
    architectureScope: input.architectureScope,
    subjectId: caller.subject,
    grantDigest: principalGrantDigest(caller),
    profileId: input.knowledgeProfile,
    selectorDigest,
    purpose: input.purpose.trim(),
    locale: input.locale,
    policyId: policy.id,
    policyVersion: policy.version,
    waterlineDigest
  };
}

function publicResult(row: {
  id: string;
  trustStatus: string;
  grantDigest: string;
  profileId: string;
  dimensionStatuses: Prisma.JsonValue;
  selectorDigest: string;
  policyVersion: number;
  sourceWaterlines: Prisma.JsonValue;
  asOf: Date;
  validUntil: Date;
  coverageSummary: Prisma.JsonValue;
  freshnessSummary: Prisma.JsonValue;
  reasonCodes: Prisma.JsonValue;
  remediationActions: Prisma.JsonValue;
  applicationServiceId: string;
  scopePath: string;
}, accessDecision: "ALLOW" | "DENY", waterlineDigest = contentDigest(row.sourceWaterlines)): KnowledgeReadinessResult {
  const sourceWaterlines = jsonRecord(row.sourceWaterlines);
  return {
    accessDecision,
    receiptId: row.id,
    trustStatus: row.trustStatus as KnowledgeTrustStatus,
    dimensionStatuses: row.dimensionStatuses,
    architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath },
    profileId: row.profileId as KnowledgeProfileId,
    grantDigest: row.grantDigest,
    selectorDigest: row.selectorDigest,
    policyVersion: row.policyVersion,
    catalogVersion: typeof sourceWaterlines.catalog === "string" ? sourceWaterlines.catalog : "0",
    waterlineDigest,
    asOf: row.asOf.toISOString(),
    validUntil: row.validUntil.toISOString(),
    coverageSummary: row.coverageSummary,
    freshnessSummary: row.freshnessSummary,
    reasonCodes: Array.isArray(row.reasonCodes) ? row.reasonCodes.filter((item): item is KnowledgeReasonCode => typeof item === "string") : [],
    remediationActions: Array.isArray(row.remediationActions) ? row.remediationActions.filter((item): item is KnowledgeRemediationAction => typeof item === "string") : []
  };
}

function resultFromEvaluation(input: KnowledgeReadRequest, receipt: Awaited<ReturnType<typeof insertImmutableReceipt>>, decision: ReturnType<typeof evaluateKnowledgeReadiness>, waterlineDigest: string, grantDigest: string, catalogVersion: string): KnowledgeReadinessResult {
  return {
    accessDecision: decision.trustStatus === "SELF_CONTAINED" ? "ALLOW" : "DENY",
    receiptId: receipt.id,
    trustStatus: decision.trustStatus,
    dimensionStatuses: decision.dimensionStatuses,
    architectureScope: input.architectureScope,
    profileId: input.knowledgeProfile,
    grantDigest,
    selectorDigest: receipt.selectorDigest,
    policyVersion: receipt.policyVersion,
    catalogVersion,
    waterlineDigest,
    asOf: receipt.asOf.toISOString(),
    validUntil: receipt.validUntil.toISOString(),
    coverageSummary: receipt.coverageSummary,
    freshnessSummary: receipt.freshnessSummary,
    reasonCodes: decision.reasonCodes,
    remediationActions: decision.remediationActions
  };
}

export async function evaluateScopedKnowledgeReadiness(
  db: ReadinessDb,
  input: KnowledgeReadRequest,
  caller: ScopedPrincipal,
  now = new Date()
): Promise<KnowledgeReadinessResult> {
  const overlayRow = await getActivePolicyOverlay(db, input.architectureScope, input.knowledgeProfile);
  const overlay = overlayRow ? jsonRecord(overlayRow.overlay) as unknown as KnowledgeReadinessPolicyOverlay : undefined;
  const policy = overlay ? composeKnowledgeReadinessPolicy(overlay) : enterpriseMinimumPolicy;
  const selectors = normalizeKnowledgeSelectors(input.selectors);
  const selectorDigest = contentDigest(selectors);
  const snapshot = await loadKnowledgeEvidenceSnapshot(db, input.architectureScope, policy, input.knowledgeProfile);
  const decision = evaluateKnowledgeReadiness({ profileId: input.knowledgeProfile, policy, snapshot, now });
  const binding = requestBinding(input, caller, selectorDigest, policy, snapshot.waterlineDigest);
  const deterministicKey = contentDigest(binding);
  const evaluationEpoch = BigInt(Math.floor(now.getTime() / (policy.receiptTtlSeconds * 1000)));
  const reusable = await findReusableReceipt(db, input.architectureScope, deterministicKey, evaluationEpoch, now);
  if (reusable) {
    return {
      ...resultFromEvaluation(input, reusable, decision, snapshot.waterlineDigest, binding.grantDigest, snapshot.catalogWaterline),
      grantDigest: binding.grantDigest,
      catalogVersion: snapshot.catalogWaterline,
      receiptId: reusable.id,
      trustStatus: reusable.trustStatus as KnowledgeTrustStatus,
      dimensionStatuses: reusable.dimensionStatuses,
      asOf: reusable.asOf.toISOString(),
      validUntil: reusable.validUntil.toISOString(),
      reasonCodes: Array.isArray(reusable.reasonCodes) ? reusable.reasonCodes.filter((item): item is KnowledgeReasonCode => typeof item === "string") : decision.reasonCodes,
      remediationActions: Array.isArray(reusable.remediationActions) ? reusable.remediationActions.filter((item): item is KnowledgeRemediationAction => typeof item === "string") : decision.remediationActions
    };
  }
  const receipt = await insertImmutableReceipt(db, {
    architectureScope: input.architectureScope,
    id: `knowledge-readiness:${contentDigest({ deterministicKey, evaluationEpoch }).slice(0, 32)}`,
    deterministicKey,
    evaluationEpoch,
    subjectId: caller.subject,
    grantDigest: binding.grantDigest,
    profileId: input.knowledgeProfile,
    selectorDigest,
    purpose: binding.purpose,
    locale: input.locale,
    policyId: policy.id,
    policyVersion: policy.version,
    trustStatus: decision.trustStatus,
    dimensionStatuses: decision.dimensionStatuses,
    baselineBindings: snapshot.baseline ? [snapshot.baseline] : [],
    sourceWaterlines: snapshot.waterlines,
    coverageSummary: snapshot.coverageSummary,
    freshnessSummary: snapshot.freshnessSummary,
    reasonCodes: decision.reasonCodes,
    remediationActions: decision.remediationActions,
    asOf: now,
    validUntil: decision.validUntil,
    receiptDigest: contentDigest({ binding, decision, sourceWaterlines: snapshot.waterlines })
  });
  return resultFromEvaluation(input, receipt, decision, snapshot.waterlineDigest, binding.grantDigest, snapshot.catalogWaterline);
}

export async function revalidateReceipt(
  db: ReadinessDb,
  receiptId: string,
  input: KnowledgeReadRequest,
  caller: ScopedPrincipal,
  now = new Date()
): Promise<KnowledgeReadinessResult> {
  const row = await db.systemKnowledgeReadinessReceipt.findFirst({ where: { ...input.architectureScope, id: receiptId } });
  if (!row || row.validUntil <= now || row.lifecycleStatus !== "ACTIVE") throw new Error("KNOWLEDGE_RECEIPT_STALE");
  const current = await evaluateScopedKnowledgeReadiness(db, { ...input, receiptId: undefined }, caller, now);
  if (current.receiptId !== row.id || current.grantDigest !== row.grantDigest || current.waterlineDigest !== contentDigest(row.sourceWaterlines)) throw new Error("KNOWLEDGE_RECEIPT_STALE");
  return publicResult(row, current.accessDecision, current.waterlineDigest);
}
