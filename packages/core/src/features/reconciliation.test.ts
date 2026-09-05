import { describe, expect, it } from "vitest";
import { activeRelationshipsAfterLifecycle, reconcileFeature } from "./reconciliation";

describe("Feature reconciliation", () => {
  const base = { assetType: "functionalFeature" as const, assetId: "ff-a", currentVersion: "2", currentContentDigest: "digest-2" };
  it("marks old evidence stale and current evidence verified", () => {
    expect(reconcileFeature({ ...base, evidence: { id: "e-old", validatedAssetType: "functionalFeature", validatedAssetId: "ff-a", validatedAssetVersion: "1" } })).toMatchObject({ evidenceStatus: "NO_EVIDENCE", consistencyStatus: "STALE" });
    expect(reconcileFeature({ ...base, evidence: { id: "e-current", validatedAssetType: "functionalFeature", validatedAssetId: "ff-a", validatedAssetVersion: "2" } })).toMatchObject({ evidenceStatus: "VERIFIED", consistencyStatus: "CONSISTENT" });
  });
  it("reports implementation drift and invalidates retired links in the derived view", () => {
    expect(reconcileFeature({ ...base, evidence: { id: "e-current", validatedAssetType: "functionalFeature", validatedAssetId: "ff-a", validatedContentDigest: "digest-2" }, implementation: { drifted: true, evidenceRef: "impl-1" } })).toMatchObject({ consistencyStatus: "DRIFTED" });
    expect(activeRelationshipsAfterLifecycle([{ sourceId: "ff-a", targetId: "api-a" }, { sourceId: "other", targetId: "api-a" }], "ff-a", "RETIRED")).toHaveLength(1);
  });
});
