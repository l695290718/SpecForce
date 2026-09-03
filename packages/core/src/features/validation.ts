import { validateAssetLocalization } from "../localization/assets";
import type { AssetTypeMap } from "../types";
import type { FeatureAsset, FeatureAssetType, FeatureLifecycleStatus } from "./types";

const lifecycleStatuses = new Set<FeatureLifecycleStatus>(["DRAFT", "ACTIVE", "DEPRECATED", "RETIRED"]);

export class FeatureValidationError extends Error {
  constructor(public readonly code: string, public readonly path: string) {
    super(`${code}: ${path}`);
    this.name = "FeatureValidationError";
  }
}

export function assertValidFeatureAsset<TType extends FeatureAssetType>(
  assetType: TType,
  asset: AssetTypeMap[TType]
): asserts asset is AssetTypeMap[TType] {
  const feature = asset as FeatureAsset;
  requireText(feature.id, "id");
  requireText(feature.name, "name");
  requireText(feature.description, "description");
  if (!feature.architectureScope?.applicationServiceId || !feature.architectureScope.scopePath) {
    throw new FeatureValidationError("FEATURE_SCOPE_REQUIRED", "architectureScope");
  }
  if (!lifecycleStatuses.has(feature.lifecycleStatus)) {
    throw new FeatureValidationError("FEATURE_LIFECYCLE_INVALID", "lifecycleStatus");
  }
  requireStringArray(feature.tags, "tags", false);
  requireStringArray(feature.acceptanceCriteria, "acceptanceCriteria", true);

  if (assetType === "serviceFeature") {
    const service = feature as AssetTypeMap["serviceFeature"];
    requireStringArray(service.actors, "actors", true);
    requireText(service.scenario, "scenario");
    requireText(service.valueOutcome, "valueOutcome");
    requireText(service.benefitHypothesis, "benefitHypothesis");
    requireStringArray(service.serviceBoundary, "serviceBoundary", true);
  } else {
    const functional = feature as AssetTypeMap["functionalFeature"];
    requireText(functional.trigger, "trigger");
    requireText(functional.observableBehavior, "observableBehavior");
    requireStringArray(functional.preconditions, "preconditions", false);
    requireStringArray(functional.postconditions, "postconditions", true);
    requireStringArray(functional.exceptionBehaviors, "exceptionBehaviors", false);
  }

  try {
    validateAssetLocalization(assetType, asset);
  } catch (error) {
    throw new FeatureValidationError(
      "FEATURE_LOCALIZATION_INVALID",
      error instanceof Error ? error.message : "localizedContent.zh"
    );
  }
}

function requireText(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new FeatureValidationError("FEATURE_CANONICAL_CONTENT_REQUIRED", path);
  }
}

function requireStringArray(value: unknown, path: string, nonEmpty: boolean): asserts value is string[] {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0) || value.some((item) => typeof item !== "string" || !item.trim())) {
    throw new FeatureValidationError("FEATURE_CANONICAL_CONTENT_REQUIRED", path);
  }
}
