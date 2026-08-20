import { describe, expect, it } from "vitest";
import { compareGenerationParity, type ParitySnapshot } from "./generation-parity.js";

const scope = {
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};
const identity = {
  baselineId: "baseline-1",
  manifestId: "manifest-1",
  generationId: "generation-1",
  schemaVersion: "nebula-v1"
};

describe("compareGenerationParity", () => {
  it("matches equal totals, bucket digests, and semantic probes", () => {
    const left = snapshot();
    const result = compareGenerationParity(left, snapshot());

    expect(result.status).toBe("MATCH");
    expect(result.mismatchBuckets).toEqual([]);
    expect(result.semanticProbeMismatches).toEqual([]);
    expect(result.sourceWatermarks.actual).toEqual({ outbox: "42" });
  });

  it("detects a missing tuple in a bounded bucket", () => {
    const result = compareGenerationParity(snapshot(), snapshot({ tuples: [{ entityType: "api", logicalId: "api-1" }] }), { bucketCount: 8 });

    expect(result.status).toBe("MISMATCH");
    expect(result.actualCounts).toEqual({ api: 1 });
    expect(result.mismatchBuckets.length).toBeGreaterThan(0);
  });

  it("detects Scope and identity mismatch without treating samples as parity", () => {
    const result = compareGenerationParity(snapshot(), snapshot({
      scope: { ...scope, applicationServiceId: "com.huawei.celon.policyhub" },
      identity: { ...identity, generationId: "generation-2" }
    }));

    expect(result.status).toBe("MISMATCH");
    expect(result.semanticProbeMismatches).toContain("SCOPE_OR_IDENTITY_MISMATCH");
  });

  it("detects semantic probe mismatch even when structural tuples match", () => {
    const result = compareGenerationParity(snapshot(), snapshot({ semanticProbes: { "api-1:owner": "policyhub" } }));

    expect(result.status).toBe("MISMATCH");
    expect(result.semanticProbeMismatches).toEqual(["api-1:owner"]);
  });
});

function snapshot(overrides: Partial<ParitySnapshot> = {}): ParitySnapshot {
  return {
    scope,
    identity,
    tuples: [
      { entityType: "api", logicalId: "api-1" },
      { entityType: "dataModel", logicalId: "model-1", relationType: "API_USES_MODEL", sourceId: "api-1", targetId: "model-1" }
    ],
    semanticProbes: { "api-1:owner": "designer" },
    sourceWatermarks: { outbox: "42" },
    evidenceReferences: ["parity-test:1"],
    ...overrides
  };
}
