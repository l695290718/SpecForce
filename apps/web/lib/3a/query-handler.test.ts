import { describe, expect, it, vi } from "vitest";
import type { ArchitectureScopeRef } from "@specforge/core";
import type { ThreeAProjectionQueryService } from "@specforge/knowledge-query";
import { handleThreeAQuery, type ThreeAQueryHandlerDependencies } from "./query-handler";
import type { ResolvedThreeARequest } from "./principal";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" } as const;
const principal = { actorType: "agent" as const, actorId: "test", subject: "test", tenantId: "tenant", authSource: "seed" as const, grants: [], permissions: ["knowledge:read" as const], decisionRef: "test" };
const base = { ...scope, baselineId: "b1", projectionManifestId: "p1", profileId: "profile", profileVersion: "v1", relationshipVersion: "r1", resultDigest: "digest" };

function request(body: unknown) { return new Request("http://localhost/api/architecture/3a/query", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); }

function makeDependencies() {
  const service = {
    searchArchitectureFacts: vi.fn().mockResolvedValue({ ...base, nodes: [] }),
    traceArchitecturePath: vi.fn().mockResolvedValue({ ...base, nodes: [], edges: [], paths: [] }),
    getArchitectureFactDetail: vi.fn().mockResolvedValue({ ...base, node: {}, evidenceRefs: [], sourceObservationIds: [], unresolvedQuestions: [], counterEvidence: [], incoming: [], outgoing: [], warnings: [] })
  } as unknown as ThreeAProjectionQueryService;
  const graphProvider = {
    overview: vi.fn().mockResolvedValue({ ...base, nodes: [], edges: [] }),
    neighborhood: vi.fn().mockResolvedValue({ ...base, nodes: [], edges: [], paths: [] }),
    impact: vi.fn().mockResolvedValue({ ...base, focusAssertionId: "focus-1", policyVersion: "impact-v1", items: [], paths: [], cutPointAssertionIds: [], countsByBand: { DIRECT: 0, LIKELY: 0, EXTENDED: 0, UNRESOLVED: 0 } })
  };
  const createService = vi.fn().mockReturnValue(service);
  return {
    service,
    graphProvider,
    createService,
    dependencies: {
      resolveRequest: vi.fn().mockImplementation(async (_request: Request, requestedScope: ArchitectureScopeRef) => {
        if (requestedScope.applicationServiceId !== scope.applicationServiceId) throw new Error("SCOPE_ACCESS_DENIED");
        return { architectureScope: scope, principal } satisfies ResolvedThreeARequest;
      }),
      createService,
      createGraphProvider: () => graphProvider
    } satisfies ThreeAQueryHandlerDependencies
  };
}

describe("handleThreeAQuery", () => {
  it("denies an unknown or unauthorized Scope before service dispatch", async () => {
    const { service, dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "search", scope: "com.huawei.celon.policyhub", baselineId: "b1", projectionManifestId: "p1", layer: "BIZ", limit: 20 }), dependencies);
    expect(response.status).toBe(403);
    expect(service.searchArchitectureFacts).not.toHaveBeenCalled();
  });

  it("passes normalized trace filters through the authorized service", async () => {
    const { service, dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "trace", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1", startAssertionId: "sys-1", direction: "upstream", relationTypes: ["CALLS", "CALLS"], layers: ["BIZ", "SYS"] }), dependencies);
    expect(response.status).toBe(200);
    expect(service.traceArchitecturePath).toHaveBeenCalledWith(expect.objectContaining({ relationTypes: ["CALLS"], layers: ["BIZ", "SYS"] }));
  });

  it("routes overview through the exact-Scope graph provider with normalized filters and bounded budget", async () => {
    const { graphProvider, createService, dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "overview", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1", layers: ["SYS", "BIZ", "SYS"], assetTypes: [" z ", "a", "z"], relationTypes: ["REL2", "REL1", "REL2"], budget: { maxNodes: 300 } }), dependencies);
    expect(response.status).toBe(200);
    expect(createService).not.toHaveBeenCalled();
    expect(graphProvider.overview).toHaveBeenCalledWith(expect.objectContaining({
      architectureScope: scope,
      baselineId: "b1",
      projectionManifestId: "p1",
      layers: ["BIZ", "SYS"],
      assetTypes: ["a", "z"],
      relationTypes: ["REL1", "REL2"],
      budget: { maxNodes: 300, maxEdges: 500, maxPaths: 100, timeoutMs: 3_000, maxPayloadBytes: 1_048_576 }
    }));
  });

  it("routes impact with a versioned policy and rejects an over-cap budget", async () => {
    const { graphProvider, dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "impact", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1", focusAssertionId: "biz-1", direction: "downstream", layers: ["TECH", "SYS", "TECH"], relationTypes: ["Z", "A", "Z"], policyVersion: " impact-v2 ", budget: { maxEdges: 600 } }), dependencies);
    expect(response.status).toBe(200);
    expect(graphProvider.impact).toHaveBeenCalledWith(expect.objectContaining({
      architectureScope: scope,
      focusAssertionId: "biz-1",
      direction: "downstream",
      layers: ["SYS", "TECH"],
      relationTypes: ["A", "Z"],
      policyVersion: "impact-v2",
      budget: { maxNodes: 150, maxEdges: 600, maxPaths: 100, timeoutMs: 3_000, maxPayloadBytes: 1_048_576 }
    }));

    const rejected = await handleThreeAQuery(request({ operation: "impact", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1", focusAssertionId: "biz-1", direction: "both", budget: { maxEdges: 1_001 } }), dependencies);
    expect(rejected.status).toBe(400);
    await expect(rejected.json()).resolves.toEqual({ code: "QUERY_BUDGET_INVALID" });
    expect(graphProvider.impact).toHaveBeenCalledTimes(1);
  });

  it("returns a safe graph-analysis unavailable error when the provider is not configured", async () => {
    const { dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "overview", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1" }), {
      ...dependencies,
      createGraphProvider: undefined
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: "GRAPH_ANALYSIS_UNAVAILABLE" });
  });

  it("collapses raw graph-provider failures to a safe unavailable response", async () => {
    const { graphProvider, dependencies } = makeDependencies();
    graphProvider.overview.mockRejectedValueOnce(new Error("database connection refused at 10.0.0.7"));
    const response = await handleThreeAQuery(request({ operation: "overview", scope: scope.applicationServiceId, baselineId: "b1", projectionManifestId: "p1" }), dependencies);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: "UNAVAILABLE" });
  });

  it("returns a safe error for malformed input", async () => {
    const { dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "search", scope: scope.applicationServiceId }), dependencies);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_REQUEST" });
  });
});
