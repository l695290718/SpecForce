import { compareCanonical, contentDigest } from "./digest";
import type { FactAuthority, FederatedFactLocalizedContent, ReconciliationInput, ReconciliationReport } from "./types";

export type ObservationDecision = {
  action: "PROMOTE" | "CANDIDATE" | "CONFLICT" | "REJECT";
  reason: string;
};

export type ObservationDecisionInput = {
  authority?: FactAuthority;
  identityMatch?: "UNMATCHED" | "UNAMBIGUOUS" | "AMBIGUOUS";
  policyAllowsPromotion: boolean;
  sharedFieldChanged?: boolean;
  humanFacing?: boolean;
  hasCompleteChineseLocalization?: boolean;
};

export function evaluateObservation(input: ObservationDecisionInput): ObservationDecision {
  if (input.identityMatch === "AMBIGUOUS") return { action: "CONFLICT", reason: "IDENTITY_CONFLICT" };
  if (!input.authority) return { action: "CONFLICT", reason: "AUTHORITY_MISSING" };
  if (input.sharedFieldChanged) return { action: "CONFLICT", reason: "SHARED_CONCURRENT_EDIT" };
  if (!input.policyAllowsPromotion) return { action: "CONFLICT", reason: "POLICY_DISABLED" };
  if (input.humanFacing && !input.hasCompleteChineseLocalization) {
    return { action: "CANDIDATE", reason: "LOCALIZATION_INCOMPLETE" };
  }
  if (input.identityMatch !== "UNAMBIGUOUS") return { action: "CANDIDATE", reason: "IDENTITY_REVIEW" };
  if (input.authority === "EXTERNAL") return { action: "PROMOTE", reason: "EXTERNAL_AUTHORITY" };
  return { action: "CANDIDATE", reason: `${input.authority}_AUTHORITY` };
}

export function hasCompleteBilingualLocalization(localizedContent: FederatedFactLocalizedContent): boolean {
  const english = localizedContent.en;
  const chinese = localizedContent.zh;
  return isCompleteLocalizedValue(english) && isCompleteLocalizedValue(chinese) && hasLocalizedOverlay(english, chinese);
}

export function reconcileFacts(input: ReconciliationInput): ReconciliationReport {
  const issues = [] as ReconciliationReport["issues"];
  const factById = new Map(input.acceptedFacts.map((fact) => [fact.id, fact]));
  const isInScope = (scope: { applicationServiceId: string; scopePath: string }) =>
    scope.applicationServiceId === input.architectureScope.applicationServiceId &&
    scope.scopePath === input.architectureScope.scopePath;

  for (const fact of input.acceptedFacts) {
    if (!isInScope(fact.architectureScope)) {
      issues.push({ code: "SCOPE_DRIFT", message: `Accepted fact is outside the reconciliation Scope for ${fact.id}`, factId: fact.id });
    }
    if (fact.status !== "PROMOTED") {
      issues.push({ code: "MISSING_FACT", message: `Accepted fact ${fact.id} is not promoted`, factId: fact.id });
    }
    if (!hasCompleteBilingualLocalization(fact.localizedContent)) {
      issues.push({ code: "LOCALIZATION_DRIFT", message: `Localized content is incomplete for ${fact.id}`, factId: fact.id });
    }
  }

  for (const observation of input.observations) {
    if (!isInScope(observation.architectureScope)) {
      issues.push({ code: "SCOPE_DRIFT", message: `Observation is outside the reconciliation Scope for ${observation.externalId}`, externalId: observation.externalId });
      continue;
    }
    const mapping = input.identityMappings.find((candidate) =>
      candidate.connectorInstanceId === observation.connectorInstanceId &&
      candidate.sourceNamespace === observation.sourceNamespace &&
      candidate.externalAssetType === observation.externalAssetType &&
      candidate.externalId === observation.externalId
    );
    if (!mapping) {
      issues.push({ code: "UNDECLARED_CHANGE", message: `No identity correspondence exists for ${observation.externalId}`, externalId: observation.externalId });
      continue;
    }
    if (!isInScope(mapping.architectureScope)) {
      issues.push({ code: "SCOPE_DRIFT", message: `Identity mapping is outside the reconciliation Scope for ${observation.externalId}`, externalId: observation.externalId });
      continue;
    }
    if (!mapping.assetId || mapping.matchStatus === "UNMATCHED") {
      issues.push({ code: "MISSING_FACT", message: `No accepted fact matches ${observation.externalId}`, externalId: observation.externalId });
      continue;
    }
    if (mapping.matchStatus === "AMBIGUOUS") {
      issues.push({ code: "IDENTITY_CONFLICT", message: `Identity match is ambiguous for ${observation.externalId}`, factId: mapping.assetId, externalId: observation.externalId });
      continue;
    }
    const fact = factById.get(mapping.assetId);
    if (!fact) {
      issues.push({ code: "MISSING_FACT", message: `Accepted fact ${mapping.assetId} is missing`, factId: mapping.assetId });
      continue;
    }
    if (fact.normalizedDigest !== observation.normalizedDigest) {
      issues.push({ code: "CONTENT_DRIFT", message: `Content digest differs for ${fact.id}`, factId: fact.id, externalId: observation.externalId });
    }
    if (fact.architectureScope.applicationServiceId !== observation.architectureScope.applicationServiceId ||
      fact.architectureScope.scopePath !== observation.architectureScope.scopePath ||
      input.architectureScope.applicationServiceId !== observation.architectureScope.applicationServiceId ||
      input.architectureScope.scopePath !== observation.architectureScope.scopePath) {
      issues.push({ code: "SCOPE_DRIFT", message: `Scope differs for ${fact.id}`, factId: fact.id, externalId: observation.externalId });
    }
  }
  if (input.localizationDrift) issues.push({ code: "LOCALIZATION_DRIFT", message: "Localized content differs from the accepted fact." });
  if (input.relationshipDrift) issues.push({ code: "RELATIONSHIP_DRIFT", message: "Relationships differ from the accepted fact." });
  if (input.evidenceDrift) issues.push({ code: "EVIDENCE_DRIFT", message: "Evidence differs from the accepted fact." });
  const factDigests = input.acceptedFacts.map((fact) => ({ factId: fact.id, digest: fact.normalizedDigest }));
  const root = contentDigest({ architectureScope: input.architectureScope, factDigests: factDigests.sort((a, b) => compareCanonical(a.factId, b.factId)), issues });
  return { architectureScope: input.architectureScope, root, status: issues.length === 0 ? "CONVERGED" : "BLOCKED", issues, factDigests };
}

function hasLocalizedOverlay(english: unknown, chinese: unknown): boolean {
  if (typeof english === "string") return typeof chinese === "string" && chinese.trim().length > 0;
  if (Array.isArray(english)) return Array.isArray(chinese) && english.length === chinese.length && english.every((value, index) => hasLocalizedOverlay(value, chinese[index]));
  if (isRecord(english)) return isRecord(chinese) && Object.entries(english).every(([key, value]) => key in chinese && hasLocalizedOverlay(value, chinese[key]));
  return chinese !== undefined && chinese !== null;
}

function isCompleteLocalizedValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(isCompleteLocalizedValue);
  return isRecord(value) && Object.keys(value).length > 0 && Object.values(value).every(isCompleteLocalizedValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
