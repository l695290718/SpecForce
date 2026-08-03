import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Permission } from "@specforge/core";
import { z } from "zod";
import { auditToolCall } from "./audit";
import { allowAllPolicy, getDefaultActor } from "./auth";
import { deletePersistedDesignData, isSeedMode, listPersistedAssetLinks, searchPersistedDesignAssets, upsertAssetLink, upsertContextPack, upsertDesignAsset, upsertProposal } from "./persistence";
import { commitKnowledgeChangeSet, createIdentityCandidate, createKnowledgeAssertion, createKnowledgeReviewBundle, createProjectionManifest, createWorkingStream, decideKnowledgeReviewBundle, listKnowledgeAssertions, publishKnowledgeBaseline } from "./knowledge/persistence";
import { submitScanReport } from "./scanner/persistence";
import { getScannerRelease } from "./scanner/release";
import { finalizeKnowledgeScan, getScanCheckpoint, startKnowledgeScan } from "./scanner/session";
import { submitScanBatch } from "./scanner/batch-persistence";
import { generateKnowledgeCandidates } from "./knowledge/semantic-persistence";
import { matchKnowledgeIdentities } from "./knowledge/identity-persistence";
import { assembleKnowledgeReviewBundle, submitSemanticCandidateBatch } from "./knowledge/candidate-persistence";
import { promoteKnowledgeCandidates, reconcileKnowledgeBaseline } from "./knowledge/promotion";
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
    inputSchema: { architectureScope: architectureScopeSchema, id: z.string().min(1), streamId: z.string().min(1), changeSetId: z.string().min(1), sourceRevisionIds: z.array(z.string()).min(1), relationshipVersion: z.string().min(1), reconciliationReceiptId: z.string().min(1) },
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
