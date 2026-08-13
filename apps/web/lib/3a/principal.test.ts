import { describe, expect, it } from "vitest";
import { normalizePrincipalClaims, scopeById } from "@specforge/core";
import { resolveThreeARequest, resolveWebPrincipal } from "./principal";

const designerScope = scopeById("com.huawei.celon.desiner")!;
const policyHubScope = scopeById("com.huawei.celon.policyhub")!;
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

  it("resolves an explicitly configured static Web principal", async () => {
    const previousMode = process.env.SPECFORGE_WEB_AUTH_MODE;
    const previousClaims = process.env.SPECFORGE_WEB_PRINCIPAL_CLAIMS;
    process.env.SPECFORGE_WEB_AUTH_MODE = "static";
    process.env.SPECFORGE_WEB_PRINCIPAL_CLAIMS = JSON.stringify({
      actorType: "agent",
      actorId: "web-agent",
      tenantId: "tenant-1",
      grants: [{ scopeId: scope.applicationServiceId, action: "read" }],
      permissions: ["knowledge:read"]
    });
    try {
      await expect(resolveThreeARequest({ architectureScope: scope, authMode: "static", headers: new Headers(), cookies })).resolves.toMatchObject({
        principal: { actorId: "web-agent", grants: [{ scopeId: scope.applicationServiceId, action: "read" }] }
      });
      await expect(resolveThreeARequest({ architectureScope: { applicationServiceId: policyHubScope.id, scopePath: policyHubScope.scopePath }, authMode: "static", headers: new Headers(), cookies })).rejects.toThrow("SCOPE_ACCESS_DENIED");
    } finally {
      if (previousMode === undefined) delete process.env.SPECFORGE_WEB_AUTH_MODE; else process.env.SPECFORGE_WEB_AUTH_MODE = previousMode;
      if (previousClaims === undefined) delete process.env.SPECFORGE_WEB_PRINCIPAL_CLAIMS; else process.env.SPECFORGE_WEB_PRINCIPAL_CLAIMS = previousClaims;
    }
  });
});
