import { listAuditLogs } from "@specforge/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  isSeedMode: vi.fn(() => process.env.SPECFORGE_MCP_SEED === "1"),
  deletePersistedDesignData: vi.fn().mockResolvedValue({ status: "deleted" }),
  getPersistedAsset: vi.fn(),
  listPersistedAssetLinks: vi.fn().mockResolvedValue([]),
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
  generateScopedContextPack: vi.fn().mockResolvedValue({
    contextPack: { id: "ctx-shared", generatedMarkdown: "# 中文上下文" },
    canonicalSource: { generatedContextPack: { id: "ctx-shared", name: "Canonical English Context" } }
  }),
  getScopedAssetDetail: vi.fn().mockResolvedValue({ asset: { id: "shared-domain" }, canonicalSource: { id: "shared-domain" } }),
  renderScopedAssetMarkdown: vi.fn().mockResolvedValue({ content: "# 策略领域" }),
  runScopedGovernanceChecks: vi.fn().mockResolvedValue({ status: "passed", results: [] })
}));

const knowledge = vi.hoisted(() => ({
  commitKnowledgeChangeSet: vi.fn().mockResolvedValue({ id: "changeset-1", status: "COMMITTED" }),
  createIdentityCandidate: vi.fn().mockResolvedValue({ id: "identity-1", decision: "UNDECIDED" }),
  createKnowledgeAssertion: vi.fn().mockResolvedValue({ id: "assertion-1", layer: "SYS" }),
  createProjectionManifest: vi.fn().mockResolvedValue({ id: "projection-1", projectionType: "SYS_KL" }),
  createWorkingStream: vi.fn().mockResolvedValue({ id: "stream-1", status: "ACTIVE" }),
  listKnowledgeAssertions: vi.fn().mockResolvedValue([]),
  publishKnowledgeBaseline: vi.fn().mockResolvedValue({ id: "baseline-1", status: "PUBLISHED" })
}));

vi.mock("./persistence", () => persistence);
vi.mock("./scoped-derived", () => scopedDerived);
vi.mock("./knowledge/persistence", () => knowledge);

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
  vi.clearAllMocks();
  delete process.env.SPECFORGE_MCP_SEED;
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

  it("returns canonical generation provenance for markdown responses", async () => {
    const result = await captureTools().get("generate_context_pack")!.handler({
      applicationServiceId: "com.huawei.celon.desiner",
      proposalId: "shared-proposal",
      locale: "zh",
      format: "markdown"
    });
    const payload = JSON.parse(result.content[0]!.text);

    expect(payload.content).toBe("# 中文上下文");
    expect(payload.canonicalSource.generatedContextPack.name).toBe("Canonical English Context");
  });

  it("localizes detail and export responses through the same scoped boundary", async () => {
    const tools = captureTools();
    const common = { applicationServiceId: "com.huawei.celon.policyhub", locale: "zh" as const };

    await tools.get("get_asset_detail")!.handler({ ...common, assetType: "domain", assetId: "shared-domain", format: "markdown" });
    await tools.get("export_context_pack")!.handler({ ...common, contextPackId: "ctx-shared", format: "json" });

    expect(scopedDerived.renderScopedAssetMarkdown).toHaveBeenCalledWith(expect.objectContaining({ ...common, assetId: "shared-domain" }));
    expect(scopedDerived.exportScopedContextPack).toHaveBeenCalledWith(expect.objectContaining({ ...common, contextPackId: "ctx-shared" }));
  });

  it.each(["create_proposal", "update_proposal", "create_adr"])("requires applicationServiceId and architectureScope for %s", (toolName) => {
    const shape = captureTools().get(toolName)!.config.inputSchema as Record<string, unknown>;
    expect(shape.applicationServiceId).toBeDefined();
    expect(shape.architectureScope).toBeDefined();
  });

  it("routes proposal create and update through persisted bilingual upsert", async () => {
    const tools = captureTools();
    const architectureScope = {
      applicationServiceId: "com.huawei.celon.desiner",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
    };
    const proposal = { id: "proposal-bilingual", title: "Canonical English", localizedContent: { zh: { title: "中文" } } };

    await tools.get("create_proposal")!.handler({ applicationServiceId: architectureScope.applicationServiceId, architectureScope, proposal });
    await tools.get("update_proposal")!.handler({ applicationServiceId: architectureScope.applicationServiceId, architectureScope, proposal });

    expect(persistence.upsertProposal).toHaveBeenCalledTimes(2);
    expect(persistence.upsertProposal).toHaveBeenNthCalledWith(1, { proposal: { ...proposal, architectureScope } });
    expect(persistence.upsertProposal).toHaveBeenNthCalledWith(2, { proposal: { ...proposal, architectureScope } });
  });

  it("routes ADR creation through persisted bilingual design asset upsert", async () => {
    const architectureScope = {
      applicationServiceId: "com.huawei.celon.desiner",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
    };
    const adr = { id: "adr-bilingual", title: "Canonical English ADR", localizedContent: { zh: { title: "中文决策" } } };

    await captureTools().get("create_adr")!.handler({ applicationServiceId: architectureScope.applicationServiceId, architectureScope, adr });

    expect(persistence.upsertDesignAsset).toHaveBeenCalledWith({
      assetType: "adr",
      asset: { ...adr, architectureScope }
    });
  });

  it("accepts evidence through the generic design-asset write boundary", async () => {
    const architectureScope = {
      applicationServiceId: "com.huawei.celon.desiner",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
    };
    const evidence = { id: "evidence-adr-1", name: "Verification evidence" };
    const tool = captureTools().get("upsert_design_asset")!;
    const schema = tool.config.inputSchema as { assetType: { safeParse: (value: unknown) => { success: boolean } } };

    expect(schema.assetType.safeParse("evidence").success).toBe(true);

    const result = await tool.handler({
      assetType: "evidence",
      asset: evidence,
      architectureScope
    });

    expect(result.isError).not.toBe(true);
    expect(persistence.upsertDesignAsset).toHaveBeenCalledWith({
      assetType: "evidence",
      asset: { ...evidence, architectureScope },
      architectureScope
    });
  });

  it("rejects a mismatched applicationServiceId before persisted writes", async () => {
    const result = await captureTools().get("create_proposal")!.handler({
      applicationServiceId: "com.huawei.celon.policyhub",
      architectureScope: {
        applicationServiceId: "com.huawei.celon.desiner",
        scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
      },
      proposal: { id: "proposal-bilingual" }
    });

    expect(result.isError).toBe(true);
    expect(persistence.upsertProposal).not.toHaveBeenCalled();
  });
});

describe("3A knowledge foundation tools", () => {
  it("registers the scoped assertion, ChangeSet, Baseline, and projection operations", () => {
    const tools = captureTools();
    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      "create_knowledge_assertion",
      "create_identity_candidate",
      "create_working_stream",
      "commit_knowledge_changeset",
      "publish_knowledge_baseline",
      "create_projection_manifest",
      "list_knowledge_assertions"
    ]));
  });

  it("routes the knowledge operations through the MCP write boundary", async () => {
    const tools = captureTools();
    const architectureScope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
    await tools.get("create_knowledge_assertion")!.handler({ architectureScope, assertion: { id: "assertion-1" } });
    await tools.get("create_identity_candidate")!.handler({ architectureScope, candidate: { id: "identity-1" } });
    await tools.get("create_working_stream")!.handler({ architectureScope, id: "stream-1", name: "Main" });
    await tools.get("commit_knowledge_changeset")!.handler({ architectureScope, id: "changeset-1", streamId: "stream-1", assetRevisionIds: [], relationshipRevisionIds: [], evidenceRefs: [] });
    await tools.get("publish_knowledge_baseline")!.handler({ architectureScope, id: "baseline-1", streamId: "stream-1", changeSetId: "changeset-1", sourceRevisionIds: ["asset-1"], relationshipVersion: "1", reconciliationStatus: "CONVERGED" });
    await tools.get("create_projection_manifest")!.handler({ architectureScope, id: "projection-1", baselineId: "baseline-1", projectionType: "SYS_KL", projectionSchemaVersion: "1", sourceRevisionIds: ["asset-1"], relationshipVersion: "1", query: {} });
    await tools.get("list_knowledge_assertions")!.handler({ applicationServiceId: architectureScope.applicationServiceId });

    expect(knowledge.createKnowledgeAssertion).toHaveBeenCalledOnce();
    expect(knowledge.createIdentityCandidate).toHaveBeenCalledOnce();
    expect(knowledge.createWorkingStream).toHaveBeenCalledOnce();
    expect(knowledge.commitKnowledgeChangeSet).toHaveBeenCalledOnce();
    expect(knowledge.publishKnowledgeBaseline).toHaveBeenCalledOnce();
    expect(knowledge.createProjectionManifest).toHaveBeenCalledOnce();
    expect(knowledge.listKnowledgeAssertions).toHaveBeenCalledWith(architectureScope.applicationServiceId);
  });
});
