import { describe, expect, it } from "vitest";
import { sourceRoleForConnector } from "./evidence-snapshot";

describe("knowledge evidence source mapping", () => {
  it("prefers an explicit source role over connector kind", () => {
    expect(sourceRoleForConnector("source-code", { sourceRole: "API_SCHEMA" })).toBe("API_SCHEMA");
  });

  it("maps the supported connector kinds without inventing runtime evidence", () => {
    expect(sourceRoleForConnector("source-code", {})).toBe("SOURCE_CODE");
    expect(sourceRoleForConnector("runtime-telemetry", {})).toBe("RUNTIME_TELEMETRY");
    expect(sourceRoleForConnector("unknown", {})).toBeNull();
  });
});
