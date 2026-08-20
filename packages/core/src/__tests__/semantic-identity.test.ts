import { describe, expect, it } from "vitest";
import {
  semanticProjectionIdentity,
  validateSemanticSourceBinding,
  type SemanticSourceBinding
} from "../graph/semantic-identity";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const binding = (): SemanticSourceBinding => ({
  sourceProjectionManifestId: "projection-manifest:designer:v6",
  sourceCoverageManifestId: "coverage-generation:designer:3a:v13",
  knowledgeGenerationId: "knowledge-generation:designer:v6",
  coverageGenerationId: "coverage-generation:designer:3a:v13",
  relationshipVersion: "graph-version:designer:42",
  catalogVersion: "catalog:designer:307",
  catalogDigest: "sha256:catalog-307",
  semanticSchemaVersion: "nebula.3a.semantic.v1"
});

describe("semantic projection identity", () => {
  it("accepts a complete source binding and keeps source generations explicit", () => {
    const identity = semanticProjectionIdentity(scope, {
      id: "nebula-manifest:v6",
      generationId: "nebula-generation:v6",
      baselineId: "knowledge-baseline:designer:3a:v6",
      profileId: "profile-default",
      profileVersion: "1",
      projectionSchemaVersion: "nebula.3a.v1"
    }, binding());

    expect(identity).toMatchObject({
      manifestId: "nebula-manifest:v6",
      generationId: "nebula-generation:v6",
      sourceProjectionManifestId: "projection-manifest:designer:v6",
      sourceCoverageManifestId: "coverage-generation:designer:3a:v13",
      knowledgeGenerationId: "knowledge-generation:designer:v6",
      coverageGenerationId: "coverage-generation:designer:3a:v13",
      semanticSchemaVersion: "nebula.3a.semantic.v1"
    });
  });

  it.each([
    ["sourceProjectionManifestId", { sourceProjectionManifestId: "" }],
    ["catalogDigest", { catalogDigest: "" }],
    ["semanticSchemaVersion", { semanticSchemaVersion: "nebula.3a.semantic.v0" }]
  ])("rejects an invalid %s", (_field, override) => {
    expect(() => validateSemanticSourceBinding(scope, { ...binding(), ...override } as SemanticSourceBinding)).toThrow("SEMANTIC_SOURCE_BINDING_INVALID");
  });

  it("rejects an empty Scope before accepting the binding", () => {
    expect(() => validateSemanticSourceBinding({ ...scope, scopePath: "" }, binding())).toThrow("SEMANTIC_SCOPE_REQUIRED");
  });
});
