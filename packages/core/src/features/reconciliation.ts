import type { FeatureConsistencyStatus, FeatureEvidenceStatus, FeatureAssetType } from "./types";

export interface FeatureEvidenceBinding {
  id: string;
  validatedAssetType: FeatureAssetType;
  validatedAssetId: string;
  validatedAssetVersion?: string;
  validatedContentDigest?: string;
  repositoryCommit?: string;
  verificationCommand?: string;
  verificationResult?: string;
  verifiedAt?: string;
}

export interface FeatureImplementationObservation {
  contentDigest?: string;
  version?: string;
  drifted?: boolean;
  evidenceRef?: string;
}

export interface FeatureReconciliationInput {
  assetType: FeatureAssetType;
  assetId: string;
  currentVersion: string;
  currentContentDigest: string;
  evidence?: FeatureEvidenceBinding;
  implementation?: FeatureImplementationObservation;
  lifecycleStatus?: string;
}

export interface FeatureReconciliationResult {
  evidenceStatus: FeatureEvidenceStatus;
  consistencyStatus: FeatureConsistencyStatus;
  reasons: Array<{ code: string; evidenceRef?: string; observedDigest?: string }>;
}

export function reconcileFeature(input: FeatureReconciliationInput): FeatureReconciliationResult {
  if (input.lifecycleStatus === "RETIRED") return { evidenceStatus: "NO_EVIDENCE", consistencyStatus: "STALE", reasons: [{ code: "FEATURE_RETIRED" }] };
  if (!input.evidence || input.evidence.validatedAssetType !== input.assetType || input.evidence.validatedAssetId !== input.assetId) return { evidenceStatus: input.implementation ? "IMPLEMENTED" : "NO_EVIDENCE", consistencyStatus: "UNKNOWN", reasons: [{ code: "EVIDENCE_MISSING", evidenceRef: input.evidence?.id }] };
  const versionMatches = input.evidence.validatedAssetVersion === input.currentVersion;
  const digestMatches = input.evidence.validatedContentDigest === input.currentContentDigest;
  if (!versionMatches && !digestMatches) return { evidenceStatus: "NO_EVIDENCE", consistencyStatus: "STALE", reasons: [{ code: "EVIDENCE_STALE", evidenceRef: input.evidence.id }] };
  if (input.implementation?.drifted || input.implementation?.contentDigest && input.implementation.contentDigest !== input.currentContentDigest) return { evidenceStatus: "VERIFIED", consistencyStatus: "DRIFTED", reasons: [{ code: "IMPLEMENTATION_DRIFT", evidenceRef: input.implementation.evidenceRef ?? input.evidence.id, observedDigest: input.implementation.contentDigest }] };
  return { evidenceStatus: "VERIFIED", consistencyStatus: "CONSISTENT", reasons: [] };
}

export function activeRelationshipsAfterLifecycle<T extends { sourceId: string; targetId: string }>(relationships: readonly T[], assetId: string, lifecycleStatus: string): T[] {
  return lifecycleStatus === "RETIRED" ? relationships.filter((relationship) => relationship.sourceId !== assetId && relationship.targetId !== assetId) : [...relationships];
}
