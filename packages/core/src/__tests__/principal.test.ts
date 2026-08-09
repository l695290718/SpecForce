import { describe, expect, it } from "vitest";
import { authorizePrincipalScope, normalizePrincipalClaims, scopeById, type PrincipalClaims } from "../index";

const designerScope = scopeById("com.huawei.celon.desiner")!;
const runtimeScope = scopeById("com.huawei.celon.runtime")!;

function claims(overrides: Partial<PrincipalClaims> = {}): PrincipalClaims {
  return {
    actorType: "agent",
    subject: "agent-1",
    tenantId: "tenant-1",
    authSource: "oidc",
    grants: [{ scopeId: designerScope.id, action: "read" }],
    permissions: ["asset:read"],
    ...overrides
  };
}

describe("ScopedPrincipal normalization", () => {
  it("normalizes identity metadata and removes duplicate grants", () => {
    const principal = normalizePrincipalClaims(claims({
      grants: [
        { scopeId: designerScope.id, action: "read" },
        { scopeId: designerScope.id, action: "read" }
      ]
    }));

    expect(principal).toMatchObject({
      actorType: "agent",
      actorId: "agent-1",
      subject: "agent-1",
      tenantId: "tenant-1",
      authSource: "oidc"
    });
    expect(principal.grants).toEqual([{ scopeId: designerScope.id, action: "read" }]);
    expect(principal.decisionRef).toMatch(/^principal:/);
  });

  it("rejects missing identity and invalid grants", () => {
    expect(() => normalizePrincipalClaims(claims({ subject: "" }))).toThrow("AUTHENTICATION_REQUIRED");
    expect(() => normalizePrincipalClaims(claims({ tenantId: undefined }))).toThrow("AUTHENTICATION_REQUIRED");
    expect(() => normalizePrincipalClaims(claims({ grants: [{ scopeId: designerScope.id, action: "admin" }] }))).toThrow("AUTHENTICATION_REQUIRED");
  });

  it("rejects seed identity unless explicitly enabled", () => {
    expect(() => normalizePrincipalClaims(claims({ authSource: "seed" }))).toThrow("SEED_IDENTITY_NOT_ALLOWED");
    expect(normalizePrincipalClaims(claims({ authSource: "seed" }), { allowSeed: true }).authSource).toBe("seed");
  });
});

describe("ScopedPrincipal exact application-service authorization", () => {
  it("accepts the exact granted Scope and action", () => {
    const principal = normalizePrincipalClaims(claims({ grants: [{ scopeId: designerScope.id, action: "write" }] }));
    expect(authorizePrincipalScope(principal, { applicationServiceId: designerScope.id, scopePath: designerScope.scopePath }, "write")).toEqual({
      applicationServiceId: designerScope.id,
      scopePath: designerScope.scopePath
    });
  });

  it("denies parent and sibling grants for an application-service operation", () => {
    const principal = normalizePrincipalClaims(claims({ grants: [{ scopeId: "module-celon-designer", action: "read" }] }));
    expect(() => authorizePrincipalScope(principal, { applicationServiceId: designerScope.id, scopePath: designerScope.scopePath }, "read")).toThrow("SCOPE_ACCESS_DENIED");

    const sibling = normalizePrincipalClaims(claims({ grants: [{ scopeId: runtimeScope.id, action: "read" }] }));
    expect(() => authorizePrincipalScope(sibling, { applicationServiceId: designerScope.id, scopePath: designerScope.scopePath }, "read")).toThrow("SCOPE_ACCESS_DENIED");
  });

  it("keeps read and write actions distinct", () => {
    const principal = normalizePrincipalClaims(claims());
    expect(() => authorizePrincipalScope(principal, { applicationServiceId: designerScope.id, scopePath: designerScope.scopePath }, "write")).toThrow("SCOPE_ACCESS_DENIED");
  });
});
