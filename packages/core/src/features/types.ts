import type {
  BaseAsset,
  BaseAssetLocalizedFields
} from "../types";

export type FeatureAssetType = "serviceFeature" | "functionalFeature";
export type FeatureLifecycleStatus = "DRAFT" | "ACTIVE" | "DEPRECATED" | "RETIRED";
export type FeatureCoverageStatus = "UNMAPPED" | "PARTIAL" | "COMPLETE";
export type FeatureEvidenceStatus = "NO_EVIDENCE" | "IMPLEMENTED" | "VERIFIED";
export type FeatureConsistencyStatus = "UNKNOWN" | "CONSISTENT" | "DRIFTED" | "STALE";

export interface ServiceFeatureLocalizedFields extends BaseAssetLocalizedFields {
  actors: string[];
  scenario: string;
  valueOutcome: string;
  benefitHypothesis: string;
  serviceBoundary: string[];
  acceptanceCriteria: string[];
}

export interface FunctionalFeatureLocalizedFields extends BaseAssetLocalizedFields {
  trigger: string;
  observableBehavior: string;
  preconditions: string[];
  postconditions: string[];
  exceptionBehaviors: string[];
  acceptanceCriteria: string[];
}

interface FeatureBase<TLocalized extends object> extends BaseAsset<TLocalized> {
  lifecycleStatus: FeatureLifecycleStatus;
  owner?: string;
  tags: string[];
  acceptanceCriteria: string[];
}

export interface ServiceFeature extends FeatureBase<ServiceFeatureLocalizedFields> {
  actors: string[];
  scenario: string;
  valueOutcome: string;
  benefitHypothesis: string;
  serviceBoundary: string[];
}

export interface FunctionalFeature extends FeatureBase<FunctionalFeatureLocalizedFields> {
  trigger: string;
  observableBehavior: string;
  preconditions: string[];
  postconditions: string[];
  exceptionBehaviors: string[];
}

export type FeatureAsset = ServiceFeature | FunctionalFeature;

export function isFeatureAssetType(value: string): value is FeatureAssetType {
  return value === "serviceFeature" || value === "functionalFeature";
}
