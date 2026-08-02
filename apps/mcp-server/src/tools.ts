import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Permission } from "@specforge/core";
import { z } from "zod";
import { auditToolCall } from "./audit";
import { allowAllPolicy, getDefaultActor } from "./auth";
import { deletePersistedDesignData, isSeedMode, listPersistedAssetLinks, searchPersistedDesignAssets, upsertAssetLink, upsertContextPack, upsertDesignAsset, upsertProposal } from "./persistence";
import { commitKnowledgeChangeSet, createIdentityCandidate, createKnowledgeAssertion, createKnowledgeReviewBundle, createProjectionManifest, createWorkingStream, decideKnowledgeReviewBundle, listKnowledgeAssertions, publishKnowledgeBaseline } from "./knowledge/persistence";
import {
  analyzeScopedProposalImpact,
  buildScopedAssetGraph,
  exportScopedContextPack,
  generateScopedContextPack,
  getScopedAssetDetail,
  renderScopedAssetMarkdown,
  runScopedGovernanceChecks
} from "./scoped-derived";

type ToolHandler<T> = (input: T) => Promise<unknown>;

function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

function targetFor(action: string, input: Record<string, unknown>) {
  if ("asset" in input && "assetType" in input) {
    const asset = input.asset as { id?: unknown };
    return { targetType: String(input.assetType), targetId: typeof asset?.id === "string" ? asset.id : "new" };
  }
  if ("proposal" in input) {
    const proposal = input.proposal as { id?: unknown };
    return { targetType: "proposal", targetId: typeof proposal?.id === "string" ? proposal.id : "new" };
  }
      if ("contextPack" in input) {
    const contextPack = input.contextPack as { id?: unknown };
    return { targetType: "context-pack", targetId: typeof contextPack?.id === "string" ? contextPack.id : "new" };
  }
  if ("proposalId" in input) return { targetType: "proposal", targetId: String(input.proposalId) };
  if ("sourceId" in input && "targetId" in input) return { targetType: "asset-link", targetId: `${input.sourceId}->${input.targetId}` };
  if ("assetId" in input) return { targetType: String(input.assetType ?? "asset"), targetId: String(input.assetId) };
  if ("contextPackId" in input) return { targetType: "context-pack", targetId: String(input.contextPackId) };
  if (action.includes("search")) return { targetType: "asset", targetId: "catalog" };
  return { targetType: "design", targetId: "new" };
}

function registerJsonTool<T extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: T;
    permissions: Permission[];
    readOnly: boolean;
    destructive?: boolean;
    seedOnly?: boolean;
  },
  handler: ToolHandler<z.output<z.ZodObject<T>>>
) {
  server.registerTool(
    name,
    {
      title: config.title,
      description: `${config.description} Required permissions: ${config.permissions.join(", ")}.`,
      inputSchema: config.inputSchema,
      annotations: {
        title: config.title,
        readOnlyHint: config.readOnly,
        destructiveHint: config.destructive ?? false,
        idempotentHint: config.readOnly,
        openWorldHint: false
      },
      _meta: { permissions: config.permissions, write: !config.readOnly }
    } as Parameters<McpServer["registerTool"]>[1],
    async (input: unknown) => {
      const actor = isSeedMode()
        ? { actorType: "system" as const, actorId: "specforge-seed" }
        : getDefaultActor();
      const target = targetFor(name, input as Record<string, unknown>);
      try {
        if (config.seedOnly && !isSeedMode()) throw new Error("Seed cleanup is not enabled.");
        await allowAllPolicy.authorize(actor, config.permissions);
        const output = await handler(input as z.output<z.ZodObject<T>>);
        auditToolCall({ actor, action: name, ...target, toolInput: input, output, status: "success" });
        return textResult(output);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tool error";
        if (isSeedMode()) console.error(`[specforge-seed] ${name}: ${message}`);
        auditToolCall({ actor, action: name, ...target, toolInput: input, output: "failed", status: "failed", errorMessage: message });
        return errorResult(`SpecForge tool call failed: ${name}. Check input and asset identifiers.`);
      }
    }
  );
}

const assetTypeSchema = z.enum(["domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr", "proposal", "contextPack", "evidence"]);
const assetLocaleSchema = z.enum(["zh", "en"]);
const architectureScopeSchema = z.object({
  applicationServiceId: z.string().min(1),
  scopePath: z.string().min(1)
});

function assertMatchingApplicationService(input: { applicationServiceId: string; architectureScope: { applicationServiceId: string } }): void {
  if (input.applicationServiceId !== input.architectureScope.applicationServiceId) {
    throw new Error("applicationServiceId must match architectureScope.applicationServiceId.");
  }
}

export function registerTools(server: McpServer): void {
  if (isSeedMode()) registerJsonTool(
    server,
    "delete_seed_design_data",
    {
      title: "Delete scoped seed design data",
      description: "Deletes explicitly named legacy seed records inside one authorized application-service scope. It cannot delete records from sibling scopes.",
      inputSchema: {
        architectureScope: architectureScopeSchema,
        assetIds: z.array(z.string()).optional(),
        proposalIds: z.array(z.string()).optional(),
        contextPackIds: z.array(z.string()).optional()
      },
      permissions: ["asset:write", "proposal:write"],
      readOnly: false,
      destructive: true,
      seedOnly: true
    },
    deletePersistedDesignData
  );

  registerJsonTool(
    server,
    "upsert_design_asset",
    {
      title: "Upsert design asset",
      description: "Creates or updates a persisted design asset through the MCP write boundary. This validates the envelope, stores the full payload, and is audited.",
      inputSchema: {
        assetType: assetTypeSchema,
        asset: z.record(z.unknown()),
        architectureScope: architectureScopeSchema
      },
      permissions: ["asset:write"],
      readOnly: false
    },
    async (input) => upsertDesignAsset({ ...input, asset: { ...input.asset, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertDesignAsset>[0])
  );

  registerJsonTool(
    server,
    "upsert_proposal",
    {
      title: "Upsert proposal",
      description: "Creates or updates a persisted proposal through the MCP write boundary. This is intended for MCP-native imports, seed runs, and future agent edits.",
      inputSchema: {
        proposal: z.record(z.unknown()),
        architectureScope: architectureScopeSchema
      },
      permissions: ["proposal:write"],
      readOnly: false
    },
    async (input) => upsertProposal({ ...input, proposal: { ...input.proposal, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertProposal>[0])
  );

  registerJsonTool(
    server,
    "upsert_context_pack",
    {
      title: "Upsert context pack",
      description: "Creates or updates a persisted Context Pack through the MCP write boundary. This keeps generated agent context queryable by Web and MCP clients.",
      inputSchema: {
        contextPack: z.record(z.unknown()),
        architectureScope: architectureScopeSchema
      },
      permissions: ["context-pack:generate"],
      readOnly: false
    },
    async (input) => upsertContextPack({ ...input, contextPack: { ...input.contextPack, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertContextPack>[0])
  );

  registerJsonTool(
    server,
    "search_design_assets",
    {
      title: "Search design assets",
      description: "Searches SpecForge design assets by query, type, and optional domain. This is read-only and returns summaries, not raw database access.",
      inputSchema: {
        query: z.string(),
        applicationServiceId: z.string().min(1),
        assetTypes: z.array(z.string()).optional(),
        domainId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    searchPersistedDesignAssets
  );

  registerJsonTool(
    server,
    "get_asset_detail",
    {
      title: "Get asset detail",
      description: "Reads one design asset in markdown or JSON form. This does not expose database connection details.",
      inputSchema: {
        assetType: z.string(),
        assetId: z.string(),
        applicationServiceId: z.string().min(1),
        format: z.enum(["markdown", "json"]).optional(),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => {
      if (input.format === "json") {
        return { format: "json", ...(await getScopedAssetDetail(input)) };
      }
      return { format: "markdown", ...(await renderScopedAssetMarkdown(input)) };
    }
  );

  registerJsonTool(
    server,
    "get_asset_graph",
    {
      title: "Get scoped asset graph",
      description: "Builds the localized relationship graph from persisted assets in exactly one authorized application-service scope.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        locale: assetLocaleSchema.optional(),
        domainId: z.string().optional(),
        assetType: assetTypeSchema.optional()
      },
      permissions: ["asset:read", "graph:read"],
      readOnly: true
    },
    buildScopedAssetGraph
  );

  registerJsonTool(
    server,
    "analyze_proposal_impact",
    {
      title: "Analyze proposal impact",
      description: "Analyzes impacted domains, contracts, risks, governance warnings, and implementation tasks for a proposal.",
      inputSchema: {
        proposalId: z.string(),
        applicationServiceId: z.string().min(1),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["proposal:read", "asset:read", "graph:read"],
      readOnly: true
    },
    analyzeScopedProposalImpact
  );

  registerJsonTool(
    server,
    "generate_context_pack",
    {
      title: "Generate context pack",
      description: "Generates an Agent Context Pack for a proposal with implementation guidance and explicit do-not rules.",
      inputSchema: {
        proposalId: z.string(),
        applicationServiceId: z.string().min(1),
        targetAgent: z.enum(["codex", "claude-code", "cursor", "copilot", "generic"]).optional(),
        includeAssets: z.array(z.string()).optional(),
        format: z.enum(["markdown", "json"]).optional(),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["context-pack:generate", "proposal:read", "asset:read"],
      readOnly: false
    },
    async (input) => {
      const result = await generateScopedContextPack(input);
      return input.format === "json"
        ? result
        : { format: "markdown", content: result.contextPack.generatedMarkdown, canonicalSource: result.canonicalSource };
    }
  );

  registerJsonTool(
    server,
    "run_governance_checks",
    {
      title: "Run governance checks",
      description: "Runs built-in design governance checks for assets, proposals, or context packs. It does not execute arbitrary code.",
      inputSchema: {
        targetType: z.enum(["asset", "proposal", "context-pack"]),
        targetId: z.string(),
        assetType: z.string().optional(),
        checks: z.array(z.string()).optional(),
        applicationServiceId: z.string().min(1),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["governance:run"],
      readOnly: true
    },
    runScopedGovernanceChecks
  );

  registerJsonTool(
    server,
    "create_proposal",
    {
      title: "Create proposal",
      description: "Creates a bilingual English-canonical proposal in one authorized application-service scope through persisted storage.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        architectureScope: architectureScopeSchema,
        proposal: z.record(z.unknown())
      },
      permissions: ["proposal:write"],
      readOnly: false
    },
    async (input) => {
      assertMatchingApplicationService(input);
      return upsertProposal({ proposal: { ...input.proposal, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertProposal>[0]);
    }
  );

  registerJsonTool(
    server,
    "update_proposal",
    {
      title: "Update proposal",
      description: "Replaces a persisted bilingual English-canonical proposal inside one authorized application-service scope.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        architectureScope: architectureScopeSchema,
        proposal: z.record(z.unknown())
      },
      permissions: ["proposal:write"],
      readOnly: false
    },
    async (input) => {
      assertMatchingApplicationService(input);
      return upsertProposal({ proposal: { ...input.proposal, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertProposal>[0]);
    }
  );

  registerJsonTool(
    server,
    "create_adr",
    {
      title: "Create ADR",
      description: "Creates a persisted bilingual English-canonical ADR inside one authorized application-service scope.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        architectureScope: architectureScopeSchema,
        adr: z.record(z.unknown())
      },
      permissions: ["adr:write"],
      readOnly: false
    },
    async (input) => {
      assertMatchingApplicationService(input);
      return upsertDesignAsset({ assetType: "adr", asset: { ...input.adr, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertDesignAsset>[0]);
    }
  );

  registerJsonTool(
    server,
    "link_assets",
    {
      title: "Link assets",
      description: "Creates or updates a persisted relationship between two design assets for graph traversal and future impact analysis. This write operation is audited and does not delete assets.",
      inputSchema: {
        sourceType: z.string(),
        sourceId: z.string(),
        targetType: z.string(),
        targetId: z.string(),
        relationType: z.string(),
        description: z.string().optional(),
        architectureScope: architectureScopeSchema
      },
      permissions: ["asset:write"],
      readOnly: false
    },
    upsertAssetLink
  );

  registerJsonTool(
    server,
    "list_asset_links",
    {
      title: "List asset links",
      description: "Lists persisted typed relationships inside one authorized application-service scope.",
      inputSchema: { applicationServiceId: z.string().min(1) },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => listPersistedAssetLinks(input.applicationServiceId)
  );

  registerJsonTool(
    server,
    "export_context_pack",
    {
      title: "Export context pack",
      description: "Exports a generated Context Pack by id in markdown or JSON format.",
      inputSchema: {
        contextPackId: z.string(),
        applicationServiceId: z.string().min(1),
        format: z.enum(["markdown", "json"]),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => {
      const result = await exportScopedContextPack(input);
      return input.format === "markdown" ? result.contextPack.generatedMarkdown : result;
    }
  );

  registerJsonTool(server, "create_knowledge_assertion", {
    title: "Create knowledge assertion",
    description: "Persists an evidence-backed BIZ, SYS, or TECH assertion in one exact application-service scope.",
    inputSchema: { architectureScope: architectureScopeSchema, assertion: z.record(z.unknown()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => createKnowledgeAssertion(input as unknown as Parameters<typeof createKnowledgeAssertion>[0]));

  registerJsonTool(server, "create_identity_candidate", {
    title: "Create identity candidate",
    description: "Persists a reviewed-later identity mapping candidate without silently merging source concepts.",
    inputSchema: { architectureScope: architectureScopeSchema, candidate: z.record(z.unknown()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => createIdentityCandidate(input as unknown as Parameters<typeof createIdentityCandidate>[0]));

  registerJsonTool(server, "create_knowledge_review_bundle", {
    title: "Create knowledge ReviewBundle",
    description: "Builds a scoped T0-T3 review bundle from assertions, identity candidates, evidence, coverage, and blocking issues. Partial or blocked coverage cannot be approved.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), designChangeSessionId: z.string().min(1), riskTier: z.enum(["T0", "T1", "T2", "T3"]), assertionIds: z.array(z.string()), identityCandidateIds: z.array(z.string()), evidenceRefs: z.array(z.string()).min(1), coverage: z.object({ totalSources: z.number().int().min(0), processedSources: z.number().int().min(0), supportedSources: z.number().int().min(0), candidateCount: z.number().int().min(0), complete: z.boolean() }), blockingIssues: z.array(z.string()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, createKnowledgeReviewBundle);

  registerJsonTool(server, "decide_knowledge_review_bundle", {
    title: "Decide knowledge ReviewBundle",
    description: "Records an auditable MCP-only promotion decision. Approval marks selected assertions and identity candidates accepted for a later ChangeSet.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), reviewBundleId: z.string().min(1), decision: z.enum(["APPROVE", "REJECT"]), approvedAssertionIds: z.array(z.string()), approvedIdentityCandidateIds: z.array(z.string()), evidenceRefs: z.array(z.string()).min(1), reason: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, decideKnowledgeReviewBundle);

  registerJsonTool(server, "create_working_stream", {
    title: "Create working stream",
    description: "Creates or reopens a mutable scoped Working Stream for atomic ChangeSets.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), name: z.string().min(1) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, createWorkingStream);

  registerJsonTool(server, "commit_knowledge_changeset", {
    title: "Commit knowledge ChangeSet",
    description: "Commits asset revisions, relationship revisions, and Evidence references into one monotonic scoped ChangeSet.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), streamId: z.string().min(1), assetRevisionIds: z.array(z.string()), relationshipRevisionIds: z.array(z.string()), evidenceRefs: z.array(z.string()), promotionDecisionId: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, commitKnowledgeChangeSet);

  registerJsonTool(server, "publish_knowledge_baseline", {
    title: "Publish knowledge baseline",
    description: "Publishes an immutable scoped Baseline only after a converged reconciliation result.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), streamId: z.string().min(1), changeSetId: z.string().min(1), sourceRevisionIds: z.array(z.string()).min(1), relationshipVersion: z.string().min(1), reconciliationStatus: z.enum(["CONVERGED", "DRIFTED", "BLOCKED"]) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, publishKnowledgeBaseline);

  registerJsonTool(server, "create_projection_manifest", {
    title: "Create projection manifest",
    description: "Records the exact baseline, revisions, query, schema version, and digest used for a derived 3A projection.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), baselineId: z.string().min(1), projectionType: z.enum(["BIZ_KL", "SYS_KL", "TECH_KL", "DIAGRAM", "CATALOG", "ALIGNMENT", "DRIFT", "CONTEXT_PACK"]), projectionSchemaVersion: z.string().min(1), sourceRevisionIds: z.array(z.string()), relationshipVersion: z.string().min(1), query: z.record(z.unknown()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, createProjectionManifest);

  registerJsonTool(server, "list_knowledge_assertions", {
    title: "List knowledge assertions",
    description: "Lists BIZ, SYS, and TECH assertions inside one authorized application-service scope.",
    inputSchema: { applicationServiceId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, async (input) => listKnowledgeAssertions(input.applicationServiceId));
}
