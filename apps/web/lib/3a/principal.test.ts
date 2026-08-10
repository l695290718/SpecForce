import { describe, expect, it } from "vitest";
import { normalizePrincipalClaims, scopeById } from "@specforge/core";
import { resolveThreeARequest, resolveWebPrincipal } from "./principal";

const designerScope = scopeById("com.huawei.celon.desiner")!;
const scope = { applicationServiceId: designerScope.id, scopePath: designerScope.scopePath };
const cookies = { get: () => undefined };

describe("Web 3A principal boundary", () => {
  it("fails closed outside seed mode when no provider is configured", async () => {
    await expect(resolveWebPrincipal({ authMode: "production", headers: new Headers(), cookies })).rejects.toThrow("WEB_PRINCIPAL_RESOLVER_REQUIRED");
  });

  it("authorizes only the exact application-service Scope", async () => {
    const principal = normalizePrincipalClaims({ actorType: "agent", subject: "agent-1", tenantId: "tenant-1", authSource: "static-bearer", grants: [{ scopeId: scope.applicationServiceId, action: "read" }], permissions: ["knowledge:read"] });
    const provider = { resolve: async () => principal };
    await expect(resolveThreeARequest({ authMode: "production", headers: new Headers(), cookies, provider, architectureScope: scope })).resolves.toMatchObject({ architectureScope: scope, principal });
    await expect(resolveThreeARequest({ authMode: "production", headers: new Headers(), cookies, provider, architectureScope: { applicationServiceId: "com.huawei.celon.runtime", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-runtime/com.huawei.celon.runtime" } })).rejects.toThrow("SCOPE_ACCESS_DENIED");
  });

  it("does not copy raw credentials into the normalized principal", async () => {
    const principal = normalizePrincipalClaims({ actorType: "agent", subject: "agent-1", tenantId: "tenant-1", authSource: "static-bearer", grants: [{ scopeId: scope.applicationServiceId, action: "read" }], permissions: ["knowledge:read"] });
    const provider = { resolve: async () => principal };
    const result = await resolveWebPrincipal({ authMode: "production", headers: new Headers({ authorization: "Bearer secret" }), cookies, provider });
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
