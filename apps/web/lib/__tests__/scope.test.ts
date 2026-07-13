import { describe, expect, it } from "vitest";
import { listReadableApplicationServices, requireReadableApplicationService, scopeDatabaseWhere } from "../scope";

describe("application-service scope context", () => {
  it("rejects missing, unknown, and non-service scopes", () => {
    expect(() => requireReadableApplicationService("")).toThrow("Application-service scope is required");
    expect(() => requireReadableApplicationService("missing-service")).toThrow("Application-service scope is required");
    expect(() => requireReadableApplicationService("module-celon-designer")).toThrow("Scope must be an application service");
  });

  it("resolves a readable service and produces a database filter", () => {
    const scope = requireReadableApplicationService("com.huawei.celon.policyhub");

    expect(scope.id).toBe("com.huawei.celon.policyhub");
    expect(scopeDatabaseWhere(scope)).toEqual({
      applicationServiceId: "com.huawei.celon.policyhub",
      scopePath: scope.scopePath
    });
  });

  it("offers only application services in the scope switcher", () => {
    const scopes = listReadableApplicationServices();

    expect(scopes.length).toBeGreaterThan(1);
    expect(scopes.every((scope) => scope.level === "applicationService")).toBe(true);
    expect(scopes.some((scope) => scope.id === "module-celon-designer")).toBe(false);
  });
});
