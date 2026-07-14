import { describe, expect, it } from "vitest";
import * as core from "../index";

type RelationshipOntologyApi = {
  relationshipOntology?: Map<string, unknown>;
  validateRelationshipEndpoints?: (code: string, sourceType: string, targetType: string) => void;
  createTraversalPlan?: (input: unknown) => unknown;
  createGraphTraversalResult?: (input: unknown) => unknown;
};

const relationshipApi = core as typeof core & RelationshipOntologyApi;
const designerService = core.scopeById("com.huawei.celon.desiner")!;
const runtimeService = core.scopeById("com.huawei.celon.runtime")!;

function scopeRef(scope: typeof designerService) {
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

function rootIn(scope: typeof designerService, logicalId: string) {
  return {
    applicationServiceId: scope.id,
    scopePath: scope.scopePath,
    nodeType: "dataModel",
    logicalId,
    rootAssetType: "dataModel",
    rootAssetId: logicalId
  };
}

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

  it("requires an explicit authorization boundary for traversal plans", () => {
    expect(relationshipApi.createTraversalPlan).toBeTypeOf("function");
    expect(() => relationshipApi.createTraversalPlan?.({ startNodes: [rootIn(designerService, "customer-model")], allowedScopes: [] })).toThrow(
      "TRAVERSAL_AUTHORIZATION_REQUIRED"
    );
  });

  it("rejects multiple legacy scopes for a first-delivery traversal", () => {
    expect(relationshipApi.createTraversalPlan).toBeTypeOf("function");
    expect(() =>
      relationshipApi.createTraversalPlan?.({
        authorization: { actor: core.defaultHuaweiActor, scope: scopeRef(designerService) },
        startNodes: [rootIn(designerService, "customer-model")],
        allowedScopes: [scopeRef(designerService), scopeRef(runtimeService)]
      })
    ).toThrow("MULTIPLE_ALLOWED_SCOPES_UNSUPPORTED");
  });

  it("rejects roots outside the actor's authorized application-service Scope", () => {
    expect(relationshipApi.createTraversalPlan).toBeTypeOf("function");
    expect(() =>
      relationshipApi.createTraversalPlan?.({
        authorization: { actor: core.defaultHuaweiActor, scope: scopeRef(runtimeService) },
        startNodes: [rootIn(runtimeService, "runtime-model")],
        allowedScopes: [scopeRef(runtimeService)]
      })
    ).toThrow("SCOPE_ACCESS_DENIED");
  });

  it("rejects roots from a different application-service Scope", () => {
    expect(relationshipApi.createTraversalPlan).toBeTypeOf("function");
    expect(() =>
      relationshipApi.createTraversalPlan?.({
        authorization: { actor: core.defaultHuaweiActor, scope: scopeRef(designerService) },
        startNodes: [rootIn(runtimeService, "runtime-model")]
      })
    ).toThrow("ROOT_SCOPE_MISMATCH");
  });

  it("rejects a COMPLETE result that represents budget exhaustion", () => {
    expect(relationshipApi.createGraphTraversalResult).toBeTypeOf("function");
    expect(() =>
      relationshipApi.createGraphTraversalResult?.({
        status: "COMPLETE",
        nodes: [],
        edges: [],
        paths: [],
        frontier: [rootIn(designerService, "customer-model")],
        graphVersion: 1n,
        elapsedMs: 5,
        truncationReasons: ["MAX_NODES"]
      })
    ).toThrow("COMPLETE_RESULT_INVALID");
  });

  it("requires a non-empty frontier for PARTIAL traversal results", () => {
    expect(relationshipApi.createGraphTraversalResult).toBeTypeOf("function");
    expect(() =>
      relationshipApi.createGraphTraversalResult?.({
        status: "PARTIAL",
        nodes: [],
        edges: [],
        paths: [],
        frontier: [],
        graphVersion: 1n,
        elapsedMs: 5,
        truncationReasons: ["MAX_NODES"]
      })
    ).toThrow("PARTIAL_FRONTIER_REQUIRED");
  });

  it("preserves a non-empty frontier for valid PARTIAL traversal results", () => {
    expect(relationshipApi.createGraphTraversalResult).toBeTypeOf("function");
    expect(
      relationshipApi.createGraphTraversalResult?.({
        status: "PARTIAL",
        nodes: [],
        edges: [],
        paths: [],
        frontier: [rootIn(designerService, "customer-model")],
        graphVersion: 1n,
        elapsedMs: 5,
        truncationReasons: ["MAX_NODES"]
      })
    ).toMatchObject({
      status: "PARTIAL",
      frontier: [expect.objectContaining({ logicalId: "customer-model" })],
      truncationReasons: ["MAX_NODES"]
    });
  });
});
