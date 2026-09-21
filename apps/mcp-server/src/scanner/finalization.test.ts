import type { ScanFinalization, ScanPolicyReceipt } from "@specforge/scan-contract";
import { describe, expect, it } from "vitest";
import { assessScanFinalization, deriveCoveragePlan } from "./finalization";

const receipt: ScanPolicyReceipt = {
  systemGovernanceDigest: "1".repeat(64),
  extractorCatalogDigest: "2".repeat(64),
  semanticPromptPackDigest: "3".repeat(64),
  scopeRuntimeProfileDigest: "4".repeat(64),
  effectivePolicyDigest: "5".repeat(64)
};

function finalization(overrides: Partial<ScanFinalization> = {}): ScanFinalization {
  return {
    contractVersion: "2.0",
    sessionId: "scan-session:test",
    architectureScope: { applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" },
    repositorySnapshotDigest: "a".repeat(64),
    manifestDigest: "b".repeat(64),
    finalBatchDigest: "c".repeat(64),
    batchCount: 1,
    observationCount: 1,
    coverage: { indexedFiles: 1, skippedFiles: 0, observationCount: 1, coverageGaps: [] },
    coveragePlan: { assetFamilies: ["api"], capabilities: [{ assetFamily: "api", framework: "nestjs", state: "FULL", required: true, reasonCodes: [], extractorIds: ["typescript-node-conservative"] }], complete: true, digest: "d".repeat(64) },
    policyReceipt: receipt,
    generatedAt: "2026-09-18T00:00:00.000Z",
    ...overrides
  };
}

describe("governed scan finalization", () => {
  it("derives a deterministic semantic-review plan from persisted observations", () => {
    const first = deriveCoveragePlan({
      assetFamilies: ["api", "dataModel", "event"],
      observationTypes: ["data-model", "api-contract"],
      extractorId: "portable-repository-observer"
    });
    const second = deriveCoveragePlan({
      assetFamilies: ["event", "dataModel", "api"],
      observationTypes: ["api-contract", "data-model"],
      extractorId: "portable-repository-observer"
    });

    expect(first).toEqual(second);
    expect(first.complete).toBe(true);
    expect(first.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetFamily: "api", state: "SEMANTIC_REVIEW_REQUIRED", reasonCodes: ["OBSERVATION_COVERED", "SEMANTIC_REVIEW_REQUIRED"] }),
      expect.objectContaining({ assetFamily: "dataModel", state: "SEMANTIC_REVIEW_REQUIRED", reasonCodes: ["OBSERVATION_COVERED", "SEMANTIC_REVIEW_REQUIRED"] }),
      expect.objectContaining({ assetFamily: "event", state: "SEMANTIC_REVIEW_REQUIRED", reasonCodes: ["SEMANTIC_REVIEW_REQUIRED"] })
    ]));
  });

  it("keeps unobserved asset families reviewable instead of declaring them unsupported", () => {
    const plan = deriveCoveragePlan({
      assetFamilies: ["businessRule", "stateMachine"],
      observationTypes: ["source-file"],
      extractorId: "portable-repository-observer"
    });

    expect(plan.complete).toBe(true);
    expect(plan.capabilities.every((capability) => capability.state === "SEMANTIC_REVIEW_REQUIRED")).toBe(true);
    expect(plan.capabilities.flatMap((capability) => capability.reasonCodes)).not.toContain("UNSUPPORTED");
  });

  it("blocks a required capability without a trusted extractor", () => {
    const result = assessScanFinalization({
      finalization: finalization({ coveragePlan: { assetFamilies: ["api"], capabilities: [{ assetFamily: "api", framework: "nestjs", state: "UNSUPPORTED", required: true, reasonCodes: ["REQUIRED_EXTRACTOR_MISSING"], extractorIds: [] }], complete: false, digest: "d".repeat(64) } }),
      expectedPolicyReceipt: receipt
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.blockingIssues).toEqual(["COVERAGE_PLAN_INCOMPLETE", "REQUIRED_EXTRACTOR_MISSING:nestjs:api"]);
  });

  it("does not block a proven non-applicable family", () => {
    const result = assessScanFinalization({
      finalization: finalization({ coveragePlan: { assetFamilies: ["event"], capabilities: [{ assetFamily: "event", framework: "repository", state: "NOT_APPLICABLE", required: false, reasonCodes: ["NO_MESSAGING_EVIDENCE"], extractorIds: [] }], complete: true, digest: "d".repeat(64) } }),
      expectedPolicyReceipt: receipt
    });
    expect(result.status).toBe("READY");
    expect(result.blockingIssues).toEqual([]);
  });

  it("marks a changed policy receipt stale", () => {
    const result = assessScanFinalization({ finalization: finalization(), expectedPolicyReceipt: { ...receipt, effectivePolicyDigest: "9".repeat(64) } });
    expect(result).toEqual({ status: "STALE", blockingIssues: ["SCAN_RESUME_CONTEXT_MISMATCH:POLICY_RECEIPT"] });
  });
});
