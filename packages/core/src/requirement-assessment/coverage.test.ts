import { describe, expect, it } from "vitest";
import { deterministicCoverageFindings, evaluateEvidenceCoverage } from "./coverage";

describe("requirement evidence coverage", () => {
  it("uses the API policy and deterministically caps incomplete evidence", () => {
    const complete = evaluateEvidenceCoverage({
      requirementKind: "api",
      evidenceKinds: ["contract", "caller", "data", "compatibility", "test", "quality", "ownership"],
      policyRevision: "coverage-v1"
    });
    const incomplete = evaluateEvidenceCoverage({
      requirementKind: "api",
      evidenceKinds: ["contract", "caller", "quality"],
      policyRevision: "coverage-v1"
    });

    expect(complete.coverage).toBe(1);
    expect(complete.missingKinds).toEqual([]);
    expect(incomplete.coverage).toBeLessThan(complete.coverage);
    expect(incomplete.confidenceCap).toBeLessThan(complete.confidenceCap);
    expect(deterministicCoverageFindings(incomplete)[0]?.severity).toBe("warning");
  });

  it("keeps domain-specific policies separate", () => {
    const result = evaluateEvidenceCoverage({ requirementKind: "rule", evidenceKinds: ["rule", "state", "test", "quality", "ownership"], policyRevision: "coverage-v1" });
    expect(result.requiredKinds).toEqual(["rule", "state", "test", "quality", "ownership"]);
  });
});
