import { contentDigest } from "./digest";
import type { FactAuthority, ReconciliationInput, ReconciliationReport } from "./types";

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

export function reconcileFacts(input: ReconciliationInput): ReconciliationReport {
  const issues = [] as ReconciliationReport["issues"];
  const factById = new Map(input.acceptedFacts.map((fact) => [fact.id, fact]));

  for (const observation of input.observations) {
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
    if (mapping.architectureScope.applicationServiceId !== input.architectureScope.applicationServiceId ||
      mapping.architectureScope.scopePath !== input.architectureScope.scopePath) {
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
  const root = contentDigest({ architectureScope: input.architectureScope, factDigests: factDigests.sort((a, b) => a.factId.localeCompare(b.factId)), issues });
  const blocked = issues.some((issue) =>
    issue.code === "IDENTITY_CONFLICT" || issue.code === "SCOPE_DRIFT" ||
    issue.code === "DELIVERY_BLOCKED" || issue.code === "SOURCE_UNREACHABLE"
  );
  return { architectureScope: input.architectureScope, root, status: blocked ? "BLOCKED" : issues.length === 0 ? "CONVERGED" : "DRIFTED", issues, factDigests };
}
