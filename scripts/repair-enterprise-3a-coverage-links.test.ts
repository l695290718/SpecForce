import { describe, expect, it, vi } from "vitest";
import { designerScope, enterprise3aCoverageRepairs, repairEnterprise3aCoverageLinks } from "./repair-enterprise-3a-coverage-links";

describe("enterprise 3A relationship repair", () => {
  it("sends the exact 11 relationship commands in the owning Scope", async () => {
    const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
    const client = {
      callTool: vi.fn(async (input: { name: string; arguments: Record<string, unknown> }) => {
        calls.push(input);
        return { content: [{ type: "text", text: JSON.stringify({ status: "created", architectureScope: designerScope }) }] };
      })
    };

    const result = await repairEnterprise3aCoverageLinks(client);

    expect(result).toEqual({ created: 11, existing: 0, blocked: [] });
    expect(calls).toHaveLength(11);
    expect(calls.every((call) => call.name === "link_assets" && call.arguments.architectureScope === designerScope)).toBe(true);
    expect(calls.map((call) => call.arguments.relationType)).toEqual([
      "DECIDES", "DECIDES", "DECIDES", "DECIDES",
      "IMPACTS", "IMPACTS", "IMPACTS", "IMPACTS", "IMPACTS", "IMPACTS", "IMPACTS"
    ]);
    expect(enterprise3aCoverageRepairs).toHaveLength(11);
  });

  it("fails closed when MCP rejects a repair", async () => {
    const client = { callTool: vi.fn(async () => ({ isError: true, content: [{ type: "text", text: "denied" }] })) };
    await expect(repairEnterprise3aCoverageLinks(client)).rejects.toThrow("RELATIONSHIP_REPAIR_BLOCKED");
  });
});
