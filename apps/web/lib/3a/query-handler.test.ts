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
  return {
    service,
    dependencies: {
      resolveRequest: vi.fn().mockImplementation(async (_request: Request, requestedScope: ArchitectureScopeRef) => {
        if (requestedScope.applicationServiceId !== scope.applicationServiceId) throw new Error("SCOPE_ACCESS_DENIED");
        return { architectureScope: scope, principal } satisfies ResolvedThreeARequest;
      }),
      createService: () => service
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

  it("returns a safe error for malformed input", async () => {
    const { dependencies } = makeDependencies();
    const response = await handleThreeAQuery(request({ operation: "search", scope: scope.applicationServiceId }), dependencies);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: "INVALID_REQUEST" });
  });
});
