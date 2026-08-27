import { listAuditLogs } from "@specforge/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  isSeedMode: vi.fn(() => process.env.SPECFORGE_MCP_SEED === "1"),
  ensureMcpPersistenceSchema: vi.fn().mockResolvedValue(undefined),
  readableScope: vi.fn((applicationServiceId: string) => ({ applicationServiceId, scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" })),
  prisma: {
    projectionManifest: {
      findFirst: vi.fn().mockResolvedValue({ id: "manifest-1", baselineId: "baseline-1", generationId: "generation-1", publishedAt: new Date() })
    },
    architectureUnitProjection: {
      count: vi.fn().mockResolvedValue(1),
      findFirst: vi.fn().mockResolvedValue({
        applicationServiceId: "com.huawei.celon.desiner",
        scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
        generationId: "generation-1",
        baselineId: "baseline-1",
        projectionManifestId: "manifest-1",
        unitIdentity: "unit:biz:policy",
        layer: "BIZ",
        kind: "CAPABILITY",
        canonicalName: "Policy",
        aliases: [],
        memberCount: 1,
        criticality: 0.8,
        completeness: 1,
        evidenceCount: 1,
        unclassifiedMemberCount: 0,
        contentDigest: "unit-digest"
      }),
      findMany: vi.fn().mockResolvedValue([{
        applicationServiceId: "com.huawei.celon.desiner",
        scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
        generationId: "generation-1",
        baselineId: "baseline-1",
        projectionManifestId: "manifest-1",
        unitIdentity: "unit:biz:policy",
        layer: "BIZ",
        kind: "CAPABILITY",
        canonicalName: "Policy",
        aliases: [],
        memberCount: 1,
        criticality: 0.8,
        completeness: 1,
        evidenceCount: 1,
        unclassifiedMemberCount: 0,
        contentDigest: "unit-digest"
      }])
    },
    architectureUnitMappingProjection: {
      findMany: vi.fn().mockResolvedValue([])
    },
    architectureUnitMemberProjection: {
      findMany: vi.fn().mockResolvedValue([])
    },
    architectureAssetCoverageProjection: {
      findMany: vi.fn().mockResolvedValue([])
    },
    architectureCoverageManifest: {
      findFirst: vi.fn().mockResolvedValue({ generationId: "coverage-generation-1", id: "coverage-manifest-1" })
    },
    knowledgeProjectionEdge: {
      findMany: vi.fn().mockResolvedValue([])
    }
  },
  archiveSeedGraphOutbox: vi.fn().mockResolvedValue({ status: "archived", archivedCount: 0 }),
  deletePersistedDesignData: vi.fn().mockResolvedValue({ status: "deleted" }),
  getPersistedAsset: vi.fn(),
  listPersistedAssetLinks: vi.fn().mockResolvedValue([]),
  listPersistedContextPacks: vi.fn().mockResolvedValue([]),
  queryPersistedAssetLinks: vi.fn().mockResolvedValue({
    applicationServiceId: "com.huawei.celon.desiner",
    scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner",
    links: [],
    hasMore: false,
    truncated: false
  }),
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
  createKnowledgeReviewBundle: vi.fn().mockResolvedValue({ id: "review-1", status: "READY" }),
  createProjectionManifest: vi.fn().mockResolvedValue({ id: "projection-1", projectionType: "SYS_KL" }),
  createWorkingStream: vi.fn().mockResolvedValue({ id: "stream-1", status: "ACTIVE" }),
  decideKnowledgeReviewBundle: vi.fn().mockResolvedValue({ id: "decision-1", decision: "APPROVE" }),
  listKnowledgeAssertions: vi.fn().mockResolvedValue([]),
  publishKnowledgeBaseline: vi.fn().mockResolvedValue({ id: "baseline-1", status: "PUBLISHED" })
}));

const scanner = vi.hoisted(() => ({
  submitScanReport: vi.fn().mockResolvedValue({ id: "scan-1", status: "RECEIVED" }),
  generateKnowledgeCandidates: vi.fn().mockResolvedValue({ scanReportId: "scan-1", reviewBundle: { id: "review-1", status: "READY" } }),
  matchKnowledgeIdentities: vi.fn().mockResolvedValue({ scanReportId: "scan-1", identityCandidateIds: ["identity-1"], reviewBundle: { id: "review-1", status: "READY" } })
}));

const semanticCandidates = vi.hoisted(() => ({
  submitSemanticCandidateBatch: vi.fn().mockResolvedValue({ sessionId: "scan-session-1", acceptedSequence: 0, acceptedBatchDigest: "digest", assertionIds: ["assertion-1"], idempotent: false, complete: true }),
  assembleKnowledgeReviewBundle: vi.fn().mockResolvedValue({ id: "review-1", status: "READY", riskTier: "T1" })
}));

const promotion = vi.hoisted(() => ({
  promoteKnowledgeCandidates: vi.fn().mockResolvedValue({ id: "promotion-1", changeSetId: "changeset-1", idempotent: false }),
  reconcileKnowledgeBaseline: vi.fn().mockResolvedValue({ id: "reconciliation-1", status: "CONVERGED" })
}));

const knowledgeProjection = vi.hoisted(() => ({
  deriveScopedKnowledgeProjection: vi.fn().mockResolvedValue({ baselineId: "baseline-1", digest: "projection-digest" })
}));

const governedScanner = vi.hoisted(() => ({
  getScannerRelease: vi.fn().mockResolvedValue({ releaseId: "scanner-release-2.0.0" }),
  startKnowledgeScan: vi.fn().mockResolvedValue({ sessionId: "knowledge-scan-1" }),
  getScanCheckpoint: vi.fn().mockResolvedValue({ acceptedSequence: -1 }),
  submitScanBatch: vi.fn().mockResolvedValue({ acceptedSequence: 0, idempotent: false }),
  finalizeKnowledgeScan: vi.fn().mockResolvedValue({ status: "READY_FOR_ANALYSIS" })
}));

vi.mock("./persistence", () => persistence);
vi.mock("./scoped-derived", () => scopedDerived);
vi.mock("./knowledge/persistence", () => knowledge);
vi.mock("./scanner/persistence", () => scanner);
vi.mock("./knowledge/semantic-persistence", () => ({ generateKnowledgeCandidates: scanner.generateKnowledgeCandidates }));
vi.mock("./knowledge/identity-persistence", () => ({ matchKnowledgeIdentities: scanner.matchKnowledgeIdentities }));
vi.mock("./knowledge/candidate-persistence", () => semanticCandidates);
vi.mock("./knowledge/promotion", () => promotion);
vi.mock("./knowledge/projection", () => knowledgeProjection);
vi.mock("./scanner/release", () => ({ getScannerRelease: governedScanner.getScannerRelease }));
vi.mock("./scanner/session", () => ({
  startKnowledgeScan: governedScanner.startKnowledgeScan,
  getScanCheckpoint: governedScanner.getScanCheckpoint,
  finalizeKnowledgeScan: governedScanner.finalizeKnowledgeScan
}));
vi.mock("./scanner/batch-persistence", () => ({ submitScanBatch: governedScanner.submitScanBatch }));

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
    expect(captureTools().has("archive_seed_graph_outbox")).toBe(false);
  });

  it("registers archival only in seed mode and keeps the exact Scope in the MCP call", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const archive = captureTools().get("archive_seed_graph_outbox");
    expect(archive).toBeDefined();

    const architectureScope = { applicationServiceId: "com.huawei.celon.desiner.graph-verification", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner.graph-verification" };
    const result = await archive!.handler({ architectureScope });

    expect(result.isError).not.toBe(true);
    expect(persistence.archiveSeedGraphOutbox).toHaveBeenCalledWith({ architectureScope });
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

describe("deterministic 3A projection tool", () => {
  it("registers as exact-Scope read-only derivation", async () => {
    const tool = captureTools().get("derive_3a_knowledge_projection");
    expect(tool).toBeDefined();
    expect((tool!.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);

    const input = {
      architectureScope: {
        applicationServiceId: "com.huawei.celon.desiner",
        scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
      },
      baselineId: "baseline-1"
    };
    const result = await tool!.handler(input);

    expect(result.isError).not.toBe(true);
    expect(knowledgeProjection.deriveScopedKnowledgeProjection).toHaveBeenCalledWith(input);
  });
});

describe("versioned 3A navigation MCP boundary", () => {
  it("registers the build as write and every navigation operation as read-only", () => {
    const tools = captureTools();
    const writeTool = tools.get("request_3a_projection_build")!;
    expect(writeTool).toBeDefined();
    expect((writeTool.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(false);
    expect((writeTool.config._meta as { permissions: string[] }).permissions).toContain("knowledge:write");

    for (const name of [
      "get_3a_projection_build",
      "list_3a_published_baselines",
      "list_3a_projection_manifests",
      "search_3a_architecture_facts",
      "search_3a_architecture_map",
      "search_3a_asset_mappings",
      "get_3a_asset_mapping",
      "search_3a_architecture_realizations",
      "get_3a_architecture_unit_neighborhood",
      "trace_3a_architecture_path",
      "get_3a_architecture_fact",
      "get_3a_alignment",
      "compare_3a_published_baselines"
    ]) {
      const tool = tools.get(name);
      expect(tool, `${name} should be registered`).toBeDefined();
      expect((tool!.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
      expect((tool!.config._meta as { permissions: string[] }).permissions).toContain("knowledge:read");
    }
  });

  it("registers the architecture map as an exact-Scope read-only operation", async () => {
    const tools = captureTools();
    const tool = tools.get("search_3a_architecture_map")!;
    expect(tool).toBeDefined();
    expect((tool.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
    expect((tool.config._meta as { permissions: string[] }).permissions).toEqual(["knowledge:read"]);
    const architectureScope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
    const input = { architectureScope, baselineId: "baseline-1", projectionManifestId: "manifest-1", filters: { layers: ["BIZ"] }, budget: { maxUnitsPerLayer: 3 } };
    const result = await tool.handler(input);
    expect(result.isError).not.toBe(true);
    expect(persistence.readableScope).toHaveBeenCalledWith(architectureScope.applicationServiceId);
    expect(persistence.prisma.projectionManifest.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        applicationServiceId: architectureScope.applicationServiceId,
        scopePath: architectureScope.scopePath,
        id: input.projectionManifestId,
        baselineId: input.baselineId,
        publishedAt: { not: null }
      })
    }));
    const unitQueries = persistence.prisma.architectureUnitProjection.findMany.mock.calls;
    expect(unitQueries.length).toBeGreaterThan(0);
    expect(unitQueries[0]![0].where).toEqual(expect.objectContaining({
      applicationServiceId: architectureScope.applicationServiceId,
      scopePath: architectureScope.scopePath,
      generationId: "generation-1",
      baselineId: input.baselineId,
      projectionManifestId: input.projectionManifestId,
      layer: "BIZ"
    }));
    expect(persistence.prisma.architectureUnitMappingProjection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        applicationServiceId: architectureScope.applicationServiceId,
        scopePath: architectureScope.scopePath,
        generationId: "generation-1",
        baselineId: input.baselineId,
        projectionManifestId: input.projectionManifestId
      })
    }));
  });

  it("registers asset-to-3A mapping separately from architecture realizations", async () => {
    const tools = captureTools();
    const assetTool = tools.get("search_3a_asset_mappings")!;
    const realizationTool = tools.get("search_3a_architecture_realizations")!;
    expect(assetTool).toBeDefined();
    expect(realizationTool).toBeDefined();
    expect((assetTool.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
    expect(assetTool.config.description).toContain("design assets to governed");
    expect(realizationTool.config.description).toContain("unit-to-unit");
    const result = await assetTool.handler({
      architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" },
      baselineId: "baseline-1",
      projectionManifestId: "manifest-1",
      limit: 10
    });
    expect(result.isError).not.toBe(true);
    expect(persistence.prisma.architectureCoverageManifest.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ baselineId: "baseline-1", publicationState: "PUBLISHED" }) }));
    expect(persistence.prisma.architectureAssetCoverageProjection.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ generationId: "coverage-generation-1", baselineId: "baseline-1" }) }));
  });

  it("registers exact asset mapping detail as a read-only operation", () => {
    const tool = captureTools().get("get_3a_asset_mapping")!;
    expect(tool).toBeDefined();
    expect((tool.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
    expect((tool.config._meta as { permissions: string[] }).permissions).toEqual(["knowledge:read"]);
    expect(tool.config.description).toContain("design-asset-to-3A mapping");
  });

  it("marks the current-set drift API as legacy compatibility", () => {
    const tool = captureTools().get("derive_3a_knowledge_projection")!;
    expect(tool.config.description).toContain("Legacy compatibility read");
  });

  it("registers and calls the architecture unit neighborhood as exact-Scope read-only", async () => {
    const tools = captureTools();
    const tool = tools.get("get_3a_architecture_unit_neighborhood")!;
    expect(tool).toBeDefined();
    expect((tool.config.annotations as { readOnlyHint?: boolean }).readOnlyHint).toBe(true);
    expect((tool.config._meta as { permissions: string[] }).permissions).toEqual(["knowledge:read"]);
    const input = {
      identity: {
        architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" },
        generationId: "generation-1",
        baselineId: "baseline-1",
        projectionManifestId: "manifest-1"
      },
      unitIdentity: "unit:biz:policy",
      direction: "both",
      depth: 2,
      budget: { maxMappings: 5 }
    };
    persistence.prisma.architectureUnitMemberProjection.findMany.mockResolvedValueOnce([{
      applicationServiceId: input.identity.architectureScope.applicationServiceId,
      scopePath: input.identity.architectureScope.scopePath,
      generationId: input.identity.generationId,
      baselineId: input.identity.baselineId,
      projectionManifestId: input.identity.projectionManifestId,
      unitIdentity: input.unitIdentity,
      assertionId: "assertion-1",
      semanticIdentity: "asset:policy",
      contentDigest: "member-digest"
    }]);
    const result = await tool.handler(input);
    expect(result.isError).not.toBe(true);
    expect(persistence.prisma.architectureUnitProjection.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({
      applicationServiceId: input.identity.architectureScope.applicationServiceId,
      scopePath: input.identity.architectureScope.scopePath,
      generationId: input.identity.generationId,
      baselineId: input.identity.baselineId,
      projectionManifestId: input.identity.projectionManifestId,
      unitIdentity: input.unitIdentity
    }) });
    expect(persistence.prisma.architectureUnitMemberProjection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        applicationServiceId: input.identity.architectureScope.applicationServiceId,
        scopePath: input.identity.architectureScope.scopePath,
        generationId: input.identity.generationId,
        baselineId: input.identity.baselineId,
        projectionManifestId: input.identity.projectionManifestId,
        unitIdentity: input.unitIdentity
      })
    }));
    const manifestCall = persistence.prisma.projectionManifest.findFirst.mock.calls[0];
    expect(manifestCall).toBeDefined();
    const manifestWhere = manifestCall![0].where;
    expect(manifestWhere).toEqual(expect.objectContaining({
      applicationServiceId: input.identity.architectureScope.applicationServiceId,
      scopePath: input.identity.architectureScope.scopePath,
      generationId: input.identity.generationId,
      baselineId: input.identity.baselineId,
      id: input.identity.projectionManifestId,
      publishedAt: { not: null }
    }));
    expect(manifestWhere).not.toHaveProperty("projectionManifestId");

    const edgeCall = persistence.prisma.knowledgeProjectionEdge.findMany.mock.calls[0];
    expect(edgeCall).toBeDefined();
    const edgeWhere = edgeCall![0].where;
    expect(edgeWhere).toEqual(expect.objectContaining({
      applicationServiceId: input.identity.architectureScope.applicationServiceId,
      scopePath: input.identity.architectureScope.scopePath,
      generationId: input.identity.generationId,
      baselineId: input.identity.baselineId,
      OR: expect.any(Array)
    }));
    expect(edgeWhere).not.toHaveProperty("projectionManifestId");
  });

  it("rejects a neighborhood Scope mismatch before reading the manifest", async () => {
    persistence.readableScope.mockImplementationOnce(() => ({ applicationServiceId: "com.huawei.celon.desiner", scopePath: "a-different-scope" }));
    const result = await captureTools().get("get_3a_architecture_unit_neighborhood")!.handler({
      identity: {
        architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" },
        generationId: "generation-1",
        baselineId: "baseline-1",
        projectionManifestId: "manifest-1"
      },
      unitIdentity: "unit:biz:policy",
      direction: "both",
      depth: 1
    });
    expect(result.isError).toBe(true);
    expect(persistence.prisma.projectionManifest.findFirst).not.toHaveBeenCalled();
  });
});

describe("3A knowledge foundation tools", () => {
  it("registers the scoped assertion, ChangeSet, Baseline, and projection operations", () => {
    const tools = captureTools();
    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      "create_knowledge_assertion",
      "submit_scan_report",
      "generate_knowledge_candidates",
      "submit_semantic_candidate_batch",
      "assemble_knowledge_review_bundle",
      "match_knowledge_identities",
      "create_identity_candidate",
      "create_knowledge_review_bundle",
      "decide_knowledge_review_bundle",
      "promote_knowledge_candidates",
      "reconcile_knowledge_baseline",
      "create_working_stream",
      "commit_knowledge_changeset",
      "publish_knowledge_baseline",
      "create_projection_manifest",
      "list_knowledge_assertions"
    ]));
    expect((tools.get("reconcile_knowledge_baseline")!.config._meta as { permissions: string[]; write: boolean })).toEqual({ permissions: ["knowledge:write", "governance:run"], write: true });
    expect(tools.get("reconcile_knowledge_baseline")!.config.annotations).toMatchObject({ readOnlyHint: false, idempotentHint: false });
  });

  it("registers the governed release, session, checkpoint, batch, and finalization tools", () => {
    const tools = captureTools();
    expect([...tools.keys()]).toEqual(expect.arrayContaining([
      "get_scanner_release",
      "start_knowledge_scan",
      "get_scan_checkpoint",
      "submit_scan_batch",
      "finalize_knowledge_scan"
    ]));
    expect((tools.get("start_knowledge_scan")!.config._meta as { permissions: string[] }).permissions).toEqual(["knowledge:write", "asset:read"]);
    expect((tools.get("submit_scan_batch")!.config._meta as { permissions: string[] }).permissions).toEqual(["knowledge:write"]);
  });

  it("forwards client Scope only as a governed-session equality assertion", async () => {
    const architectureScope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
    const tools = captureTools();
    await tools.get("get_scanner_release")!.handler({ architectureScope, sessionId: "knowledge-scan-1" });
    await tools.get("get_scan_checkpoint")!.handler({ architectureScope, sessionId: "knowledge-scan-1" });
    await tools.get("submit_scan_batch")!.handler({ architectureScope, batch: { sessionId: "knowledge-scan-1" } });
    await tools.get("finalize_knowledge_scan")!.handler({ architectureScope, sessionId: "knowledge-scan-1", finalization: { acceptedSequence: 0 } });

    expect(governedScanner.getScannerRelease).toHaveBeenCalledWith({ architectureScope, sessionId: "knowledge-scan-1" });
    expect(governedScanner.getScanCheckpoint).toHaveBeenCalledWith({ architectureScope, sessionId: "knowledge-scan-1" });
    expect(governedScanner.submitScanBatch).toHaveBeenCalledWith({ architectureScope, batch: { sessionId: "knowledge-scan-1" } });
    expect(governedScanner.finalizeKnowledgeScan).toHaveBeenCalledWith({ architectureScope, sessionId: "knowledge-scan-1", finalization: { acceptedSequence: 0 } });
  });

  it("routes the knowledge operations through the MCP write boundary", async () => {
    const tools = captureTools();
    const architectureScope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
    await tools.get("create_knowledge_assertion")!.handler({ architectureScope, assertion: { id: "assertion-1" } });
    await tools.get("submit_scan_report")!.handler({ architectureScope, id: "scan-1", connectorId: "scanner-1", designChangeSessionId: "session-1", report: { reportDigest: "digest" } });
    await tools.get("generate_knowledge_candidates")!.handler({ architectureScope, scanReportId: "scan-1", provider: "mock" });
    await tools.get("submit_semantic_candidate_batch")!.handler({ architectureScope, batch: { sessionId: "scan-session-1", sequence: 0, complete: true, provenance: { agent: "claude-code" }, candidates: [{ semanticIdentity: "orders.api", normalizedDigest: "digest", factType: "api-contract", layer: "SYS", aspect: "contract", value: {}, confidence: 0.9, matchingEvidence: [], counterEvidence: [], unresolvedQuestions: [], evidenceRefs: ["evidence-1"], sourceObservationIds: ["source-1"], domainCluster: "orders", identityDecision: "UNAMBIGUOUS" }] } });
    await tools.get("assemble_knowledge_review_bundle")!.handler({ architectureScope, sessionId: "scan-session-1" });
    await tools.get("match_knowledge_identities")!.handler({ architectureScope, scanReportId: "scan-1" });
    await tools.get("create_identity_candidate")!.handler({ architectureScope, candidate: { id: "identity-1" } });
    await tools.get("create_knowledge_review_bundle")!.handler({ architectureScope, id: "review-1", designChangeSessionId: "session-1", riskTier: "T1", assertionIds: ["assertion-1"], identityCandidateIds: [], evidenceRefs: ["evidence-1"], coverage: { totalSources: 1, processedSources: 1, supportedSources: 1, candidateCount: 1, complete: true }, blockingIssues: [] });
    await tools.get("decide_knowledge_review_bundle")!.handler({ architectureScope, id: "decision-1", reviewBundleId: "review-1", decision: "APPROVE", approvedAssertionIds: ["assertion-1"], approvedIdentityCandidateIds: [], evidenceRefs: ["evidence-1"], reason: "Reviewed" });
    await tools.get("promote_knowledge_candidates")!.handler({ architectureScope, promotionDecisionId: "decision-1", streamId: "stream-1" });
    await tools.get("reconcile_knowledge_baseline")!.handler({ architectureScope, promotionReceiptId: "promotion-1" });
    await tools.get("create_working_stream")!.handler({ architectureScope, id: "stream-1", name: "Main" });
    await tools.get("commit_knowledge_changeset")!.handler({ architectureScope, id: "changeset-1", streamId: "stream-1", assetRevisionIds: [], relationshipRevisionIds: [], evidenceRefs: [], promotionDecisionId: "decision-1" });
    await tools.get("publish_knowledge_baseline")!.handler({ architectureScope, id: "baseline-1", streamId: "stream-1", changeSetId: "changeset-1", sourceRevisionIds: ["asset-1"], relationshipVersion: "1", reconciliationReceiptId: "reconciliation-1" });
    await tools.get("create_projection_manifest")!.handler({ architectureScope, id: "projection-1", baselineId: "baseline-1", projectionType: "SYS_KL", projectionSchemaVersion: "1", sourceRevisionIds: ["asset-1"], relationshipVersion: "1", query: {} });
    await tools.get("list_knowledge_assertions")!.handler({ applicationServiceId: architectureScope.applicationServiceId });

    expect(knowledge.createKnowledgeAssertion).toHaveBeenCalledOnce();
    expect(scanner.submitScanReport).toHaveBeenCalledOnce();
    expect(scanner.generateKnowledgeCandidates).toHaveBeenCalledWith({ architectureScope, scanReportId: "scan-1", provider: "mock" });
    expect(semanticCandidates.submitSemanticCandidateBatch).toHaveBeenCalledWith(expect.objectContaining({ architectureScope, batch: expect.objectContaining({ sessionId: "scan-session-1" }) }));
    expect(semanticCandidates.assembleKnowledgeReviewBundle).toHaveBeenCalledWith({ architectureScope, sessionId: "scan-session-1" });
    expect(scanner.matchKnowledgeIdentities).toHaveBeenCalledWith({ architectureScope, scanReportId: "scan-1" });
    expect(knowledge.createIdentityCandidate).toHaveBeenCalledOnce();
    expect(knowledge.createKnowledgeReviewBundle).toHaveBeenCalledOnce();
    expect(knowledge.decideKnowledgeReviewBundle).toHaveBeenCalledOnce();
    expect(promotion.promoteKnowledgeCandidates).toHaveBeenCalledWith({ architectureScope, promotionDecisionId: "decision-1", streamId: "stream-1" });
    expect(promotion.reconcileKnowledgeBaseline).toHaveBeenCalledWith({ architectureScope, promotionReceiptId: "promotion-1" });
    expect(knowledge.createWorkingStream).toHaveBeenCalledOnce();
    expect(knowledge.commitKnowledgeChangeSet).toHaveBeenCalledOnce();
    expect(knowledge.publishKnowledgeBaseline).toHaveBeenCalledOnce();
    expect(knowledge.createProjectionManifest).toHaveBeenCalledOnce();
    expect(knowledge.listKnowledgeAssertions).toHaveBeenCalledWith(architectureScope.applicationServiceId);
  });
});
