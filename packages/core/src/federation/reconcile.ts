import { compareCanonical, contentDigest } from "./digest";
import type { ExternalIdentityMapping, FactAuthority, FederatedFactLocalizedContent, FederatedFactEnvelope, ReconciliationInput, ReconciliationReport, SourceObservation } from "./types";

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
  const acceptedFacts = [...input.acceptedFacts].sort(compareFacts);
  const observations = latestActiveObservations(input.observations);
  const identityMappings = [...input.identityMappings].sort(compareMappings);
  const factById = new Map(acceptedFacts.map((fact) => [fact.id, fact]));
  const isInScope = (scope: { applicationServiceId: string; scopePath: string }) =>
    scope.applicationServiceId === input.architectureScope.applicationServiceId &&
    scope.scopePath === input.architectureScope.scopePath;

  for (const fact of acceptedFacts) {
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

  for (const observation of observations) {
    if (!isInScope(observation.architectureScope)) {
      issues.push({ code: "SCOPE_DRIFT", message: `Observation is outside the reconciliation Scope for ${observation.externalId}`, externalId: observation.externalId });
      continue;
    }
    const mapping = identityMappings.find((candidate) =>
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
  const factDigests = acceptedFacts
    .map((fact) => ({ factId: fact.id, digest: fact.normalizedDigest }))
    .sort((left, right) => compareCanonical(left.factId, right.factId) || compareCanonical(left.digest, right.digest));
  const sortedIssues = issues.sort(compareIssues);
  const root = contentDigest({ architectureScope: input.architectureScope, factDigests, issues: sortedIssues });
  return { architectureScope: input.architectureScope, root, status: sortedIssues.length === 0 ? "CONVERGED" : "BLOCKED", issues: sortedIssues, factDigests };
}

function latestActiveObservations(observations: SourceObservation[]): SourceObservation[] {
  const latest = new Map<string, SourceObservation>();
  for (const observation of observations) {
    if (observation.status === "TOMBSTONED") continue;
    const key = observationIdentityKey(observation);
    const current = latest.get(key);
    if (!current || compareObservationFreshness(observation, current) > 0) latest.set(key, observation);
  }
  return [...latest.values()].sort(compareObservations);
}

function compareFacts(left: FederatedFactEnvelope, right: FederatedFactEnvelope): number {
  return compareCanonical(left.id, right.id) || compareCanonical(left.normalizedDigest, right.normalizedDigest);
}

function compareMappings(left: ExternalIdentityMapping, right: ExternalIdentityMapping): number {
  return compareCanonical(mappingIdentityKey(left), mappingIdentityKey(right)) ||
    compareCanonical(left.assetId ?? "", right.assetId ?? "") ||
    compareCanonical(left.matchStatus, right.matchStatus) ||
    compareCanonical(left.id, right.id);
}

function compareObservations(left: SourceObservation, right: SourceObservation): number {
  return compareCanonical(observationIdentityKey(left), observationIdentityKey(right)) ||
    compareCanonical(left.sourceVersion, right.sourceVersion) ||
    compareCanonical(left.id, right.id);
}

function compareIssues(left: ReconciliationReport["issues"][number], right: ReconciliationReport["issues"][number]): number {
  return compareCanonical(left.code, right.code) ||
    compareCanonical(left.factId ?? "", right.factId ?? "") ||
    compareCanonical(left.externalId ?? "", right.externalId ?? "") ||
    compareCanonical(left.message, right.message);
}

function compareObservationFreshness(left: SourceObservation, right: SourceObservation): number {
  const leftVersion = monotonicSourceVersion(left.sourceVersion);
  const rightVersion = monotonicSourceVersion(right.sourceVersion);
  if (leftVersion !== undefined && rightVersion !== undefined && leftVersion !== rightVersion) {
    return leftVersion < rightVersion ? -1 : 1;
  }
  const leftTime = Date.parse(left.observedAt);
  const rightTime = Date.parse(right.observedAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) return leftTime < rightTime ? -1 : 1;
  return compareCanonical(left.sourceVersion, right.sourceVersion) || compareCanonical(left.id, right.id);
}

function monotonicSourceVersion(value: string): bigint | undefined {
  const match = /^(?:v)?(\d+)$/i.exec(value.trim());
  return match ? BigInt(match[1]!) : undefined;
}

function observationIdentityKey(observation: SourceObservation): string {
  return [
    observation.architectureScope.applicationServiceId,
    observation.architectureScope.scopePath,
    observation.connectorInstanceId,
    observation.sourceNamespace,
    observation.externalAssetType,
    observation.externalId
  ].join("\u0000");
}

function mappingIdentityKey(mapping: ExternalIdentityMapping): string {
  return [
    mapping.architectureScope.applicationServiceId,
    mapping.architectureScope.scopePath,
    mapping.connectorInstanceId,
    mapping.sourceNamespace,
    mapping.externalAssetType,
    mapping.externalId
  ].join("\u0000");
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
