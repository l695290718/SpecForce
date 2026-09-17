import type { ScanFinalization, ScanPolicyReceipt } from "@specforge/scan-contract";

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
