import { describe, expect, it } from "vitest";
import * as core from "../index";

type RelationshipOntologyApi = {
  relationshipOntology?: Map<string, unknown>;
  validateRelationshipEndpoints?: (code: string, sourceType: string, targetType: string) => void;
  createTraversalPlan?: (input: { startNodes: unknown[]; allowedScopes: unknown[] }) => unknown;
};

const relationshipApi = core as typeof core & RelationshipOntologyApi;

describe("relationship ontology", () => {
  it("propagates CONSUMES in reverse only with strong strength", () => {
    expect(relationshipApi.relationshipOntology).toBeDefined();
    expect(relationshipApi.relationshipOntology?.get("CONSUMES")).toMatchObject({
      forwardPropagation: false,
      reversePropagation: true,
      strength: "strong"
    });
  });

  it("rejects invalid CARRIES endpoints", () => {
    expect(relationshipApi.validateRelationshipEndpoints).toBeTypeOf("function");
    expect(() => relationshipApi.validateRelationshipEndpoints?.("CARRIES", "event", "api")).toThrow(
      "RELATIONSHIP_ENDPOINT_INVALID"
    );
  });

  it("requires an allowed Scope for traversal plans", () => {
    const root = {
      applicationServiceId: "com.huawei.celon.desiner",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
      nodeType: "dataModel",
      logicalId: "customer-model",
      rootAssetType: "dataModel",
      rootAssetId: "customer-model"
    };

    expect(relationshipApi.createTraversalPlan).toBeTypeOf("function");
    expect(() => relationshipApi.createTraversalPlan?.({ startNodes: [root], allowedScopes: [] })).toThrow(
      "ALLOWED_SCOPES_REQUIRED"
    );
  });
});
