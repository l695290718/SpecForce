import { describe, expect, it } from "vitest";
import type { ArchitectureScopeRegistry } from "@specforge/core";
import { evaluateExactOperation } from "./policy";

const registry = {
  scopes: [
    { id: "service-a", code: "a", name: "A", description: "", owner: "", level: "applicationService", scopePath: "/a" },
    { id: "service-b", code: "b", name: "B", description: "", owner: "", level: "applicationService", scopePath: "/b" }
  ]
} satisfies ArchitectureScopeRegistry;

describe("evaluateExactOperation", () => {
  it("does not cross-product operations across scopes", () => {
    expect(evaluateExactOperation({
      requested: { applicationServiceId: "service-b", scopePath: "/b", operation: "governance:run" },
      ownerGrants: [
        { applicationServiceId: "service-a", operation: "governance:run" },
        { applicationServiceId: "service-b", operation: "asset:write" }
      ],
      credentialCeiling: [{ applicationServiceId: "service-a", operation: "governance:run" }],
      registry
    })).toEqual({ allowed: false, code: "OPERATION_DENIED" });
  });

  it("requires a matching application-service scope path", () => {
    expect(evaluateExactOperation({
      requested: { applicationServiceId: "service-a", scopePath: "/unexpected", operation: "asset:read" },
      ownerGrants: [{ applicationServiceId: "service-a", operation: "asset:read" }],
      registry
    })).toEqual({ allowed: false, code: "SCOPE_ACCESS_DENIED" });
  });
});
