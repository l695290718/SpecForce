import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Permission } from "@specforge/core";
import { z } from "zod";
import { auditToolCall } from "./audit";
import { validateIntegrationContractV1 as validateIntegrationContractEnvelope } from "./integration-contract";
import { allowAllPolicy, getDefaultActor, principalFromAuthInfo, withRequestPrincipal, type McpAuthInfo } from "./auth";
import { archiveSeedGraphOutbox, deletePersistedDesignData, isSeedMode, listPersistedAssetLinks, prepareDataModelUpgrade, queryPersistedAssetLinks, searchPersistedDesignAssets, upsertAssetLink, upsertContextPack, upsertDesignAsset, upsertProposal } from "./persistence";
import { applyDataModelChangeSet } from "./data-models/change-set";
import { commitKnowledgeChangeSet, createIdentityCandidate, createKnowledgeAssertion, createKnowledgeReviewBundle, createProjectionManifest, createWorkingStream, decideKnowledgeReviewBundle, listKnowledgeAssertions, publishKnowledgeBaseline } from "./knowledge/persistence";
import { promote3aArchitectureFacts, reconcile3aArchitectureFacts, submit3aArchitectureFactBatch } from "./knowledge/architecture-authoring";
import { submitScanReport } from "./scanner/persistence";
import { getScannerRelease } from "./scanner/release";
import { finalizeKnowledgeScan, getScanCheckpoint, startKnowledgeScan } from "./scanner/session";
import { submitScanBatch } from "./scanner/batch-persistence";
import { generateKnowledgeCandidates } from "./knowledge/semantic-persistence";
import { matchKnowledgeIdentities } from "./knowledge/identity-persistence";
import { assembleKnowledgeReviewBundle, submitSemanticCandidateBatch } from "./knowledge/candidate-persistence";
import { promoteKnowledgeCandidates, reconcileKnowledgeBaseline } from "./knowledge/promotion";
import { bootstrapThreeAFromDesignAssets } from "./knowledge/bootstrap";
import { deriveScopedKnowledgeProjection } from "./knowledge/projection";
import { getProjectionBuild, requestProjectionBuild } from "./knowledge/projection-build";
import { getCoverageBuild, requestCoverageBuild } from "./knowledge/coverage-build";
import { get3aCoverageReport } from "./knowledge/coverage-report";
import { compare3aPublishedBaselines, get3aAlignment, get3aArchitectureFact, list3aProjectionManifests, list3aPublishedBaselines, query3aArchitectureMap, query3aArchitectureUnitNeighborhood, search3aArchitectureFacts, trace3aArchitecturePath } from "./knowledge/query-adapter";
import { get3aArchitectureUnitNeighborhood, get3aAssetMapping, search3aArchitectureMap, search3aArchitectureRealizations, search3aAssetMappings } from "./knowledge/architecture-map-adapter";
import { acceptRequirementAssessment, cancelRequirementAssessment, createAssessmentContextPackDraft, createAssessmentProposalDraft, createRequirementAssessment, getRequirementAssessment, listRequirementAssessments, recordAssessmentExecutionActual } from "./requirement-assessment/tools";
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
type ToolExtra = { authInfo?: McpAuthInfo };

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
    async (input: unknown, extra?: ToolExtra) => {
      const principal = !isSeedMode() && extra?.authInfo ? principalFromAuthInfo(extra.authInfo) : undefined;
      const execute = async () => {
        const actor = principal ?? (isSeedMode()
          ? { actorType: "system" as const, actorId: "specforge-seed" }
          : getDefaultActor());
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
      };
      return principal ? withRequestPrincipal(principal, execute) : execute();
    }
  );
}

const assetTypeSchema = z.enum(["domain", "dataModel", "api", "event", "businessRule", "stateMachine", "integration", "quality", "observability", "adr", "proposal", "contextPack", "evidence"]);
const assetLocaleSchema = z.enum(["zh", "en"]);
const architectureScopeSchema = z.object({
  applicationServiceId: z.string().min(1),
  scopePath: z.string().min(1)
});

const architectureFactUnitSchema = z.object({
  id: z.string().min(1), unitIdentity: z.string().min(1), revision: z.number().int().min(1), layer: z.enum(["BIZ", "SYS", "TECH"]), kind: z.string().min(1), parentUnitIdentity: z.string().min(1).optional(), canonicalName: z.string().min(1), canonicalDescription: z.string().min(1), localizedContent: z.object({ zh: z.object({ name: z.string().min(1), description: z.string().min(1) }) }), aliases: z.array(z.string()), criticality: z.number().min(0).max(1), evidenceRefs: z.array(z.string()).min(1)
});
const architectureFactMembershipSchema = z.object({
  id: z.string().min(1), membershipIdentity: z.string().min(1), revision: z.number().int().min(1), unitIdentity: z.string().min(1), assertionId: z.string().min(1).optional(), assetType: z.string().min(1).optional(), assetId: z.string().min(1).optional(), semanticIdentity: z.string().min(1), confidence: z.number().min(0).max(1), evidenceRefs: z.array(z.string()).min(1)
});
const architectureFactMappingSchema = z.object({
  id: z.string().min(1), mappingIdentity: z.string().min(1), revision: z.number().int().min(1), sourceUnitIdentity: z.string().min(1), targetUnitIdentity: z.string().min(1), mappingFamily: z.string().min(1), confidence: z.number().min(0).max(1), relationshipIdentities: z.array(z.string()).min(1), evidenceRefs: z.array(z.string()).min(1)
});
const semanticCandidateSchema = z.object({
  semanticIdentity: z.string().min(1),
  normalizedDigest: z.string().min(1),
  factType: z.string().min(1),
  layer: z.enum(["BIZ", "SYS", "TECH"]),
  aspect: z.enum(["structure", "behavior", "information", "contract", "constraint"]),
  value: z.record(z.unknown()),
  confidence: z.number().min(0).max(1),
  matchingEvidence: z.array(z.string()),
  counterEvidence: z.array(z.string()),
  unresolvedQuestions: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  sourceObservationIds: z.array(z.string().min(1)).min(1),
  domainCluster: z.string().min(1),
  identityDecision: z.enum(["UNMATCHED", "UNAMBIGUOUS", "AMBIGUOUS"])
});

/** ADR-0039 V1 guard: an integration contract that claims V1 governance must carry the full stable identity, and a resolved target requires its provider binding plus locator. */
export const validateIntegrationContractV1 = validateIntegrationContractEnvelope;

function assertMatchingApplicationService(input: { applicationServiceId: string; architectureScope: { applicationServiceId: string } }): void {  if (input.applicationServiceId !== input.architectureScope.applicationServiceId) {
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

  if (isSeedMode()) registerJsonTool(
    server,
    "archive_seed_graph_outbox",
    {
      title: "Archive scoped seed graph outbox",
      description: "Archives nonterminal graph outbox history in one exact verification Scope through the MCP write boundary. Payloads and audit history are preserved; production Scopes are rejected.",
      inputSchema: { architectureScope: architectureScopeSchema },
      permissions: ["asset:write"],
      readOnly: false,
      destructive: true,
      seedOnly: true
    },
    archiveSeedGraphOutbox
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
    async (input) => {
      if (input.assetType === "integration") validateIntegrationContractV1(input.asset, input.architectureScope);
      return upsertDesignAsset({ ...input, asset: { ...input.asset, architectureScope: input.architectureScope } } as unknown as Parameters<typeof upsertDesignAsset>[0]);
    }
  );

  registerJsonTool(
    server,
    "apply_data_model_change_set",
    {
      title: "Apply data model change set",
      description: "Atomically validates and persists structured Data Model v2 assets and their typed relationship projection in one exact Scope.",
      inputSchema: {
        architectureScope: architectureScopeSchema,
        models: z.array(z.record(z.unknown())).optional(),
        changes: z.array(z.object({ operation: z.enum(["UPSERT", "DELETE"]), asset: z.record(z.unknown()).optional(), assetId: z.string().min(1).optional() })).optional(),
        idempotencyKey: z.string().min(1),
        correlationId: z.string().min(1)
      },
      permissions: ["asset:write"],
      readOnly: false
    },
    async (input) => applyDataModelChangeSet({
      ...input,
      models: input.models?.map((model) => ({ ...model, architectureScope: input.architectureScope })) as never,
      changes: input.changes?.map((change) => ({ ...change, asset: change.asset ? { ...change.asset, architectureScope: input.architectureScope } as never : undefined })) as never
    })
  );

  registerJsonTool(
    server,
    "upgrade_data_model",
    {
      title: "Prepare Data Model v2 upgrade",
      description: "Reads a legacy Data Model and deterministically prepares a v2 payload without writing it.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        architectureScope: architectureScopeSchema,
        assetId: z.string().min(1)
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => {
      assertMatchingApplicationService(input);
      return prepareDataModelUpgrade(input);
    }
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
        pageSize: z.number().int().min(1).max(50).optional(),
        cursor: z.string().max(4096).optional(),
        summaryOnly: z.boolean().optional(),
        locale: assetLocaleSchema.optional()
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    async (input) => searchPersistedDesignAssets({ ...input, limit: input.pageSize ?? input.limit, pageSize: input.pageSize, cursor: input.cursor })
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
    "query_asset_graph",
    {
      title: "Query bounded asset graph",
      description: "Reads a bounded, optionally focused relationship graph in one authorized application-service scope. The response reports truncation instead of silently dropping graph data.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        locale: assetLocaleSchema.optional(),
        domainId: z.string().optional(),
        assetType: assetTypeSchema.optional(),
        focusAssetId: z.string().optional(),
        maxNodes: z.number().int().min(1).max(5000).optional(),
        maxEdges: z.number().int().min(0).max(10000).optional()
      },
      permissions: ["asset:read", "graph:read"],
      readOnly: true
    },
    async (input) => buildScopedAssetGraph({ ...input, includeCanonicalSource: false })
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
    "query_asset_links",
    {
      title: "Query scoped asset links",
      description: "Reads a bounded page of typed relationships inside one authorized application-service scope.",
      inputSchema: {
        applicationServiceId: z.string().min(1),
        sourceType: z.string().optional(),
        sourceId: z.string().optional(),
        targetType: z.string().optional(),
        targetId: z.string().optional(),
        relationType: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional()
      },
      permissions: ["asset:read"],
      readOnly: true
    },
    queryPersistedAssetLinks
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

  registerJsonTool(server, "bootstrap_3a_from_design_assets", {
    title: "Bootstrap 3A from authored design assets",
    description: "Creates an idempotent exact-Scope bilingual BIZ/SYS/TECH Knowledge Baseline from already-authored PostgreSQL design assets and typed links. This migration preserves authored meaning and does not infer new semantics.",
    inputSchema: { architectureScope: architectureScopeSchema, designChangeSessionId: z.string().min(1) },
    permissions: ["asset:read", "knowledge:write", "governance:run"],
    readOnly: false
  }, async (input) => bootstrapThreeAFromDesignAssets(input));

  registerJsonTool(server, "start_knowledge_scan", {
    title: "Start governed knowledge scan",
    description: "Creates an exact-Scope Scan Session bound to the authorized actor, connector, signed Scanner Release, DesignChangeSession, repository snapshot, expiry, and budgets. The raw nonce is returned once and only its digest is persisted.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      connectorId: z.string().min(1),
      designChangeSessionId: z.string().min(1),
      scannerReleaseId: z.string().min(1).optional(),
      snapshotIdentity: z.record(z.unknown()),
      repositoryPolicy: z.object({ allowDirtyWorktree: z.boolean(), ignorePatterns: z.array(z.string()) }).optional(),
      evidencePolicy: z.record(z.unknown()).optional(),
      parserPolicy: z.record(z.unknown()).optional(),
      budgets: z.object({
        maxObservationsPerBatch: z.number().int().positive().optional(),
        maxBatchBytes: z.number().int().positive().optional(),
        maxExcerptBytes: z.number().int().positive().optional(),
        maxSourceFileBytes: z.number().int().positive().optional(),
        maxObservationsPerSession: z.number().int().positive().optional()
      }).optional(),
      expiresAt: z.string().datetime().optional()
    },
    permissions: ["knowledge:write", "asset:read"],
    readOnly: false
  }, startKnowledgeScan);

  registerJsonTool(server, "get_scanner_release", {
    title: "Get authorized Scanner Release",
    description: "Returns the signed Scanner Release selected by a persisted Scan Session after checking the caller's Scope equality assertion, actor binding, release status, expiry, and configured trust bundle.",
    inputSchema: { architectureScope: architectureScopeSchema, sessionId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, getScannerRelease);

  registerJsonTool(server, "get_scan_checkpoint", {
    title: "Get scan checkpoint",
    description: "Returns the persisted sequence, digest, count, and state for one opaque Scan Session. Scope is derived from the Session and the client value is an equality assertion only.",
    inputSchema: { architectureScope: architectureScopeSchema, sessionId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, getScanCheckpoint);

  registerJsonTool(server, "submit_scan_batch", {
    title: "Submit resumable scan batch",
    description: "Validates and atomically persists one hash-chained scan batch, its source-minimized observations, and the exact-Scope Session checkpoint. Identical retries are idempotent and conflicting sequence reuse is rejected.",
    inputSchema: { architectureScope: architectureScopeSchema, batch: z.record(z.unknown()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => submitScanBatch(input as unknown as Parameters<typeof submitScanBatch>[0]));

  registerJsonTool(server, "finalize_knowledge_scan", {
    title: "Finalize governed knowledge scan",
    description: "Verifies the final digest, repository snapshot, counts, coverage, signed release policy, actor binding, expiry, and exact Scope before moving a Scan Session to analysis or blocked review.",
    inputSchema: { architectureScope: architectureScopeSchema, sessionId: z.string().min(1), finalization: z.record(z.unknown()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => finalizeKnowledgeScan(input as unknown as Parameters<typeof finalizeKnowledgeScan>[0]));

  registerJsonTool(server, "submit_scan_report", {
    title: "Submit local scan report",
    description: "Accepts a deterministic, source-minimized local scanner report through the exact-Scope MCP boundary and persists its observations as candidates.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), connectorId: z.string().min(1), designChangeSessionId: z.string().min(1), report: z.record(z.unknown()) },
    permissions: ["knowledge:write", "asset:write"],
    readOnly: false
  }, async (input) => submitScanReport(input as unknown as Parameters<typeof submitScanReport>[0]));

  registerJsonTool(server, "generate_knowledge_candidates", {
    title: "Generate semantic knowledge candidates",
    description: "Compatibility/test-only MockAI path for persisted legacy ScanReports. Production Agents must use submit_semantic_candidate_batch and assemble_knowledge_review_bundle. It never promotes facts or publishes a baseline.",
    inputSchema: { architectureScope: architectureScopeSchema, scanReportId: z.string().min(1), provider: z.string().min(1).optional() },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => generateKnowledgeCandidates(input as unknown as Parameters<typeof generateKnowledgeCandidates>[0]));

  registerJsonTool(server, "submit_semantic_candidate_batch", {
    title: "Submit semantic candidate batch",
    description: "Accepts a bounded provider-neutral Agent candidate batch for a persisted governed Scan Session. Scope and generator identity are derived server-side; identical retries are idempotent.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      batch: z.object({
        sessionId: z.string().min(1),
        sequence: z.number().int().min(0),
        previousBatchDigest: z.string().min(1).optional(),
        complete: z.boolean(),
        provenance: z.object({ agent: z.string().min(1), model: z.string().min(1).optional(), tool: z.string().min(1).optional(), runId: z.string().min(1).optional() }),
        candidates: z.array(semanticCandidateSchema).min(1).max(100)
      })
    },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => submitSemanticCandidateBatch(input as unknown as Parameters<typeof submitSemanticCandidateBatch>[0]));

  registerJsonTool(server, "assemble_knowledge_review_bundle", {
    title: "Assemble semantic candidate ReviewBundle",
    description: "Derives complete coverage, bilingual/evidence/identity blockers, and maximum T0-T3 risk from persisted exact-Scope Agent candidates; caller-supplied risk is not accepted.",
    inputSchema: { architectureScope: architectureScopeSchema, sessionId: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, assembleKnowledgeReviewBundle);

  registerJsonTool(server, "match_knowledge_identities", {
    title: "Match knowledge identities",
    description: "Matches persisted scan observations to existing design assets in the same exact Scope and creates auditable IdentityCandidates. Ambiguous and unmatched results block the ReviewBundle; no asset is merged automatically.",
    inputSchema: { architectureScope: architectureScopeSchema, scanReportId: z.string().min(1) },
    permissions: ["knowledge:write", "asset:read"],
    readOnly: false
  }, async (input) => matchKnowledgeIdentities(input as unknown as Parameters<typeof matchKnowledgeIdentities>[0]));

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
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), designChangeSessionId: z.string().min(1), riskTier: z.enum(["T0", "T1", "T2", "T3"]), assertionIds: z.array(z.string()), identityCandidateIds: z.array(z.string()), architectureFactRevisionIds: z.array(z.string()).optional(), evidenceRefs: z.array(z.string()).min(1), coverage: z.object({ totalSources: z.number().int().min(0), processedSources: z.number().int().min(0), supportedSources: z.number().int().min(0), candidateCount: z.number().int().min(0), complete: z.boolean() }), blockingIssues: z.array(z.string()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, createKnowledgeReviewBundle);

  registerJsonTool(server, "decide_knowledge_review_bundle", {
    title: "Decide knowledge ReviewBundle",
    description: "Records an auditable MCP-only promotion decision. Approval marks selected assertions and identity candidates accepted for a later ChangeSet.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), reviewBundleId: z.string().min(1), decision: z.enum(["APPROVE", "REJECT"]), approvedAssertionIds: z.array(z.string()), approvedIdentityCandidateIds: z.array(z.string()), approvedArchitectureFactRevisionIds: z.array(z.string()).optional(), evidenceRefs: z.array(z.string()).min(1), reason: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, decideKnowledgeReviewBundle);

  registerJsonTool(server, "submit_3a_architecture_fact_batch", {
    title: "Submit 3A architecture fact batch",
    description: "Persists a bounded bilingual BIZ/SYS/TECH architecture-fact candidate batch in the exact owning Scope. It validates parentage, memberships, cross-layer mappings, evidence, references, limits, and idempotency before writing PostgreSQL.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      id: z.string().min(1),
      idempotencyKey: z.string().min(1),
      designChangeSessionId: z.string().min(1),
      provenance: z.object({ actor: z.string().min(1), model: z.string().min(1).optional(), tool: z.string().min(1).optional(), runId: z.string().min(1).optional() }),
      evidenceRefs: z.array(z.string()).min(1),
      units: z.array(architectureFactUnitSchema).max(100),
      memberships: z.array(architectureFactMembershipSchema).max(1000),
      mappings: z.array(architectureFactMappingSchema).max(500)
    },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, async (input) => submit3aArchitectureFactBatch(input as unknown as Parameters<typeof submit3aArchitectureFactBatch>[0]));

  registerJsonTool(server, "promote_3a_architecture_facts", {
    title: "Promote 3A architecture facts",
    description: "Promotes reviewed 3A architecture facts into accepted scoped revisions and a monotonic ChangeSet. This path is separate from scan-derived semantic candidate promotion.",
    inputSchema: { architectureScope: architectureScopeSchema, promotionDecisionId: z.string().min(1), streamId: z.string().min(1), evidenceRefs: z.array(z.string()).min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, async (input) => promote3aArchitectureFacts(input as unknown as Parameters<typeof promote3aArchitectureFacts>[0]));

  registerJsonTool(server, "promote_knowledge_candidates", {
    title: "Promote reviewed knowledge candidates",
    description: "Atomically materializes one approved ReviewBundle into immutable design revisions, typed relationships, evidence, outbox events, and a monotonic ChangeSet.",
    inputSchema: { architectureScope: architectureScopeSchema, promotionDecisionId: z.string().min(1), streamId: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, promoteKnowledgeCandidates);

    registerJsonTool(server, "reconcile_knowledge_baseline", {
    title: "Reconcile promoted knowledge",
    description: "Reconciles a promotion receipt against exact-Scope PostgreSQL state and durably records the governance receipt required for Baseline publication.",
    inputSchema: { architectureScope: architectureScopeSchema, promotionReceiptId: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
    }, reconcileKnowledgeBaseline);

    registerJsonTool(server, "reconcile_3a_architecture_facts", {
      title: "Reconcile 3A architecture facts",
      description: "Reconciles accepted 3A architecture-fact revisions against their exact-Scope ChangeSet and records the converged receipt required for Baseline publication.",
      inputSchema: { architectureScope: architectureScopeSchema, promotionReceiptId: z.string().min(1) },
      permissions: ["knowledge:write", "governance:run"],
      readOnly: false
    }, async (input) => reconcile3aArchitectureFacts(input as Parameters<typeof reconcile3aArchitectureFacts>[0]));

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
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), streamId: z.string().min(1), assetRevisionIds: z.array(z.string()), relationshipRevisionIds: z.array(z.string()), architectureFactRevisionIds: z.array(z.string()).optional(), evidenceRefs: z.array(z.string()), promotionDecisionId: z.string().min(1) },
    permissions: ["knowledge:write", "governance:run"],
    readOnly: false
  }, commitKnowledgeChangeSet);

  registerJsonTool(server, "publish_knowledge_baseline", {
    title: "Publish knowledge baseline",
    description: "Publishes an immutable scoped Baseline only after a converged reconciliation result.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), streamId: z.string().min(1), changeSetId: z.string().min(1), sourceRevisionIds: z.array(z.string()), architectureFactRevisionIds: z.array(z.string()).optional(), relationshipVersion: z.string().min(1), reconciliationReceiptId: z.string().min(1) },
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

  registerJsonTool(server, "request_3a_projection_build", {
    title: "Request 3A projection build",
    description: "Creates or returns an idempotent exact-Scope asynchronous PostgreSQL 3A projection build.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      profileId: z.string().min(1),
      profileVersion: z.string().min(1),
      projectionSchemaVersion: z.literal("3a.v2"),
      query: z.record(z.unknown()).optional()
    },
    permissions: ["knowledge:write"],
    readOnly: false
  }, requestProjectionBuild);

  registerJsonTool(server, "get_3a_projection_build", {
    title: "Get 3A projection build",
    description: "Returns sanitized asynchronous 3A projection build status, counts, publication, and diagnostic reference.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, getProjectionBuild);

  registerJsonTool(server, "request_3a_coverage_build", {
    title: "Request 3A coverage build",
    description: "Creates or returns an idempotent exact-Scope immutable 3A semantic-coverage build pinned to catalog and relationship waterlines.",
    inputSchema: { architectureScope: architectureScopeSchema, baselineId: z.string().min(1), generationId: z.string().min(1), profileId: z.string().min(1), profileVersion: z.string().min(1), coverageSchemaVersion: z.string().min(1), query: z.record(z.unknown()) },
    permissions: ["knowledge:write"],
    readOnly: false
  }, async (input) => requestCoverageBuild(input as Parameters<typeof requestCoverageBuild>[0]));

  registerJsonTool(server, "get_3a_coverage_build", {
    title: "Get 3A coverage build",
    description: "Returns bounded exact-Scope 3A semantic-coverage build status and immutable waterline diagnostics.",
    inputSchema: { architectureScope: architectureScopeSchema, jobId: z.string().min(1).optional(), buildKey: z.string().min(1).optional() },
    permissions: ["knowledge:read"],
    readOnly: true
  }, async (input) => getCoverageBuild(input as unknown as Parameters<typeof getCoverageBuild>[0]));

  registerJsonTool(server, "get_3a_coverage_report", {
    title: "Get 3A coverage report",
    description: "Reads bounded exact-Scope immutable 3A coverage rows with role, status, reason, path evidence, and freshness.",
    inputSchema: { architectureScope: architectureScopeSchema, generationId: z.string().min(1).optional(), role: z.enum(["MEMBERSHIP", "TRACEABILITY", "EXEMPTION"]).optional(), status: z.enum(["COVERED", "BLOCKED", "NOT_EVALUATED"]).optional(), assetType: z.string().min(1).optional(), reasonCode: z.string().min(1).optional(), limit: z.number().int().min(1).max(200).optional(), cursor: z.string().min(1).optional() },
    permissions: ["knowledge:read"],
    readOnly: true
  }, async (input) => get3aCoverageReport(input as unknown as Parameters<typeof get3aCoverageReport>[0]));

  registerJsonTool(server, "list_3a_published_baselines", {
    title: "List 3A published baselines",
    description: "Lists official immutable baselines available for 3A navigation in the exact authorized application-service Scope.",
    inputSchema: { architectureScope: architectureScopeSchema },
    permissions: ["knowledge:read"],
    readOnly: true
  }, list3aPublishedBaselines);

  registerJsonTool(server, "list_3a_projection_manifests", {
    title: "List 3A projection manifests",
    description: "Lists published versioned 3A projection manifests for one official baseline in the exact authorized Scope.",
    inputSchema: { architectureScope: architectureScopeSchema, baselineId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, list3aProjectionManifests);

  registerJsonTool(server, "search_3a_architecture_facts", {
    title: "Search 3A architecture facts",
    description: "Searches the published PostgreSQL 3A read model with bounded pagination and optional BIZ, SYS, or TECH filtering.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      query: z.string().max(200).optional(),
      layer: z.enum(["BIZ", "SYS", "TECH"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      cursor: z.string().min(1).optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, search3aArchitectureFacts);

  registerJsonTool(server, "search_3a_architecture_map", {
    title: "Search 3A architecture map",
    description: "Reads bounded governed BIZ, SYS, and TECH architecture-unit projections from one exact published Scope, Baseline, and Projection Manifest. Empty derived projections are reported explicitly; no semantic facts are written.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      filters: z.object({
        layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).optional(),
        kinds: z.array(z.enum(["CAPABILITY", "PROCESS", "BUSINESS_OBJECT", "APPLICATION", "SERVICE", "COMPONENT", "DATA_DOMAIN", "PLATFORM", "RUNTIME", "INFRASTRUCTURE", "TECHNOLOGY_SERVICE"])).optional(),
        mappingFamilies: z.array(z.string().min(1)).optional(),
        minCriticality: z.number().min(0).max(1).optional(),
        minCompleteness: z.number().min(0).max(1).optional(),
        includeUnclassified: z.boolean().optional(),
        query: z.string().max(200).optional()
      }).optional(),
      budget: z.object({
        maxUnitsPerLayer: z.number().int().positive().optional(),
        maxMappings: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxPayloadBytes: z.number().int().positive().optional()
      }).partial().optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, search3aArchitectureMap);

  registerJsonTool(server, "search_3a_asset_mappings", {
    title: "Search 3A asset mappings",
    description: "Reads bounded exact-Scope mappings from design assets to governed BIZ, SYS, or TECH architecture units. DIRECT is authored; TRACE is derived.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      filters: z.object({ assetType: z.string().min(1).max(64).optional(), assetId: z.string().min(1).max(256).optional(), layer: z.enum(["BIZ", "SYS", "TECH"]).optional(), unitIdentity: z.string().startsWith("unit:").max(256).optional(), mappingMode: z.enum(["DIRECT", "TRACE", "EXEMPT", "BLOCKED"]).optional(), query: z.string().max(200).optional() }).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      cursor: z.string().min(1).optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, search3aAssetMappings);

  registerJsonTool(server, "get_3a_asset_mapping", {
    title: "Get 3A asset mapping",
    description: "Returns one exact design-asset-to-3A mapping, including its target unit, mapping mode, evidence path, generation identity, and diagnostics.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      assetType: z.string().min(1).max(64),
      assetId: z.string().min(1).max(256)
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, get3aAssetMapping);

  registerJsonTool(server, "search_3a_architecture_realizations", {
    title: "Search 3A architecture realizations",
    description: "Reads unit-to-unit BIZ-to-SYS and SYS-to-TECH realization relationships. This is separate from design-asset-to-3A mapping.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      filters: z.object({ layers: z.array(z.enum(["BIZ", "SYS", "TECH"])).optional(), kinds: z.array(z.enum(["CAPABILITY", "PROCESS", "BUSINESS_OBJECT", "APPLICATION", "SERVICE", "COMPONENT", "DATA_DOMAIN", "PLATFORM", "RUNTIME", "INFRASTRUCTURE", "TECHNOLOGY_SERVICE"])).optional(), mappingFamilies: z.array(z.string().min(1)).optional(), query: z.string().max(200).optional() }).optional(),
      budget: z.object({ maxUnitsPerLayer: z.number().int().positive().optional(), maxMappings: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional(), maxPayloadBytes: z.number().int().positive().optional() }).partial().optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, search3aArchitectureRealizations);

  registerJsonTool(server, "get_3a_architecture_unit_neighborhood", {
    title: "Get 3A architecture unit neighborhood",
    description: "Reads a bounded exact-generation neighborhood for one governed 3A architecture unit, including mapped units, members, same-layer dependencies, and derived evidence metadata.",
    inputSchema: {
      identity: z.object({
        architectureScope: architectureScopeSchema,
        generationId: z.string().min(1),
        baselineId: z.string().min(1),
        projectionManifestId: z.string().min(1)
      }),
      unitIdentity: z.string().min(1),
      direction: z.enum(["upstream", "downstream", "both"]),
      depth: z.number().int().min(1).max(5),
      memberAssetTypes: z.array(z.string().min(1)).optional(),
      mappingFamilies: z.array(z.string().min(1)).optional(),
      budget: z.object({
        maxUnitsPerLayer: z.number().int().positive().optional(),
        maxMappings: z.number().int().positive().optional(),
        timeoutMs: z.number().int().positive().optional(),
        maxPayloadBytes: z.number().int().positive().optional()
      }).partial().optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, get3aArchitectureUnitNeighborhood);

  registerJsonTool(server, "query_3a_architecture_map", {
    title: "Query 3A architecture map",
    description: "Runs the bounded, versioned architecture-map query service for an exact Scope, generation, baseline, and projection.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      generationId: z.string().min(1),
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      filter: z.record(z.unknown()).optional(),
      budget: z.record(z.unknown()).optional(),
      continuation: z.string().min(1).optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, query3aArchitectureMap);

  registerJsonTool(server, "query_3a_architecture_unit_neighborhood", {
    title: "Query 3A architecture unit neighborhood",
    description: "Runs the bounded unit drill-down query with typed mappings, members, same-layer dependencies, and exact-generation evidence.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      generationId: z.string().min(1),
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      unitIdentity: z.string().startsWith("unit:"),
      direction: z.enum(["upstream", "downstream", "both"]),
      depth: z.number().int().min(1).max(3),
      memberAssetTypes: z.array(z.string().min(1)).optional(),
      mappingFamilies: z.array(z.string().min(1)).optional(),
      budget: z.record(z.unknown()).optional(),
      continuation: z.string().min(1).optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, query3aArchitectureUnitNeighborhood);

  registerJsonTool(server, "trace_3a_architecture_path", {
    title: "Trace 3A architecture path",
    description: "Traces bounded upstream, downstream, or bidirectional paths over the published 3A relationship projection with a signed continuation cursor.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      baselineId: z.string().min(1),
      projectionManifestId: z.string().min(1),
      startAssertionId: z.string().min(1),
      direction: z.enum(["upstream", "downstream", "both"]).optional(),
      budget: z.object({ maxDepth: z.number().int().positive().optional(), maxNodes: z.number().int().positive().optional(), maxEdges: z.number().int().positive().optional(), maxPaths: z.number().int().positive().optional(), timeoutMs: z.number().int().positive().optional(), maxPayloadBytes: z.number().int().positive().optional() }).partial().optional(),
      continuation: z.string().min(1).optional()
    },
    permissions: ["knowledge:read"],
    readOnly: true
  }, trace3aArchitecturePath);

  registerJsonTool(server, "get_3a_architecture_fact", {
    title: "Get 3A architecture fact",
    description: "Returns one published architecture fact with bilingual content, evidence, unresolved questions, and typed incoming/outgoing edges.",
    inputSchema: { architectureScope: architectureScopeSchema, baselineId: z.string().min(1), projectionManifestId: z.string().min(1), assertionId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, get3aArchitectureFact);

  registerJsonTool(server, "get_3a_alignment", {
    title: "Get 3A alignment",
    description: "Returns explicit cross-layer relationships from the published 3A projection and reports alignment warnings.",
    inputSchema: { architectureScope: architectureScopeSchema, baselineId: z.string().min(1), projectionManifestId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, get3aAlignment);

  registerJsonTool(server, "compare_3a_published_baselines", {
    title: "Compare 3A published baselines",
    description: "Compares two official published 3A baselines using immutable versioned nodes and edges; current assertion sets are not accepted.",
    inputSchema: { architectureScope: architectureScopeSchema, baseBaselineId: z.string().min(1), targetBaselineId: z.string().min(1), baseProjectionManifestId: z.string().min(1), targetProjectionManifestId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, compare3aPublishedBaselines);

  registerJsonTool(server, "derive_3a_knowledge_projection", {
    title: "Derive deterministic 3A knowledge projection",
    description: "Legacy compatibility read. Reads one published Baseline and its accepted exact-Scope facts from PostgreSQL, then derives reproducible BIZ, SYS, TECH, alignment, drift, and pinned Context Pack output without creating authoritative facts. New clients must use versioned 3A projection build and query tools.",
    inputSchema: { architectureScope: architectureScopeSchema, baselineId: z.string().min(1), currentAssertionIds: z.array(z.string()).optional() },
    permissions: ["knowledge:read"],
    readOnly: true
  }, deriveScopedKnowledgeProjection);

  registerJsonTool(server, "list_knowledge_assertions", {
    title: "List knowledge assertions",
    description: "Lists BIZ, SYS, and TECH assertions inside one authorized application-service scope.",
    inputSchema: { applicationServiceId: z.string().min(1) },
    permissions: ["knowledge:read"],
    readOnly: true
  }, async (input) => listKnowledgeAssertions(input.applicationServiceId));

  registerJsonTool(server, "create_requirement_assessment", {
    title: "Create requirement assessment",
    description: "Queues an evidence-driven requirement assessment in one exact application-service Scope. The run is durable and asynchronous; it does not authorize implementation.",
    inputSchema: {
      architectureScope: architectureScopeSchema,
      requirementId: z.string().min(1).max(200),
      revision: z.number().int().positive(),
      intent: z.object({ en: z.string().min(1), zh: z.string().min(1) }),
      acceptanceCriteria: z.array(z.object({ en: z.string().min(1), zh: z.string().min(1) })).optional(),
      qualityTargets: z.array(z.object({ en: z.string().min(1), zh: z.string().min(1) })).optional(),
      constraints: z.array(z.object({ en: z.string().min(1), zh: z.string().min(1) })).optional(),
      exclusions: z.array(z.object({ en: z.string().min(1), zh: z.string().min(1) })).optional(),
      idempotencyKey: z.string().min(1).max(256),
      authorId: z.string().min(1).optional()
    },
    permissions: ["asset:write"],
    readOnly: false
  }, createRequirementAssessment);

  registerJsonTool(server, "get_requirement_assessment", {
    title: "Get requirement assessment",
    description: "Reads one durable requirement assessment run and its report from the exact authorized application-service Scope.",
    inputSchema: { architectureScope: architectureScopeSchema, runId: z.string().min(1) },
    permissions: ["asset:read"],
    readOnly: true
  }, getRequirementAssessment);

  registerJsonTool(server, "list_requirement_assessments", {
    title: "List requirement assessments",
    description: "Lists requirement assessment runs and immutable report revisions within one exact authorized Scope.",
    inputSchema: { architectureScope: architectureScopeSchema },
    permissions: ["asset:read"],
    readOnly: true
  }, listRequirementAssessments);

  registerJsonTool(server, "cancel_requirement_assessment", {
    title: "Cancel requirement assessment",
    description: "Requests cancellation of one queued or running requirement assessment in the exact authorized Scope.",
    inputSchema: { architectureScope: architectureScopeSchema, runId: z.string().min(1) },
    permissions: ["asset:write"],
    readOnly: false
  }, cancelRequirementAssessment);

  registerJsonTool(server, "accept_requirement_assessment", {
    title: "Accept requirement assessment",
    description: "Accepts only a reviewed, non-blocked assessment. Acceptance does not authorize implementation.",
    inputSchema: { architectureScope: architectureScopeSchema, assessmentId: z.string().min(1), idempotencyKey: z.string().min(1).max(256) },
    permissions: ["asset:write"],
    readOnly: false
  }, acceptRequirementAssessment);

  registerJsonTool(server, "record_assessment_execution_actual", {
    title: "Record assessment execution actual",
    description: "Records observed agent execution usage and changed assets for later calibration in one exact Scope.",
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), requirementId: z.string().min(1), assessmentId: z.string().min(1), runId: z.string().optional(), executionProfileId: z.string().min(1), modelRevisions: z.unknown().optional(), usageDetails: z.unknown().optional(), toolInvocations: z.unknown().optional(), verificationCycles: z.number().int().nonnegative().optional(), failedAttempts: z.number().int().nonnegative().optional(), humanIntervention: z.unknown().optional(), elapsedAgentSeconds: z.number().int().nonnegative().optional(), actualPersonDays: z.number().nonnegative().optional(), changedAssets: z.unknown().optional(), finalStatus: z.string().min(1), contentDigest: z.string().min(1) },
    permissions: ["asset:write"],
    readOnly: false
  }, recordAssessmentExecutionActual);

  registerJsonTool(server, "create_assessment_proposal_draft", {
    title: "Create assessment Proposal draft",
    description: "Creates a Proposal draft and a typed link only after the assessment is accepted; all writes remain within MCP.",
    inputSchema: { architectureScope: architectureScopeSchema, assessmentId: z.string().min(1), idempotencyKey: z.string().min(1).max(256), proposal: z.object({ id: z.string().min(1), name: z.string().min(1), description: z.string().min(1), title: z.string().min(1), background: z.string(), goal: z.string(), nonGoal: z.string(), scope: z.string(), impactedAssets: z.array(z.object({ type: z.string(), id: z.string(), label: z.string() })), specChanges: z.array(z.string()), risks: z.array(z.string()), rolloutPlan: z.string(), rollbackPlan: z.string().optional(), status: z.enum(["draft", "reviewing", "approved", "implemented", "archived"]), localizedContent: z.unknown().optional() }) },
    permissions: ["asset:write"],
    readOnly: false
  }, (input) => createAssessmentProposalDraft(input as Parameters<typeof createAssessmentProposalDraft>[0]));

  registerJsonTool(server, "create_assessment_context_pack_draft", {
    title: "Create assessment Context Pack draft",
    description: "Creates a Context Pack draft and typed link for an accepted assessment through MCP.",
    inputSchema: { architectureScope: architectureScopeSchema, assessmentId: z.string().min(1), idempotencyKey: z.string().min(1).max(256), contextPack: z.object({ id: z.string().min(1), name: z.string().min(1), proposalId: z.string().min(1), targetAgent: z.string().min(1), summary: z.string(), includedAssets: z.array(z.object({ type: z.string(), id: z.string(), label: z.string() })), constraints: z.array(z.string()), instructions: z.array(z.string()), generatedMarkdown: z.string(), localizedContent: z.unknown().optional() }) },
    permissions: ["asset:write"],
    readOnly: false
  }, (input) => createAssessmentContextPackDraft(input as Parameters<typeof createAssessmentContextPackDraft>[0]));
}
