import { describe, expect, it } from "vitest";
import { ThreeAQueryError } from "./errors";
import { classifyImpactBand, defaultImpactPolicyVersion, normalizeGraphAnalysisBudget, normalizeImpactPolicyVersion, scoreImpact, sortImpactItems } from "./graph-analysis";

describe("graph-analysis", () => {
  it("applies deterministic depth decay and clamps the score", () => {
    const scored = scoreImpact({ relationWeight: 200, confidence: 1, criticalityWeight: 1, depth: 2 });
    expect(scored.score).toBe(100);
    expect(scored.factors.depthDecay).toBeCloseTo(0.72);

    const depthThree = scoreImpact({ relationWeight: 50, confidence: 0.8, criticalityWeight: 1, depth: 3 });
    expect(depthThree.score).toBeCloseTo(20.736);
    expect(depthThree.factors).toEqual({ relationWeight: 50, confidence: 0.8, criticalityWeight: 1, depthDecay: 0.5184 });
  });

  it("classifies direct, likely, extended, and unresolved impact", () => {
    expect(classifyImpactBand(1, 0, false)).toBe("DIRECT");
    expect(classifyImpactBand(2, 20, false)).toBe("LIKELY");
    expect(classifyImpactBand(4, 20, false)).toBe("EXTENDED");
    expect(classifyImpactBand(3, 20, true)).toBe("UNRESOLVED");
    expect(classifyImpactBand(4, 80, true)).toBe("UNRESOLVED");
  });

  it("sorts ties by assertion identity without mutating the input", () => {
    const items = [
      { assertionId: "b", score: 40 },
      { assertionId: "a", score: 40 },
      { assertionId: "c", score: 80 }
    ];
    expect(sortImpactItems(items)).toEqual([
      { assertionId: "c", score: 80 },
      { assertionId: "a", score: 40 },
      { assertionId: "b", score: 40 }
    ]);
    expect(items.map((item) => item.assertionId)).toEqual(["b", "a", "c"]);
  });

  it("enforces the server-owned graph budget hard cap", () => {
    expect(normalizeGraphAnalysisBudget({ maxNodes: 500 }).maxNodes).toBe(500);
    expect(() => normalizeGraphAnalysisBudget({ maxNodes: 501 })).toThrowError(new ThreeAQueryError("QUERY_BUDGET_INVALID"));
  });

  it("requires a valid, versioned impact policy identifier", () => {
    expect(normalizeImpactPolicyVersion()).toBe(defaultImpactPolicyVersion);
    expect(normalizeImpactPolicyVersion(" impact-v2 ")).toBe("impact-v2");
    expect(() => normalizeImpactPolicyVersion(" ")).not.toThrow();
    expect(() => normalizeImpactPolicyVersion("policy/version")).toThrowError(new ThreeAQueryError("QUERY_BUDGET_INVALID"));
  });
});
