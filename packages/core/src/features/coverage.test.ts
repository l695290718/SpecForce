import { describe, expect, it } from "vitest";
import { deriveFeatureGovernanceState } from "./coverage";

describe("deriveFeatureGovernanceState", () => {
  it("marks a service feature complete when a function contributes", () => {
    expect(deriveFeatureGovernanceState({ featureType: "serviceFeature", acceptanceCriteria: ["Observable"], relationships: [{ relationType: "CONTRIBUTES_TO", sourceType: "functionalFeature", targetType: "serviceFeature", direction: "incoming" }] })).toMatchObject({ coverageStatus: "COMPLETE" });
  });
  it("marks an untraced function unmapped", () => {
    expect(deriveFeatureGovernanceState({ featureType: "functionalFeature", acceptanceCriteria: [], relationships: [] })).toMatchObject({ coverageStatus: "UNMAPPED", evidenceStatus: "NO_EVIDENCE" });
  });
  it("recognizes current evidence", () => {
    expect(deriveFeatureGovernanceState({ featureType: "functionalFeature", acceptanceCriteria: ["Published"], currentVersion: "7", relationships: [{ relationType: "VALIDATES", sourceType: "evidence", targetType: "functionalFeature", direction: "incoming", metadata: { validatedAssetVersion: "7" } }] })).toMatchObject({ evidenceStatus: "VERIFIED", consistencyStatus: "CONSISTENT" });
  });
  it("distinguishes stale evidence and drift", () => {
    expect(deriveFeatureGovernanceState({ featureType: "functionalFeature", acceptanceCriteria: ["Published"], currentVersion: "8", relationships: [{ relationType: "VALIDATES", sourceType: "evidence", targetType: "functionalFeature", direction: "incoming", metadata: { validatedAssetVersion: "7" } }] }).consistencyStatus).toBe("STALE");
    expect(deriveFeatureGovernanceState({ featureType: "functionalFeature", acceptanceCriteria: ["Published"], relationships: [{ relationType: "EXPOSES", sourceType: "apiOperation", targetType: "functionalFeature", direction: "incoming", metadata: { drifted: true } }] }).consistencyStatus).toBe("DRIFTED");
  });
});
