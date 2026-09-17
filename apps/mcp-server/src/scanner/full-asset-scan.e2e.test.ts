import { describe, expect, it } from "vitest";
import { assessScanFinalization } from "./finalization";

const drivers = ["codex", "claude-code", "opencode"] as const;
const receipt = {
  systemGovernanceDigest: "1".repeat(64),
  extractorCatalogDigest: "2".repeat(64),
  semanticPromptPackDigest: "3".repeat(64),
  scopeRuntimeProfileDigest: "4".repeat(64),
  effectivePolicyDigest: "5".repeat(64)
};

describe("cross-agent governed scan contract", () => {
  it.each(drivers)("uses the same exact-Scope candidate contract for %s", (driver) => {
    const finalization = {
      contractVersion: "2.0" as const,
      sessionId: `scan-session:${driver}`,
      architectureScope: { applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" },
      repositorySnapshotDigest: "a".repeat(64),
      manifestDigest: "b".repeat(64),
      finalBatchDigest: "c".repeat(64),
      batchCount: 1,
      observationCount: 1,
      coverage: { indexedFiles: 1, skippedFiles: 0, observationCount: 1, coverageGaps: [] },
      coveragePlan: { assetFamilies: ["api"], capabilities: [{ assetFamily: "api", framework: "repository", state: "FULL" as const, required: true, reasonCodes: [], extractorIds: ["openapi-asyncapi-contracts"] }], complete: true, digest: "d".repeat(64) },
      policyReceipt: receipt,
      generatedAt: "2026-09-18T00:00:00.000Z"
    };
    const result = assessScanFinalization({ finalization, expectedPolicyReceipt: receipt });
    expect(result).toEqual({ status: "READY", blockingIssues: [] });
    expect(finalization.architectureScope.applicationServiceId).toBe("com.specforge.designcenter");
  });

  it("keeps unsupported required capabilities out of ready analysis", () => {
    const base = {
      contractVersion: "2.0" as const,
      sessionId: "scan-session:blocked",
      architectureScope: { applicationServiceId: "com.specforge.designcenter", scopePath: "scope" },
      repositorySnapshotDigest: "a".repeat(64), manifestDigest: "b".repeat(64), finalBatchDigest: "c".repeat(64), batchCount: 1, observationCount: 1,
      coverage: { indexedFiles: 1, skippedFiles: 0, observationCount: 1, coverageGaps: [] },
      coveragePlan: { assetFamilies: ["api"], capabilities: [{ assetFamily: "api", framework: "unknown", state: "UNSUPPORTED" as const, required: true, reasonCodes: ["REQUIRED_EXTRACTOR_MISSING"], extractorIds: [] }], complete: false, digest: "d".repeat(64) },
      policyReceipt: receipt, generatedAt: "2026-09-18T00:00:00.000Z"
    };
    expect(assessScanFinalization({ finalization: base, expectedPolicyReceipt: receipt }).status).toBe("BLOCKED");
  });
});
