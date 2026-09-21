import { contentDigest } from "@specforge/core";
import type { AssetCapability, AssetCoveragePlan, ScanFinalization, ScanPolicyReceipt } from "@specforge/scan-contract";
import { createHash } from "node:crypto";

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

export function verifyTrustedCoveragePlan(input: {
  assetFamilies: readonly string[];
  coveragePlan: AssetCoveragePlan;
  allowedExtractorIds: readonly string[];
}): AssetCoveragePlan {
  const expectedFamilies = [...new Set(input.assetFamilies)].sort();
  const actualFamilies = [...new Set(input.coveragePlan.assetFamilies)].sort();
  if (!sameStrings(expectedFamilies, actualFamilies)) throw new Error("SCAN_COVERAGE_PLAN_SCOPE_MISMATCH");
  if (input.coveragePlan.capabilities.length !== expectedFamilies.length) throw new Error("SCAN_COVERAGE_PLAN_CAPABILITY_COUNT_INVALID");

  const allowedExtractors = new Set(input.allowedExtractorIds);
  const seenFamilies = new Set<string>();
  for (const capability of input.coveragePlan.capabilities) {
    if (!expectedFamilies.includes(capability.assetFamily) || seenFamilies.has(capability.assetFamily)) {
      throw new Error("SCAN_COVERAGE_PLAN_CAPABILITY_INVALID");
    }
    seenFamilies.add(capability.assetFamily);
    if (capability.extractorIds.some((extractorId) => !allowedExtractors.has(extractorId))) {
      throw new Error(`SCAN_COVERAGE_PLAN_EXTRACTOR_UNTRUSTED:${capability.assetFamily}`);
    }
    if (capability.state === "FULL" || capability.state === "PARTIAL") {
      if (!capability.required || capability.extractorIds.length === 0) {
        throw new Error(`SCAN_COVERAGE_PLAN_EXTRACTOR_MISSING:${capability.assetFamily}`);
      }
      continue;
    }
    if (capability.state === "NOT_APPLICABLE") {
      if (capability.required || capability.extractorIds.length > 0) {
        throw new Error(`SCAN_COVERAGE_PLAN_NOT_APPLICABLE_INVALID:${capability.assetFamily}`);
      }
      continue;
    }
    if (capability.state === "UNSUPPORTED") {
      if (!capability.required || capability.extractorIds.length > 0) {
        throw new Error(`SCAN_COVERAGE_PLAN_UNSUPPORTED_INVALID:${capability.assetFamily}`);
      }
      continue;
    }
    throw new Error(`SCAN_COVERAGE_PLAN_NATIVE_STATE_INVALID:${capability.assetFamily}`);
  }

  if (input.coveragePlan.digest !== nativeCoverageDigest(input.coveragePlan)) {
    throw new Error("SCAN_COVERAGE_PLAN_DIGEST_MISMATCH");
  }
  return input.coveragePlan;
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
  for (const gap of input.finalization.coverage.coverageGaps) {
    if (isBlockingCoverageGap(gap)) blockingIssues.add(`COVERAGE_GAP:${gap}`);
  }
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

export function isBlockingCoverageGap(gap: string): boolean {
  const reason = gap.includes(":") ? gap.slice(gap.lastIndexOf(":") + 1) : gap;
  return reason !== "UNSUPPORTED_SOURCE_TYPE"
    && reason !== "BINARY_SOURCE_SKIPPED"
    && reason !== "CREDENTIAL_FILE_BLOCKED"
    && reason !== "SQL_SCHEMA_HAS_NO_CREATE_TABLE"
    && !reason.endsWith("_NO_SUPPORTED_CONSTRUCTS")
    && !reason.includes("_PARSER_DEPTH_CONSERVATIVE");
}

function nativeCoverageDigest(plan: AssetCoveragePlan): string {
  const normalized = {
    assetFamilies: plan.assetFamilies,
    capabilities: plan.capabilities.map((capability) => ({
      assetFamily: capability.assetFamily,
      framework: capability.framework,
      state: capability.state,
      required: capability.required,
      reasonCodes: capability.reasonCodes,
      extractorIds: capability.extractorIds
    })),
    complete: plan.complete,
    digest: ""
  };
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
