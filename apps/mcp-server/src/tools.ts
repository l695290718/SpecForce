import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  analyzeProposalImpact,
  createAdr,
  createProposal,
  generateContextPack,
  linkAssets,
  runGovernanceChecksForTarget,
  updateProposal
} from "@specforge/core";
import type { Permission } from "@specforge/core";
import { z } from "zod";
import { auditToolCall } from "./audit";
import { allowAllPolicy, getDefaultActor } from "./auth";
import { getPersistedAsset, listPersistedContextPacks, renderPersistedAssetAsMarkdown, searchPersistedDesignAssets, upsertContextPack, upsertDesignAsset, upsertProposal } from "./persistence";

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
        destructiveHint: false,
        idempotentHint: config.readOnly,
        openWorldHint: false
      },
      _meta: { permissions: config.permissions, write: !config.readOnly }
    } as Parameters<McpServer["registerTool"]>[1],
    async (input: unknown) => {
      const actor = getDefaultActor();
      const target = targetFor(name, input as Record<string, unknown>);
      try {
        await allowAllPolicy.authorize(actor, config.permissions);
        const output = await handler(input as z.output<z.ZodObject<T>>);
        auditToolCall({ actor, action: name, ...target, toolInput: input, output, status: "success" });
        return textResult(output);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tool error";
        auditToolCall({ actor, action: name, ...target, toolInput: input, output: "failed", status: "failed", errorMessage: message });
        return errorResult(`SpecForge tool call failed: ${name}. Check input and asset identifiers.`);
      }
    }
  );
}

const assetRefSchema = z.object({
  assetType: z.string(),
  assetId: z.string()
});

const assetTypeSchema = z.enum(["domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr", "proposal", "contextPack"]);

export function registerTools(server: McpServer): void {
  registerJsonTool(
    server,
    "upsert_design_asset",
    {
      title: "Upsert design asset",
      description: "Creates or updates a persisted design asset through the MCP write boundary. This validates the envelope, stores the full payload, and is audited.",
      inputSchema: {
        assetType: assetTypeSchema,
        asset: z.record(z.unknown())
      },
      permissions: ["asset:write"],
      readOnly: false
    },
    async (input) => upsertDesignAsset(input as unknown as Parameters<typeof upsertDesignAsset>[0])
  );

  registerJsonTool(
    server,
    "upsert_proposal",
    {
      title: "Upsert proposal",
      description: "Creates or updates a persisted proposal through the MCP write boundary. This is intended for MCP-native imports, seed runs, and future agent edits.",
      inputSchema: {
        proposal: z.record(z.unknown())
      },
      permissions: ["proposal:write"],
      readOnly: false
    },
    async (input) => upsertProposal(input as unknown as Parameters<typeof upsertProposal>[0])
  );

  registerJsonTool(
    server,
    "upsert_context_pack",
    {
      title: "Upsert context pack",
      description: "Creates or updates a persisted Context Pack through the MCP write boundary. This keeps generated agent context queryable by Web and MCP clients.",
      inputSchema: {
        contextPack: z.record(z.unknown())
      },
      permissions: ["context-pack:generate"],
      readOnly: false
    },
    async (input) => upsertContextPack(input as unknown as Parameters<typeof upsertContextPack>[0])
  );

  registerJsonTool(
    server,
    "search_design_assets",
    {
      title: "Search design assets",
      description: "Searches SpecForge design assets by query, type, and optional domain. This is read-only and returns summaries, not raw database access.",
      inputSchema: {
        query: z.string(),
        assetTypes: z.array(z.string()).optional(),
        domainId: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional()
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
        format: z.enum(["markdown", "json"]).optional()
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => {
      if (input.format === "json") {
        return { format: "json", asset: await getPersistedAsset(input.assetType, input.assetId) };
      }
      return { format: "markdown", content: await renderPersistedAssetAsMarkdown(input.assetType, input.assetId) };
    }
  );

  registerJsonTool(
    server,
    "analyze_proposal_impact",
    {
      title: "Analyze proposal impact",
      description: "Analyzes impacted domains, contracts, risks, governance warnings, and implementation tasks for a proposal.",
      inputSchema: { proposalId: z.string() },
      permissions: ["proposal:read", "asset:read", "graph:read"],
      readOnly: true
    },
    async (input) => analyzeProposalImpact(input.proposalId)
  );

  registerJsonTool(
    server,
    "generate_context_pack",
    {
      title: "Generate context pack",
      description: "Generates an Agent Context Pack for a proposal with implementation guidance and explicit do-not rules.",
      inputSchema: {
        proposalId: z.string(),
        targetAgent: z.enum(["codex", "claude-code", "cursor", "copilot", "generic"]).optional(),
        includeAssets: z.array(z.string()).optional(),
        format: z.enum(["markdown", "json"]).optional()
      },
      permissions: ["context-pack:generate", "proposal:read", "asset:read"],
      readOnly: false
    },
    async (input) => {
      const persistedPack = (await listPersistedContextPacks()).find((pack) => pack.proposalId === input.proposalId);
      if (persistedPack) return input.format === "json" ? persistedPack : persistedPack.generatedMarkdown;
      const pack = await generateContextPack(input.proposalId, input);
      return input.format === "json" ? pack : pack.generatedMarkdown;
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
        checks: z.array(z.string()).optional()
      },
      permissions: ["governance:run"],
      readOnly: true
    },
    async (input) => {
      try {
        return await runGovernanceChecksForTarget(input);
      } catch {
        return { targetType: input.targetType, targetId: input.targetId, results: [] };
      }
    }
  );

  registerJsonTool(
    server,
    "create_proposal",
    {
      title: "Create proposal",
      description: "Creates a design change proposal. This is a validated write operation and is audited.",
      inputSchema: {
        title: z.string().min(1),
        description: z.string().min(1),
        background: z.string().optional(),
        goal: z.string().min(1),
        nonGoal: z.string().optional(),
        scope: z.string().optional(),
        impactedAssets: z.array(assetRefSchema).optional(),
        risks: z.string().optional(),
        rolloutPlan: z.string().optional(),
        rollbackPlan: z.string().optional()
      },
      permissions: ["proposal:write"],
      readOnly: false
    },
    createProposal
  );

  registerJsonTool(
    server,
    "update_proposal",
    {
      title: "Update proposal",
      description: "Updates allowed proposal fields with a patch object. This is a validated write operation and is audited.",
      inputSchema: {
        proposalId: z.string(),
        patch: z.record(z.unknown())
      },
      permissions: ["proposal:write"],
      readOnly: false
    },
    updateProposal
  );

  registerJsonTool(
    server,
    "create_adr",
    {
      title: "Create ADR",
      description: "Creates an Architecture Decision Record linked to optional design assets. This is a validated write operation and is audited.",
      inputSchema: {
        title: z.string().min(1),
        status: z.enum(["proposed", "accepted", "deprecated", "superseded"]).optional(),
        context: z.string().min(1),
        decision: z.string().min(1),
        alternatives: z.string().optional(),
        consequences: z.string().optional(),
        constraints: z.string().optional(),
        relatedAssets: z.array(assetRefSchema).optional(),
        owner: z.string().optional()
      },
      permissions: ["adr:write"],
      readOnly: false
    },
    createAdr
  );

  registerJsonTool(
    server,
    "link_assets",
    {
      title: "Link assets",
      description: "Creates an in-memory relationship between two design assets. This write operation is audited and does not delete assets.",
      inputSchema: {
        sourceType: z.string(),
        sourceId: z.string(),
        targetType: z.string(),
        targetId: z.string(),
        relationType: z.string(),
        description: z.string().optional()
      },
      permissions: ["asset:write"],
      readOnly: false
    },
    linkAssets
  );

  registerJsonTool(
    server,
    "export_context_pack",
    {
      title: "Export context pack",
      description: "Exports a generated Context Pack by id in markdown or JSON format.",
      inputSchema: {
        contextPackId: z.string(),
        format: z.enum(["markdown", "json"])
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => {
      const pack = await getPersistedAsset("contextPack", input.contextPackId) as { generatedMarkdown?: string };
      return input.format === "markdown" ? (pack.generatedMarkdown ?? "") : pack;
    }
  );
}
