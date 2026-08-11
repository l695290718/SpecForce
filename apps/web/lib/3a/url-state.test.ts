import { describe, expect, it } from "vitest";
import { parseThreeAUrlState, serializeThreeAUrlState } from "./url-state";

describe("3A URL state", () => {
  it("keeps locale out of shareable architecture state", () => {
    const state = parseThreeAUrlState(new URLSearchParams("scope=com.huawei.celon.desiner&locale=zh"));
    expect(state).not.toHaveProperty("locale");
    expect(state.scope).toBe("com.huawei.celon.desiner");
  });

  it("uses deterministic defaults and rejects invalid enum values", () => {
    expect(parseThreeAUrlState(new URLSearchParams("scope=demo&tab=bad&mode=bad&direction=bad&graphView=bad&graphLayout=bad"))).toEqual({ scope: "demo", tab: "architecture", mode: "lanes", direction: "both", graphView: "overview", graphLayout: "force", layers: [], relationTypes: [] });
  });

  it("round-trips allowed state", () => {
    const state = { scope: "demo", baseline: "b-1", projection: "p-1", focus: "a-1", tab: "alignment" as const, mode: "list" as const, direction: "upstream" as const, graphView: "overview" as const, graphLayout: "tree" as const, layers: [], relationTypes: [] };
    expect(parseThreeAUrlState(new URLSearchParams(serializeThreeAUrlState(state)))).toEqual(state);
  });

  it("round-trips graph mode without changing legacy list state", () => {
    const state = { scope: "demo", baseline: "b-1", projection: "p-1", focus: "a-1", tab: "architecture" as const, mode: "graph" as const, direction: "downstream" as const, graphView: "explore" as const, graphLayout: "circles" as const, layers: ["SYS"] as Array<"BIZ" | "SYS" | "TECH">, relationTypes: ["CALLS"] };
    expect(parseThreeAUrlState(new URLSearchParams(serializeThreeAUrlState(state)))).toEqual(state);
  });

  it("keeps graph layout independent from graph query view", () => {
    const state = parseThreeAUrlState(new URLSearchParams("scope=demo&graphView=impact&graphLayout=tree"));
    expect(state.graphView).toBe("impact");
    expect(state.graphLayout).toBe("tree");
    expect(new URLSearchParams(serializeThreeAUrlState(state)).get("graphLayout")).toBe("tree");
  });
});
