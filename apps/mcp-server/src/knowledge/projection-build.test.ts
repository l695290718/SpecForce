import { describe, expect, it } from "vitest";
import { genericSystemAnalysisProfile } from "@specforge/core";
import { requireAnalysisProfile } from "./projection-build";

describe("3A projection build contract", () => {
  it("resolves only known versioned analysis profiles", () => {
    expect(requireAnalysisProfile(genericSystemAnalysisProfile.id, genericSystemAnalysisProfile.version)).toMatchObject({ id: "generic-system", version: "1" });
    expect(() => requireAnalysisProfile("generic-system", "999")).toThrow("ANALYSIS_PROFILE_NOT_FOUND");
  });
});
