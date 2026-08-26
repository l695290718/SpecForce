import { describe, expect, it } from "vitest";
import { assertExactScope, scopeWhere } from "./repository";

describe("requirement assessment repository scope boundary", () => {
  it("requires both application service and scope path", () => {
    expect(scopeWhere({ applicationServiceId: "service-a", scopePath: "product-a/service-a" })).toEqual({
      applicationServiceId: "service-a",
      scopePath: "product-a/service-a"
    });
    expect(() => assertExactScope({ applicationServiceId: "service-a", scopePath: "" })).toThrow("ASSESSMENT_SCOPE_REQUIRED");
  });

  it("does not accept a scope with only an application service id", () => {
    expect(() => scopeWhere({ applicationServiceId: "service-a", scopePath: "   " })).toThrow("ASSESSMENT_SCOPE_REQUIRED");
  });
});
