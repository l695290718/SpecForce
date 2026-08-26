import { describe, expect, it } from "vitest";
import { buildEvidenceSnapshot, type AssessmentEvidenceReader } from "./evidence";
import type { RequirementBrief } from "./types";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const brief: RequirementBrief = { ...scope, id: "brief-1", revision: 1, intent: { en: "Add assessment", zh: "增加评估" }, confirmedFacts: [], assumptions: [], acceptanceCriteria: [], qualityTargets: [], constraints: [], exclusions: [], author: "test", superseded: false };

function reader(order: "forward" | "reverse" = "forward"): AssessmentEvidenceReader {
  const assets = [
    { id: "api-b", assetType: "api", revision: 2, contentDigest: "b", evidenceKinds: ["contract"] },
    { id: "api-a", assetType: "api", revision: 1, contentDigest: "a", evidenceKinds: ["contract", "caller"] }
  ];
  return {
    async readCatalog() { return { catalogWaterline: "catalog-1", assets: order === "forward" ? assets : [...assets].reverse() }; },
    async readRelationships() { return { relationshipWaterline: "relationships-1", relationships: [{ sourceType: "api", sourceId: "api-a", targetType: "dataModel", targetId: "data-a", relationType: "READS", contentDigest: "r1" }], complete: true }; },
    async readGovernance() { return { authorizationDecisionRef: "auth-1", authorizationAllowed: true, reconciliationStatus: "CONVERGED", rulesetRevision: "rules-1", coveragePolicyRevision: "coverage-1", blockers: [] }; },
    async readProjection() { return { checkpoint: "projection-1", status: "READY" as const, semanticsAvailable: true }; }
  };
}

describe("assessment evidence snapshots", () => {
  it("is stable when input assets arrive in a different order", async () => {
    const first = await buildEvidenceSnapshot({ scope, brief, reader: reader("forward"), promptTemplateDigest: "prompt-1", reviewTemplateDigest: "review-1", modelProfileRevision: "model-1", executionProfileRevision: "agent-1" });
    const second = await buildEvidenceSnapshot({ scope, brief, reader: reader("reverse"), promptTemplateDigest: "prompt-1", reviewTemplateDigest: "review-1", modelProfileRevision: "model-1", executionProfileRevision: "agent-1" });
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.orderedAssetManifest.map((asset) => asset.id)).toEqual(["api-a", "api-b"]);
  });

  it("changes when a waterline or prompt digest changes", async () => {
    const first = await buildEvidenceSnapshot({ scope, brief, reader: reader(), promptTemplateDigest: "prompt-1", reviewTemplateDigest: "review-1", modelProfileRevision: "model-1", executionProfileRevision: "agent-1" });
    const second = await buildEvidenceSnapshot({ scope, brief, reader: reader(), promptTemplateDigest: "prompt-2", reviewTemplateDigest: "review-1", modelProfileRevision: "model-1", executionProfileRevision: "agent-1" });
    expect(first.contentDigest).not.toBe(second.contentDigest);
  });
});
