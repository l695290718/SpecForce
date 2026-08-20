import { describe, expect, it } from "vitest";
import {
  assertSameProjectionIdentity,
  createProjectionIdentity,
  generationQualifiedEdgeRank,
  generationQualifiedVertexId,
  type ProjectionIdentity
} from "../graph/projection-generation";

const identity = (manifestId: string): ProjectionIdentity => createProjectionIdentity({
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
  baselineId: "baseline-v1",
  manifestId,
  generationId: `generation-${manifestId}`,
  schemaVersion: "nebula.3a.v1"
});

describe("generation-qualified graph identities", () => {
  it("changes the vertex identity when only the manifest changes", () => {
    const first = generationQualifiedVertexId(identity("manifest-a"), "asset", "api-1");
    const second = generationQualifiedVertexId(identity("manifest-b"), "asset", "api-1");
    expect(first).not.toBe(second);
    expect(first).toHaveLength(66);
    expect(first).toMatch(/^n:[0-9a-f]{64}$/u);
  });

  it("rejects an edge identity that crosses Scope or Manifest", () => {
    expect(() => assertSameProjectionIdentity(identity("manifest-a"), identity("manifest-b"))).toThrow("PROJECTION_IDENTITY_MISMATCH");
  });

  it("uses the persisted ordinal as a safe signed Nebula rank", () => {
    expect(generationQualifiedEdgeRank(42n)).toBe(42n);
    expect(() => generationQualifiedEdgeRank(0n)).toThrow("PROJECTION_ORDINAL_INVALID");
  });

  it("fails closed when an identity component is missing", () => {
    expect(() => createProjectionIdentity({ ...identity("manifest-a"), generationId: "" })).toThrow("PROJECTION_IDENTITY_REQUIRED");
  });
});
