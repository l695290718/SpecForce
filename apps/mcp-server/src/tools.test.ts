import { listAuditLogs } from "@specforge/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  isSeedMode: vi.fn(() => process.env.SPECFORGE_MCP_SEED === "1"),
  deletePersistedDesignData: vi.fn().mockResolvedValue({ status: "deleted" }),
  getPersistedAsset: vi.fn(),
  listPersistedContextPacks: vi.fn().mockResolvedValue([]),
  renderPersistedAssetAsMarkdown: vi.fn(),
  searchPersistedDesignAssets: vi.fn(),
  upsertAssetLink: vi.fn(),
  upsertContextPack: vi.fn(),
  upsertDesignAsset: vi.fn(),
  upsertProposal: vi.fn()
}));

const scopedDerived = vi.hoisted(() => ({
  analyzeScopedProposalImpact: vi.fn().mockResolvedValue({ analysis: { proposalId: "shared-proposal" } }),
  buildScopedAssetGraph: vi.fn().mockResolvedValue({ graph: { nodes: [], edges: [] } }),
  exportScopedContextPack: vi.fn().mockResolvedValue({ contextPack: { id: "ctx-shared" } }),
  generateScopedContextPack: vi.fn().mockResolvedValue({ contextPack: { id: "ctx-shared", generatedMarkdown: "# 中文上下文" } }),
  getScopedAssetDetail: vi.fn().mockResolvedValue({ asset: { id: "shared-domain" }, canonicalSource: { id: "shared-domain" } }),
  renderScopedAssetMarkdown: vi.fn().mockResolvedValue({ content: "# 策略领域" }),
  runScopedGovernanceChecks: vi.fn().mockResolvedValue({ status: "passed", results: [] })
}));

vi.mock("./persistence", () => persistence);
vi.mock("./scoped-derived", () => scopedDerived);

import { registerTools } from "./tools";

type RegisteredTool = {
  config: Record<string, unknown>;
  handler: (input: unknown) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
};

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: Record<string, unknown>, handler: RegisteredTool["handler"]) {
      tools.set(name, { config, handler });
    }
  } as unknown as McpServer;
  registerTools(server);
  return tools;
}

beforeEach(() => {
  delete process.env.SPECFORGE_MCP_SEED;
  persistence.deletePersistedDesignData.mockClear();
});

afterEach(() => {
  delete process.env.SPECFORGE_MCP_SEED;
});

describe("seed cleanup MCP boundary", () => {
  it("does not register the destructive cleanup tool for normal MCP servers", () => {
    expect(captureTools().has("delete_seed_design_data")).toBe(false);
  });

  it("rejects a captured cleanup handler when seed mode is no longer active", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const cleanup = captureTools().get("delete_seed_design_data");
    expect(cleanup).toBeDefined();
    delete process.env.SPECFORGE_MCP_SEED;

    const result = await cleanup!.handler({
      architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" },
      assetIds: ["legacy"]
    });

    expect(result.isError).toBe(true);
    expect(persistence.deletePersistedDesignData).not.toHaveBeenCalled();
  });

  it("audits successful seed cleanup as the dedicated seed system actor", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const cleanup = captureTools().get("delete_seed_design_data");
    const before = listAuditLogs().length;

    const result = await cleanup!.handler({
      architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" },
      assetIds: ["legacy"]
    });

    expect(result.isError).not.toBe(true);
    expect(persistence.deletePersistedDesignData).toHaveBeenCalledOnce();
    expect(listAuditLogs().slice(before)).toContainEqual(expect.objectContaining({
      actorType: "system",
      actorId: "specforge-seed",
      action: "delete_seed_design_data",
      status: "success"
    }));
  });
});

describe("scoped localized derived tools", () => {
  it.each([
    "get_asset_graph",
    "analyze_proposal_impact",
    "generate_context_pack",
    "run_governance_checks",
    "export_context_pack"
  ])("requires applicationServiceId and exposes locale for %s", (toolName) => {
    const tool = captureTools().get(toolName);
    expect(tool).toBeDefined();
    const shape = tool!.config.inputSchema as Record<string, unknown>;
    expect(shape.applicationServiceId).toBeDefined();
    expect(shape.locale).toBeDefined();
  });

  it("routes graph, impact, governance, and generation through scoped services", async () => {
    const tools = captureTools();
    const common = { applicationServiceId: "com.huawei.celon.policyhub", locale: "zh" as const };

    await tools.get("get_asset_graph")!.handler(common);
    await tools.get("analyze_proposal_impact")!.handler({ ...common, proposalId: "shared-proposal" });
    await tools.get("run_governance_checks")!.handler({ ...common, targetType: "proposal", targetId: "shared-proposal" });
    await tools.get("generate_context_pack")!.handler({ ...common, proposalId: "shared-proposal", format: "json" });

    expect(scopedDerived.buildScopedAssetGraph).toHaveBeenCalledWith(common);
    expect(scopedDerived.analyzeScopedProposalImpact).toHaveBeenCalledWith({ ...common, proposalId: "shared-proposal" });
    expect(scopedDerived.runScopedGovernanceChecks).toHaveBeenCalledWith({ ...common, targetType: "proposal", targetId: "shared-proposal" });
    expect(scopedDerived.generateScopedContextPack).toHaveBeenCalledWith(expect.objectContaining({ ...common, proposalId: "shared-proposal" }));
    expect(persistence.listPersistedContextPacks).not.toHaveBeenCalled();
  });

  it("localizes detail and export responses through the same scoped boundary", async () => {
    const tools = captureTools();
    const common = { applicationServiceId: "com.huawei.celon.policyhub", locale: "zh" as const };

    await tools.get("get_asset_detail")!.handler({ ...common, assetType: "domain", assetId: "shared-domain", format: "markdown" });
    await tools.get("export_context_pack")!.handler({ ...common, contextPackId: "ctx-shared", format: "json" });

    expect(scopedDerived.renderScopedAssetMarkdown).toHaveBeenCalledWith(expect.objectContaining({ ...common, assetId: "shared-domain" }));
    expect(scopedDerived.exportScopedContextPack).toHaveBeenCalledWith(expect.objectContaining({ ...common, contextPackId: "ctx-shared" }));
  });
});
