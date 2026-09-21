import { contentDigest } from "@specforge/core";
import type { AssetCapability, AssetCoveragePlan, ScanFinalization, ScanPolicyReceipt } from "@specforge/scan-contract";

const OBSERVATION_FAMILY_MAP: Readonly<Record<string, string>> = {
  "api-contract": "api",
  "event-contract": "event",
  "data-model": "dataModel",
  documentation: "evidence",
  "system-component": "serviceFeature"
};

export function deriveCoveragePlan(input: {
  assetFamilies: readonly string[];
  observationTypes: readonly string[];
  extractorId: string;
}): AssetCoveragePlan {
  const assetFamilies = [...new Set(input.assetFamilies)].sort();
  const observedFamilies = new Set(
    input.observationTypes
      .map((observationType) => OBSERVATION_FAMILY_MAP[observationType])
      .filter((assetFamily): assetFamily is string => Boolean(assetFamily))
  );
  const capabilities: AssetCapability[] = assetFamilies.map((assetFamily) => {
    const directlyObserved = observedFamilies.has(assetFamily);
    return {
      assetFamily,
      framework: "repository-observer",
      state: "SEMANTIC_REVIEW_REQUIRED",
      required: true,
      reasonCodes: directlyObserved
        ? ["OBSERVATION_COVERED", "SEMANTIC_REVIEW_REQUIRED"]
        : ["SEMANTIC_REVIEW_REQUIRED"],
      extractorIds: directlyObserved ? [input.extractorId] : []
    };
  });
  const complete = true;
  return {
    assetFamilies,
    capabilities,
    complete,
    digest: contentDigest({ assetFamilies, capabilities, complete })
  };
}

export interface ScanFinalizationAssessment {
  status: "READY" | "BLOCKED" | "STALE";
  blockingIssues: string[];
}

export function assessScanFinalization(input: {
  finalization: ScanFinalization;
  expectedPolicyReceipt: ScanPolicyReceipt;
}): ScanFinalizationAssessment {
  const blockingIssues = new Set<string>();
  for (const gap of input.finalization.coverage.coverageGaps) blockingIssues.add(`COVERAGE_GAP:${gap}`);
  for (const capability of input.finalization.coveragePlan.capabilities) {
    if (!capability.required) continue;
    if (capability.state === "UNSUPPORTED") {
      for (const reason of capability.reasonCodes.length > 0 ? capability.reasonCodes : ["REQUIRED_CAPABILITY_UNSUPPORTED"]) {
        blockingIssues.add(`${reason}:${capability.framework}:${capability.assetFamily}`);
      }
    }
    if (capability.reasonCodes.some((reason) => reason === "EXTRACTOR_FAILED" || reason === "EXTRACTOR_TERMINAL_FAILURE")) {
      blockingIssues.add(`EXTRACTOR_FAILED:${capability.framework}:${capability.assetFamily}`);
    }
  }
  if (!input.finalization.coveragePlan.complete) blockingIssues.add("COVERAGE_PLAN_INCOMPLETE");
  if (!samePolicyReceipt(input.finalization.policyReceipt, input.expectedPolicyReceipt)) {
    return { status: "STALE", blockingIssues: ["SCAN_RESUME_CONTEXT_MISMATCH:POLICY_RECEIPT"] };
  }
  return { status: blockingIssues.size === 0 ? "READY" : "BLOCKED", blockingIssues: [...blockingIssues].sort() };
}

function samePolicyReceipt(left: ScanPolicyReceipt, right: ScanPolicyReceipt): boolean {
  return left.systemGovernanceDigest === right.systemGovernanceDigest
    && left.extractorCatalogDigest === right.extractorCatalogDigest
    && left.semanticPromptPackDigest === right.semanticPromptPackDigest
    && left.scopeRuntimeProfileDigest === right.scopeRuntimeProfileDigest
    && left.effectivePolicyDigest === right.effectivePolicyDigest;
}
