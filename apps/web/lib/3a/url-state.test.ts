import { describe, expect, it } from "vitest";
import { parseThreeAUrlState, serializeThreeAUrlState } from "./url-state";

describe("3A URL state", () => {
  it("keeps locale out of shareable architecture state", () => {
    const state = parseThreeAUrlState(new URLSearchParams("scope=com.huawei.celon.desiner&locale=zh"));
    expect(state).not.toHaveProperty("locale");
    expect(state.scope).toBe("com.huawei.celon.desiner");
  });

  it("uses deterministic defaults and rejects invalid enum values", () => {
    expect(parseThreeAUrlState(new URLSearchParams("scope=demo&tab=bad&mode=bad&direction=bad"))).toEqual({ scope: "demo", tab: "architecture", mode: "lanes", direction: "both" });
  });

  it("round-trips allowed state", () => {
    const state = { scope: "demo", baseline: "b-1", projection: "p-1", focus: "a-1", tab: "alignment" as const, mode: "list" as const, direction: "upstream" as const };
    expect(parseThreeAUrlState(new URLSearchParams(serializeThreeAUrlState(state)))).toEqual(state);
  });
});
