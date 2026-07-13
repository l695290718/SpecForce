import { describe, expect, it } from "vitest";
import { defaultHuaweiActor } from "@specforge/core";
import { resolveWritableScope } from "./persistence";

describe("resolveWritableScope", () => {
  it("rejects a missing architecture scope", () => {
    expect(() => resolveWritableScope(defaultHuaweiActor, undefined)).toThrow("Architecture scope is required.");
  });

  it("rejects a sibling application service without write permission", () => {
    expect(() => resolveWritableScope(defaultHuaweiActor, { applicationServiceId: "com.huawei.celon.runtime", scopePath: "client-supplied" })).toThrow("Scope write is not authorized.");
  });
});
