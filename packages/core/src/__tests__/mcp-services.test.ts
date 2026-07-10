import { describe, expect, it } from "vitest";
import {
  createAdr,
  createProposal,
  generateContextPack,
  getAssetDetail,
  listAuditLogs,
  linkAssets,
  recordAuditLog,
  renderAssetAsMarkdown,
  runGovernanceChecksForTarget,
  searchDesignAssets,
  updateProposal
} from "../index";

describe("MCP-facing core services", () => {
  it("searches design assets with agent-readable relevance reasons", async () => {
    const result = await searchDesignAssets({ query: "订单 部分退款", limit: 5 });

    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.some((asset) => asset.id === "proposal-partial-refund")).toBe(true);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type: expect.any(String),
        name: expect.any(String),
        summary: expect.any(String),
        relevanceReason: expect.any(String)
      })
    );
  });

  it("renders asset details as markdown for agents", async () => {
    const markdown = await renderAssetAsMarkdown("api", "api-create-refund");

    expect(markdown).toContain("#");
    expect(markdown).toContain("api-create-refund");
    expect(markdown).toContain("```json");
  });

  it("gets asset detail in markdown or json format", async () => {
    const markdown = await getAssetDetail({ assetType: "api", assetId: "api-create-refund", format: "markdown" });
    const json = await getAssetDetail({ assetType: "api", assetId: "api-create-refund", format: "json" });

    expect(markdown.format).toBe("markdown");
    if (markdown.format === "markdown") {
      expect(markdown.content).toContain("api-create-refund");
    }
    expect(json.format).toBe("json");
    if (json.format === "json") {
      expect(json.asset.id).toBe("api-create-refund");
    }
  });

  it("generates context packs with requested agent metadata and do-not rules", async () => {
    const pack = await generateContextPack("proposal-partial-refund", {
      targetAgent: "cursor",
      includeAssets: ["api-create-refund"]
    });

    expect(pack.targetAgent).toBe("cursor");
    expect(pack.generatedMarkdown).toContain("## 17. Constraints and Do-not Rules");
    expect(pack.generatedMarkdown).toContain("Do not");
    expect(pack.includedAssets.map((asset) => asset.id)).toContain("api-create-refund");
  });

  it("normalizes governance checks for MCP clients", async () => {
    const checks = await runGovernanceChecksForTarget({ targetType: "proposal", targetId: "proposal-partial-refund" });

    expect(["passed", "warning", "failed"]).toContain(checks.status);
    expect(checks.results[0]).toEqual(
      expect.objectContaining({
        ruleId: expect.any(String),
        ruleName: expect.any(String),
        severity: expect.any(String),
        message: expect.any(String),
        recommendation: expect.any(String)
      })
    );
  });

  it("creates and updates proposals through core service APIs", async () => {
    const created = await createProposal({
      title: "MCP service proposal",
      description: "Expose design operations to MCP agents.",
      goal: "Allow agents to request design context through tools.",
      impactedAssets: [{ assetType: "api", assetId: "api-create-refund" }]
    });
    const updated = await updateProposal({
      proposalId: created.id,
      patch: { status: "reviewing", risks: ["medium integration risk"] }
    });

    expect(created.id).toMatch(/^proposal-/);
    expect(updated.status).toBe("reviewing");
    expect(updated.risks).toContain("medium integration risk");
  });

  it("creates ADRs and links assets", async () => {
    const adr = await createAdr({
      title: "Use MCP as primary agent interface",
      context: "Agents need a stable design interface.",
      decision: "Expose design assets and governance through MCP.",
      relatedAssets: [{ assetType: "api", assetId: "api-create-refund" }]
    });
    const edge = await linkAssets({
      sourceType: "adr",
      sourceId: adr.id,
      targetType: "api",
      targetId: "api-create-refund",
      relationType: "documents",
      description: "ADR documents API agent workflow."
    });

    expect(adr.status).toBe("proposed");
    expect(edge.source.id).toBe(adr.id);
    expect(edge.target.id).toBe("api-create-refund");
  });

  it("records audit logs for tool invocations", () => {
    const before = listAuditLogs().length;
    const entry = recordAuditLog({
      actorType: "agent",
      actorId: "test-agent",
      channel: "mcp",
      action: "search_design_assets",
      targetType: "asset",
      targetId: "all",
      inputSummary: "query=refund",
      outputSummary: "results=3",
      status: "success"
    });

    expect(entry.id).toMatch(/^audit-/);
    expect(listAuditLogs().length).toBe(before + 1);
  });
});
