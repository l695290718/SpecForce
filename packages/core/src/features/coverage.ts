import type { AssetNodeType, RelationshipCode } from "../relationships/types";
import type { FeatureAssetType, FeatureConsistencyStatus, FeatureCoverageStatus, FeatureEvidenceStatus } from "./types";

export type FeatureStateReason = "ACCEPTANCE_CRITERIA_MISSING" | "CONTRIBUTING_FUNCTION_MISSING" | "TRACEABILITY_MISSING" | "EVIDENCE_MISSING" | "EVIDENCE_STALE" | "DRIFT_REPORTED";

export interface FeatureGovernanceRelationship {
  relationType: RelationshipCode | string;
  sourceType: AssetNodeType | string;
  targetType: AssetNodeType | string;
  direction: "incoming" | "outgoing";
  metadata?: Record<string, unknown>;
}

export interface FeatureGovernanceState {
  coverageStatus: FeatureCoverageStatus;
  evidenceStatus: FeatureEvidenceStatus;
  consistencyStatus: FeatureConsistencyStatus;
  reasons: FeatureStateReason[];
}

export interface FeatureGovernanceInput {
  featureType: FeatureAssetType;
  acceptanceCriteria: readonly string[];
  relationships: readonly FeatureGovernanceRelationship[];
  currentVersion?: string;
  currentContentDigest?: string;
}

const TRACEABILITY_TYPES = new Set(["api", "apiOperation", "event", "businessRule", "stateMachine", "dataModel", "dataEntity", "dataField", "quality", "architectureUnit", "architectureUnitMembership"]);

export function deriveFeatureGovernanceState(input: FeatureGovernanceInput): FeatureGovernanceState {
  const reasons: FeatureStateReason[] = [];
  const hasCriteria = input.acceptanceCriteria.some((criterion) => criterion.trim().length > 0);
  if (!hasCriteria) reasons.push("ACCEPTANCE_CRITERIA_MISSING");
  const hasRequiredLink = input.featureType === "serviceFeature"
    ? input.relationships.some((relationship) => relationship.direction === "incoming" && relationship.relationType === "CONTRIBUTES_TO" && relationship.sourceType === "functionalFeature")
    : input.relationships.some((relationship) => {
        const oppositeType = relationship.direction === "incoming" ? relationship.sourceType : relationship.targetType;
        return relationship.relationType !== "CONTRIBUTES_TO" && TRACEABILITY_TYPES.has(oppositeType);
      });
  if (!hasRequiredLink) reasons.push(input.featureType === "serviceFeature" ? "CONTRIBUTING_FUNCTION_MISSING" : "TRACEABILITY_MISSING");
  const coverageStatus: FeatureCoverageStatus = hasCriteria && hasRequiredLink ? "COMPLETE" : hasCriteria || hasRequiredLink ? "PARTIAL" : "UNMAPPED";

  const evidenceRelationships = input.relationships.filter((relationship) => relationship.relationType === "VALIDATES" || relationship.targetType === "evidence" || relationship.sourceType === "evidence");
  const currentEvidence = evidenceRelationships.some((relationship) => evidenceMatchesCurrent(relationship.metadata, input));
  const hasImplementation = input.relationships.some((relationship) => ["EXPOSES", "IMPLEMENTS_DECISION", "VALIDATES"].includes(relationship.relationType));
  const evidenceStatus: FeatureEvidenceStatus = currentEvidence ? "VERIFIED" : hasImplementation ? "IMPLEMENTED" : "NO_EVIDENCE";
  if (evidenceStatus === "NO_EVIDENCE") reasons.push("EVIDENCE_MISSING");

  const drifted = input.relationships.some((relationship) => relationship.metadata?.drifted === true || relationship.metadata?.consistencyStatus === "DRIFTED");
  const staleEvidence = evidenceRelationships.length > 0 && !currentEvidence;
  let consistencyStatus: FeatureConsistencyStatus = "UNKNOWN";
  if (drifted) { consistencyStatus = "DRIFTED"; reasons.push("DRIFT_REPORTED"); }
  else if (staleEvidence) { consistencyStatus = "STALE"; reasons.push("EVIDENCE_STALE"); }
  else if (currentEvidence) consistencyStatus = "CONSISTENT";
  return { coverageStatus, evidenceStatus, consistencyStatus, reasons };
}

function evidenceMatchesCurrent(metadata: Record<string, unknown> | undefined, input: FeatureGovernanceInput): boolean {
  if (!metadata) return false;
  return Boolean((input.currentVersion && metadata.validatedAssetVersion === input.currentVersion) || (input.currentContentDigest && metadata.validatedContentDigest === input.currentContentDigest));
}
