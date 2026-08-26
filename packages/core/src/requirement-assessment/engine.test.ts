import { describe, expect, it } from "vitest";
import { MockAIProvider } from "../ai/providers";
import { evaluateRequirement } from "./engine";
import type { AssessmentEvidenceSnapshot } from "./evidence";
import type { RequirementBrief } from "./types";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const brief: RequirementBrief = { ...scope, id: "brief-1", revision: 1, intent: { en: "Add API assessment", zh: "增加 API 评估" }, confirmedFacts: [], assumptions: [], acceptanceCriteria: [{ en: "Must be bounded", zh: "必须有边界" }], qualityTargets: [], constraints: [], exclusions: [], author: "test", superseded: false };
const snapshot = (overrides: Partial<AssessmentEvidenceSnapshot> = {}): AssessmentEvidenceSnapshot => ({
  ...scope, id: "snapshot-1", requirementId: brief.id, requirementRevision: 1, authorizationDecisionRef: "auth-1", catalogWaterline: "c1", relationshipWaterline: "r1", projectionCheckpoint: "p1", projectionStatus: "READY", projectionSemanticsAvailable: true,
  orderedAssetManifest: [{ id: "api-1", assetType: "api", contentDigest: "a1", evidenceKinds: ["contract", "caller", "data", "compatibility", "test", "quality", "ownership"] }],
  relationshipManifest: [], rulesetRevision: "rules-1", coveragePolicyRevision: "coverage-1", promptTemplateDigest: "prompt-1", reviewTemplateDigest: "review-1", modelProfileRevision: "model-1", executionProfileRevision: "agent-1", reconciliationStatus: "CONVERGED", authorizationAllowed: true, governanceBlockers: [], evidenceKinds: ["contract", "caller", "data", "compatibility", "test", "quality", "ownership"], contentDigest: "digest-1", validAtWaterline: "c1:r1", ...overrides
});

describe("hybrid requirement evaluation", () => {
  it("returns FEASIBLE only when deterministic coverage is complete", async () => {
    const result = await evaluateRequirement({ brief, snapshot: snapshot(), provider: new MockAIProvider(), rulesetRevision: "rules-1" });
    expect(result.verdict).toBe("FEASIBLE");
    expect(result.evidenceCoverage).toBe(1);
    expect(result.estimate.aiWorkUnits).toBeGreaterThan(0);
  });

  it("keeps missing evidence conditional and blocks forbidden Scope", async () => {
    const conditional = await evaluateRequirement({ brief, snapshot: snapshot({ evidenceKinds: ["contract"] }), provider: new MockAIProvider(), rulesetRevision: "rules-1" });
    expect(conditional.verdict).toBe("CONDITIONAL");
    const blocked = await evaluateRequirement({ brief, snapshot: snapshot({ authorizationAllowed: false }), provider: new MockAIProvider(), rulesetRevision: "rules-1" });
    expect(blocked.verdict).toBe("BLOCKED");
    expect(blocked.deterministicFindings.some((finding) => finding.code === "SCOPE_FORBIDDEN")).toBe(true);
  });

  it("does not let provider failure become a confident result", async () => {
    const provider = { ...new MockAIProvider(), generate: async () => { throw new Error("offline"); } } as unknown as MockAIProvider;
    await expect(evaluateRequirement({ brief, snapshot: snapshot(), provider, rulesetRevision: "rules-1" })).rejects.toThrow("ASSESSMENT_PROVIDER_FAILED");
  });
});
