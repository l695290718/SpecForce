import { describe, expect, it, vi } from "vitest";
import { cleanupRunFixtures, fixtureIds, validateHistoricalFixture } from "./cleanup-graph-verification-fixtures";

const scope = { applicationServiceId: "com.huawei.celon.desiner.graph-verification", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification" };

describe("graph verification fixture cleanup", () => {
  it("derives exactly three bounded IDs", () => { expect(fixtureIds("run-1")).toEqual(["specforge-graph-verification-run-1-a", "specforge-graph-verification-run-1-b", "specforge-graph-verification-run-1-c"]); });
  it("sends exactly three run IDs to the seed-only delete tool", async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const client = { callTool: vi.fn(async (input: { name: string; arguments: Record<string, unknown> }) => { calls.push(input); return { content: [{ text: input.name === "list_asset_links" ? "[]" : JSON.stringify({ status: input.name === "delete_seed_design_data" ? "deleted" : "archived", archivedCount: input.name === "archive_seed_graph_outbox" ? 2 : undefined }) }] }; }) };
    const result = await cleanupRunFixtures(client, { ...scope, liveRunId: "run-1" });
    expect(calls.map((call) => call.name)).toEqual(["archive_seed_graph_outbox", "delete_seed_design_data", "archive_seed_graph_outbox", "list_asset_links"]);
    expect(calls[1]?.arguments.assetIds).toEqual(fixtureIds("run-1"));
    expect(calls[1]?.arguments.architectureScope).toEqual(scope);
    expect(result.archivedOutboxCount).toBe(4);
  });
  it("rejects a historical fingerprint mismatch", () => { expect(() => validateHistoricalFixture({ id: "specforge-graph-verification-a", type: "api", path: "/wrong", domainId: "domain-graph-verification", description: "Ephemeral exact-Scope API fixture" }, [])).toThrow("GRAPH_FIXTURE_FINGERPRINT_MISMATCH"); });
});
