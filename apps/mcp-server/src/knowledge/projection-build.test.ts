import { describe, expect, it } from "vitest";
import { genericSystemAnalysisProfile } from "@specforge/core";
import { isReusablePublishedProjection, requireAnalysisProfile } from "./projection-build";

describe("3A projection build contract", () => {
  it("resolves only known versioned analysis profiles", () => {
    expect(requireAnalysisProfile(genericSystemAnalysisProfile.id, genericSystemAnalysisProfile.version)).toMatchObject({ id: "generic-system", version: "1" });
    expect(() => requireAnalysisProfile("generic-system", "999")).toThrow("ANALYSIS_PROFILE_NOT_FOUND");
  });

  it("does not reuse a published manifest when the input digest changes", () => {
    const manifest = { generationId: "generation-1", inputDigest: "digest-old", contentDigest: "content-1" };
    expect(isReusablePublishedProjection(manifest, "digest-old")).toBe(true);
    expect(isReusablePublishedProjection(manifest, "digest-new")).toBe(false);
  });
});
