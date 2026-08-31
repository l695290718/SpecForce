import { describe, expect, it } from "vitest";
import { currentRequestPrincipal, principalFromAuthInfo, principalFromManagedAgent, withRequestPrincipal } from "./auth";

describe("MCP principal boundary", () => {
  it("normalizes static bearer claims without retaining the credential", () => {
    const principal = principalFromAuthInfo({
      clientId: "ci-client",
      tenantId: "tenant-1",
      scopes: ["asset:read"],
      extra: {
        actor: {
          actorType: "agent",
          actorId: "ci-agent",
          grants: [{ scopeId: "com.huawei.celon.desiner", action: "read" }]
        }
      }
    });

    expect(principal).toMatchObject({ subject: "ci-agent", actorId: "ci-agent", tenantId: "tenant-1", authSource: "static-bearer" });
    expect(principal).not.toHaveProperty("token");
  });

  it("fails closed for malformed claims", () => {
    expect(() => principalFromAuthInfo({ clientId: "ci-client", tenantId: "tenant-1", scopes: ["asset:read"], extra: { actor: { actorType: "agent", actorId: "ci-agent", grants: [{ scopeId: "unknown", action: "read" }] } } })).toThrow("AUTHENTICATION_REQUIRED");
  });

  it("allows seed claims only in explicit seed mode", () => {
    const previous = process.env.SPECFORGE_MCP_SEED;
    process.env.SPECFORGE_MCP_SEED = "1";
    try {
      expect(principalFromAuthInfo({ clientId: "seed", authSource: "seed", tenantId: "local-development", scopes: ["asset:read"], extra: { actor: { actorType: "agent", actorId: "seed", grants: [{ scopeId: "com.huawei.celon.desiner", action: "read" }] } } }).authSource).toBe("seed");
    } finally {
      if (previous === undefined) delete process.env.SPECFORGE_MCP_SEED;
      else process.env.SPECFORGE_MCP_SEED = previous;
    }
  });

  it("propagates the normalized principal through the request context", async () => {
    const principal = principalFromAuthInfo({
      clientId: "context-client",
      tenantId: "tenant-1",
      scopes: ["asset:read"],
      extra: { actor: { actorType: "agent", actorId: "context-agent", grants: [{ scopeId: "com.huawei.celon.desiner", action: "read" }] } }
    });
    expect(currentRequestPrincipal()).toBeUndefined();
    await withRequestPrincipal(principal, async () => {
      expect(currentRequestPrincipal()).toBe(principal);
    });
    expect(currentRequestPrincipal()).toBeUndefined();
  });

  it("keeps managed operations bound to their exact scopes", () => {
    const principal = principalFromManagedAgent({
      subjectId: "agent-1", actorType: "agent", actorId: "agent-1", ownerUserId: "user-1", credentialId: "credential-1",
      authorizationVersion: 4n, credentialVersion: 2n,
      ownerGrants: [
        { applicationServiceId: "com.huawei.celon.desiner", operation: "asset:read" },
        { applicationServiceId: "com.huawei.celon.policyhub", operation: "governance:run" }
      ],
      credentialCeiling: [
        { applicationServiceId: "com.huawei.celon.desiner", operation: "asset:read" },
        { applicationServiceId: "com.huawei.celon.policyhub", operation: "governance:run" }
      ]
    });
    expect(principal.operationGrants).toEqual([
      { scopeId: "com.huawei.celon.desiner", operation: "asset:read" },
      { scopeId: "com.huawei.celon.policyhub", operation: "governance:run" }
    ]);
    expect(principal.operationGrants).not.toContainEqual({ scopeId: "com.huawei.celon.policyhub", operation: "asset:read" });
  });
});
