import {
  analyzeProposalImpact,
  assertWritableApplicationService,
  assetCollections,
  buildAssetGraph,
  defaultHuaweiActor,
  generateContextPack,
  getAsset,
  hasScopeAccess,
  localizeAsset,
  normalizeAssetType,
  renderAssetAsMarkdown,
  renderAssetSummary,
  runGovernanceChecks,
  scopeById,
  seedHuaweiActor
} from "@specforge/core";
import type {
  Asset,
  AssetGraph,
  AssetLocale,
  AssetType,
  ContextPack,
  GovernanceCheckResult,
  Proposal,
  SpecForgeDataStore
} from "@specforge/core";
import {
  listPersistedAssetLinks,
  listPersistedAssets,
  listPersistedContextPacks,
  listPersistedProposals
} from "./persistence";

export interface ScopedDerivedInput {
  applicationServiceId: string;
  locale?: AssetLocale;
}

function emptyCatalog(): SpecForgeDataStore {
  return {
    domains: [],
    dataModels: [],
    apis: [],
    events: [],
    businessRules: [],
    stateMachines: [],
    integrations: [],
    qualityRequirements: [],
    observabilityDesigns: [],
    adrs: [],
    proposals: [],
    contextPacks: []
  };
}

function authorizedScope(applicationServiceId: string, action: "read" | "write") {
  const scope = scopeById(applicationServiceId);
  const actor = process.env.SPECFORGE_MCP_SEED === "1" ? seedHuaweiActor : defaultHuaweiActor;
  if (!scope || scope.level !== "applicationService" || !hasScopeAccess(actor, scope, action)) {
    throw new Error(`Scope ${action} is not authorized.`);
  }
  return action === "write"
    ? assertWritableApplicationService(actor, scope)
    : { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

function assertAssetScope(asset: Asset, applicationServiceId: string, scopePath: string): void {
  if (
    asset.architectureScope?.applicationServiceId !== applicationServiceId ||
    asset.architectureScope.scopePath !== scopePath
  ) {
    throw new Error(`Persisted asset escaped requested scope: ${asset.id}`);
  }
}

export async function loadScopedAssetCatalog(applicationServiceId: string): Promise<SpecForgeDataStore> {
  const scope = authorizedScope(applicationServiceId, "read");
  const [assets, proposals, contextPacks] = await Promise.all([
    listPersistedAssets(applicationServiceId),
    listPersistedProposals(applicationServiceId),
    listPersistedContextPacks(applicationServiceId)
  ]);
  const catalog = emptyCatalog();

  for (const { type, asset } of assets) {
    assertAssetScope(asset, scope.applicationServiceId, scope.scopePath);
    const collection = assetCollections[type];
    (catalog[collection] as Asset[]).push(asset);
  }
  for (const proposal of proposals) {
    assertAssetScope(proposal, scope.applicationServiceId, scope.scopePath);
    catalog.proposals.push(proposal);
  }
  for (const contextPack of contextPacks) {
    assertAssetScope(contextPack, scope.applicationServiceId, scope.scopePath);
    catalog.contextPacks.push(contextPack);
  }

  return catalog;
}

function localizedName(assetType: AssetType, asset: Asset, locale: AssetLocale): string {
  const localized = localizeAsset(assetType, asset, locale) as Asset;
  return "title" in localized && localized.title ? localized.title : localized.name;
}

function governanceStatus(results: GovernanceCheckResult[]): "passed" | "warning" | "failed" {
  if (results.some((result) => result.status === "fail" && result.severity === "error")) return "failed";
  if (results.some((result) => result.status === "fail")) return "warning";
  return "passed";
}

export async function buildScopedAssetGraph(input: ScopedDerivedInput & { domainId?: string; assetType?: AssetType }) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const graph = await buildAssetGraph(input.domainId, input.assetType, { catalog, locale });
  const canonicalGraph = locale === "en"
    ? graph
    : await buildAssetGraph(input.domainId, input.assetType, { catalog, locale: "en" });
  const links = await listPersistedAssetLinks(input.applicationServiceId);
  if (!input.assetType && !input.domainId) {
    for (const canonicalPack of catalog.contextPacks) {
      const pack = localizeAsset("contextPack", canonicalPack, locale);
      graph.nodes.push({
        id: pack.id,
        logicalId: pack.id,
        label: pack.name,
        type: "contextPack",
        summary: pack.summary,
        applicationServiceId: input.applicationServiceId,
        architectureScope: pack.architectureScope
      });
      if (graph.nodes.some((node) => (node.logicalId ?? node.id) === pack.proposalId)) {
        graph.edges.push({
          id: `${pack.proposalId}->${pack.id}:generates`,
          source: pack.proposalId,
          target: pack.id,
          sourceLogicalId: pack.proposalId,
          targetLogicalId: pack.id,
          label: "generates",
          applicationServiceId: input.applicationServiceId,
          architectureScope: pack.architectureScope
        });
      }
    }
  }
  const nodeIds = new Set(graph.nodes.map((node) => node.logicalId ?? node.id));
  const persistedEdges: AssetGraph["edges"] = links
    .filter((link) => nodeIds.has(link.sourceId) && nodeIds.has(link.targetId))
    .map((link) => ({
      id: link.id,
      source: link.sourceId,
      target: link.targetId,
      sourceLogicalId: link.sourceId,
      targetLogicalId: link.targetId,
      label: link.relationType,
      applicationServiceId: input.applicationServiceId,
      architectureScope: link.architectureScope
    }));
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  graph.edges.push(...persistedEdges.filter((edge) => !edgeIds.has(edge.id)));
  return {
    applicationServiceId: input.applicationServiceId,
    locale,
    graph,
    canonicalSource: { graph: canonicalGraph, assets: catalog }
  };
}

export async function analyzeScopedProposalImpact(input: ScopedDerivedInput & { proposalId: string }) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const proposal = getAsset<Proposal>("proposal", input.proposalId, catalog);
  const assets = proposal.impactedAssets.map((ref) => getAsset(ref.type, ref.id, catalog));
  const analysis = await analyzeProposalImpact(input.proposalId, { catalog, locale });
  return { applicationServiceId: input.applicationServiceId, locale, canonicalSource: { proposal, assets }, analysis };
}

export async function runScopedGovernanceChecks(input: ScopedDerivedInput & {
  targetType: "asset" | "proposal" | "context-pack";
  targetId: string;
  assetType?: string;
  checks?: string[];
}) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const assetType = input.targetType === "proposal"
    ? "proposal"
    : input.targetType === "context-pack"
      ? "contextPack"
      : input.assetType
        ? normalizeAssetType(input.assetType)
        : undefined;
  if (!assetType) throw new Error("assetType is required for asset governance checks.");
  const canonicalSource = getAsset(assetType, input.targetId, catalog);
  const raw = await runGovernanceChecks(assetType, input.targetId, { catalog, locale });
  const filtered = input.checks?.length ? raw.filter((result) => input.checks!.includes(result.ruleCode)) : raw;
  return {
    applicationServiceId: input.applicationServiceId,
    locale,
    canonicalSource,
    status: governanceStatus(filtered),
    results: filtered.map((result) => ({
      ruleId: result.ruleCode,
      ruleName: result.ruleName,
      severity: result.severity,
      status: result.status,
      message: result.reason,
      recommendation: result.suggestion,
      messageParams: result.messageParams
    }))
  };
}

export async function generateScopedContextPack(input: ScopedDerivedInput & {
  proposalId: string;
  targetAgent?: string;
  includeAssets?: string[];
}) {
  authorizedScope(input.applicationServiceId, "write");
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const proposal = getAsset<Proposal>("proposal", input.proposalId, catalog);
  const assets = proposal.impactedAssets.map((ref) => getAsset(ref.type, ref.id, catalog));
  const contextPack = await generateContextPack(input.proposalId, {
    catalog,
    locale,
    targetAgent: input.targetAgent,
    includeAssets: input.includeAssets
  });
  return {
    applicationServiceId: input.applicationServiceId,
    locale,
    contextPack,
    canonicalSource: { proposal, assets }
  };
}

export async function renderScopedAssetMarkdown(input: ScopedDerivedInput & {
  assetType: string;
  assetId: string;
}) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const assetType = normalizeAssetType(input.assetType);
  const canonicalSource = getAsset(assetType, input.assetId, catalog);
  const localizedMarkdown = await renderAssetAsMarkdown(assetType, input.assetId, { catalog, locale });
  const content = [
    localizedMarkdown,
    "",
    locale === "zh" ? "## Canonical English Source JSON" : "## Canonical Source JSON",
    "```json",
    JSON.stringify(canonicalSource, null, 2),
    "```"
  ].join("\n");
  return { applicationServiceId: input.applicationServiceId, locale, content, canonicalSource };
}

export async function getScopedAssetDetail(input: ScopedDerivedInput & {
  assetType: string;
  assetId: string;
}) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const assetType = normalizeAssetType(input.assetType);
  const canonicalSource = getAsset(assetType, input.assetId, catalog);
  const asset = localizeAsset(assetType, canonicalSource, locale);
  return { applicationServiceId: input.applicationServiceId, locale, asset, canonicalSource };
}

export async function renderScopedCollectionMarkdown(input: ScopedDerivedInput & { assetType: string }) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const assetType = normalizeAssetType(input.assetType);
  const assets = catalog[assetCollections[assetType]] as Asset[];
  const title = locale === "zh" ? "设计资产目录" : "Design Asset Catalog";
  const lines = await Promise.all(assets.map(async (asset) => {
    const name = localizedName(assetType, asset, locale);
    const summary = await renderAssetSummary(assetType, asset.id, { catalog, locale });
    return `- ${name} (${assetType}/${asset.id})\n  ${summary.replace(/\n/g, "\n  ")}`;
  }));
  const canonicalJson = JSON.stringify(assets, null, 2);
  return {
    applicationServiceId: input.applicationServiceId,
    locale,
    content: [`# ${title}`, "", ...lines, "", "## Canonical Source JSON", "```json", canonicalJson, "```"].join("\n"),
    canonicalSource: assets
  };
}

export async function exportScopedContextPack(input: ScopedDerivedInput & { contextPackId: string }) {
  const locale = input.locale ?? "en";
  const catalog = await loadScopedAssetCatalog(input.applicationServiceId);
  const canonicalSource = getAsset<ContextPack>("contextPack", input.contextPackId, catalog);
  const contextPack = localizeAsset("contextPack", canonicalSource, locale);
  return { applicationServiceId: input.applicationServiceId, locale, contextPack, canonicalSource };
}
