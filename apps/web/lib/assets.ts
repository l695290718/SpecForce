import {
  assetCollections,
  analyzeProposalImpact,
  buildAssetGraph,
  generateContextPack,
  localizeAsset,
  renderAssetAsMarkdown,
  renderAssetSummary,
  runGovernanceChecks,
  searchDesignAssets,
  type Asset,
  type AssetGraph,
  type AssetLocale,
  type AssetType,
  type AssetTypeMap,
  type SpecForgeDataStore
} from "@specforge/core";
import type { ContextPack, DomainModel, Proposal } from "@specforge/core";
import type { MessageKey } from "./i18n";
import { prisma } from "./db";
import { requireReadableApplicationService, scopeDatabaseWhere } from "./scope";
export { buildScopedGraphAssetHref } from "./graph-links";

export const routeAssetTypes = {
  domains: "domain",
  "data-models": "dataModel",
  apis: "api",
  events: "event",
  rules: "businessRule",
  "state-machines": "stateMachine",
  integrations: "integration",
  quality: "quality",
  observability: "observability",
  adrs: "adr"
} as const;

export type AssetRouteType = keyof typeof routeAssetTypes;

export type ScopedAssetLink = {
  id: string;
  sourceType: AssetType;
  sourceId: string;
  targetType: AssetType;
  targetId: string;
  relationType: string;
  description?: string | null;
};

export type ScopedAssetCatalog = SpecForgeDataStore & { assetLinks: ScopedAssetLink[] };

export const assetTitles: Record<AssetRouteType, string> = {
  domains: "Domain Models",
  "data-models": "Data Models",
  apis: "API Contracts",
  events: "Event Contracts",
  rules: "Business Rules",
  "state-machines": "State Machines",
  integrations: "Integration Contracts",
  quality: "Quality Requirements",
  observability: "Observability Designs",
  adrs: "Architecture Decision Records"
};

export const assetTitleKeys: Record<AssetRouteType, MessageKey> = {
  domains: "asset.domains",
  "data-models": "asset.dataModels",
  apis: "asset.apis",
  events: "asset.events",
  rules: "asset.rules",
  "state-machines": "asset.stateMachines",
  integrations: "asset.integrations",
  quality: "asset.quality",
  observability: "asset.observability",
  adrs: "asset.adrs"
};

export function routeToAssetType(route: string): AssetType {
  const assetType = routeAssetTypes[route as AssetRouteType];
  if (!assetType) throw new Error(`Unknown asset route: ${route}`);
  return assetType;
}

export async function getRouteAssetsWithDatabase(route: string, scopeId: string, locale: AssetLocale = "en"): Promise<Asset[]> {
  const assetType = routeToAssetType(route);
  return getDatabaseAssets(assetType, scopeId, locale);
}

export async function getScopedAssetCatalog(scopeId: string): Promise<ScopedAssetCatalog> {
  const scope = requireReadableApplicationService(scopeId);
  const where = scopeDatabaseWhere(scope);
  const [assetRows, proposalRows, contextPackRows, assetLinks] = await Promise.all([
    prisma.designAsset.findMany({ where, orderBy: { createdAt: "asc" } }),
    prisma.proposal.findMany({ where, orderBy: { createdAt: "asc" } }),
    prisma.contextPack.findMany({ where, orderBy: { createdAt: "asc" } }),
    prisma.assetLink.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, sourceType: true, sourceId: true, targetType: true, targetId: true, relationType: true, description: true }
    })
  ]);
  const catalog = emptyCatalog() as ScopedAssetCatalog;
  for (const row of assetRows) {
    const type = row.type as AssetType;
    const collection = assetCollections[type];
    if (collection && type !== "proposal" && type !== "contextPack") {
      (catalog[collection] as Asset[]).push(JSON.parse(row.payload) as Asset);
    }
  }
  catalog.proposals = proposalRows.map((row) => JSON.parse(row.payload) as Proposal);
  catalog.contextPacks = contextPackRows.map((row) => parseContextPackPayload(row.payload) ?? contextPackFromLegacyRow(row));
  catalog.assetLinks = assetLinks as ScopedAssetLink[];
  return catalog;
}

export async function searchScopedAssets<TType extends AssetType>(assetType: TType, scopeId: string, query: string, locale: AssetLocale) {
  const catalog = await getScopedAssetCatalog(scopeId);
  const { results } = await searchDesignAssets({ query, assetTypes: [assetType], limit: 50 }, { catalog, locale });
  return results.map((result) => ({
    ...result,
    asset: localizeAsset(assetType, (catalog[assetCollections[assetType]] as Asset[]).find((asset) => asset.id === result.id)!, locale) as AssetTypeMap[TType]
  }));
}

export async function getScopedAssetGraph(
  scopeId: string,
  domainId?: string,
  assetType?: AssetType,
  locale: AssetLocale = "en"
): Promise<AssetGraph> {
  const catalog = await getScopedAssetCatalog(scopeId);
  const graph = await buildAssetGraph(domainId, assetType, { catalog, locale });
  const nodeByRef = new Map(graph.nodes.map((node) => [`${node.type}:${node.logicalId ?? node.id}`, node.id]));
  const linkedEdges = catalog.assetLinks.flatMap((link) => {
    const source = nodeByRef.get(`${link.sourceType}:${link.sourceId}`);
    const target = nodeByRef.get(`${link.targetType}:${link.targetId}`);
    if (!source || !target) return [];
    return [{
      id: `db:${link.id}`,
      source,
      target,
      sourceLogicalId: link.sourceId,
      targetLogicalId: link.targetId,
      label: link.relationType,
      applicationServiceId: scopeId
    }];
  });
  return {
    ...graph,
    edges: dedupeById([...graph.edges, ...linkedEdges]).map((edge) => ({
      ...edge,
      label: localizeGraphEdgeLabel(edge.label, locale)
    }))
  };
}

function localizeGraphEdgeLabel(label: string, locale: AssetLocale): string {
  if (locale === "en") return label;
  return ({
    "owns model": "拥有模型",
    "provides api": "提供 API",
    "emits event": "发布事件",
    governs: "治理",
    "controls state": "控制状态",
    integrates: "集成",
    verifies: "验证",
    observes: "观测",
    decides: "决策",
    impacts: "影响",
    includes: "包含",
    generates: "生成",
    depends_on: "依赖",
    governed_by: "受规则治理"
  } as Record<string, string>)[label] ?? label;
}

export async function getScopedAssetDetail(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  const canonical = (catalog[assetCollections[assetType]] as Asset[]).find((asset) => asset.id === assetId);
  if (!canonical) throw new Error(`Asset not found: ${assetType}/${assetId}`);
  const options = { catalog, locale };
  const [summary, markdown, governance] = await Promise.all([
    renderAssetSummary(assetType, assetId, options),
    renderAssetAsMarkdown(assetType, assetId, options),
    runGovernanceChecks(assetType, assetId, options)
  ]);
  return { asset: localizeAsset(assetType, canonical, locale), summary, markdown, governance };
}

export async function getScopedProposalImpact(proposalId: string, scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  return analyzeProposalImpact(proposalId, { catalog, locale });
}

export async function generateScopedContextPack(proposalId: string, scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  return generateContextPack(proposalId, { catalog, locale });
}

export async function getScopedGovernanceChecks(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  return runGovernanceChecks(assetType, assetId, { catalog, locale });
}

export async function getScopedGovernanceOverview(scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  const targetTypes: AssetType[] = ["api", "event", "dataModel", "businessRule", "proposal"];
  const targets = targetTypes.flatMap((type) =>
    (catalog[assetCollections[type]] as Asset[]).map((asset) => ({ type, id: asset.id }))
  );
  return (await Promise.all(targets.map((target) => runGovernanceChecks(target.type, target.id, { catalog, locale })))).flat();
}

export async function renderScopedAssetSummary(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  return renderAssetSummary(assetType, assetId, { catalog, locale });
}

export async function renderScopedAssetMarkdown(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en") {
  const catalog = await getScopedAssetCatalog(scopeId);
  return renderAssetAsMarkdown(assetType, assetId, { catalog, locale });
}

function emptyCatalog(): SpecForgeDataStore {
  return {
    domains: [], dataModels: [], apis: [], events: [], businessRules: [], stateMachines: [], integrations: [],
    qualityRequirements: [], observabilityDesigns: [], adrs: [], proposals: [], contextPacks: []
  };
}

export async function getRouteAssetWithDatabase(route: string, id: string, scopeId: string, locale: AssetLocale = "en"): Promise<Asset> {
  const assetType = routeToAssetType(route);
  const dbAssets = await getDatabaseAssets(assetType, scopeId, locale);
  const dbAsset = dbAssets.find((asset) => asset.id === id);
  if (dbAsset) return dbAsset;
  throw new Error(`Asset not found: ${assetType}/${id}`);
}

export async function getDomainsWithDatabase(scopeId: string, locale: AssetLocale = "en"): Promise<DomainModel[]> {
  return (await getRouteAssetsWithDatabase("domains", scopeId, locale)) as DomainModel[];
}

export async function getGovernanceTargetsWithDatabase(scopeId: string): Promise<Array<{ type: AssetType; id: string }>> {
  const [apis, events, dataModels, businessRules, proposals] = await Promise.all([
    getRouteAssetsWithDatabase("apis", scopeId),
    getRouteAssetsWithDatabase("events", scopeId),
    getRouteAssetsWithDatabase("data-models", scopeId),
    getRouteAssetsWithDatabase("rules", scopeId),
    getProposalsWithDatabase(scopeId)
  ]);
  return [
    ...apis.map((asset) => ({ type: "api" as AssetType, id: asset.id })),
    ...events.map((asset) => ({ type: "event" as AssetType, id: asset.id })),
    ...dataModels.map((asset) => ({ type: "dataModel" as AssetType, id: asset.id })),
    ...businessRules.map((asset) => ({ type: "businessRule" as AssetType, id: asset.id })),
    ...proposals.map((proposal) => ({ type: "proposal" as AssetType, id: proposal.id }))
  ];
}

export async function getProposalsWithDatabase(scopeId: string, locale: AssetLocale = "en"): Promise<Proposal[]> {
  const scope = requireReadableApplicationService(scopeId);
  const rows = await prisma.proposal.findMany({ where: scopeDatabaseWhere(scope), orderBy: { createdAt: "asc" } });
  return rows.map((row) => localizeAsset("proposal", JSON.parse(row.payload) as Proposal, locale));
}

export async function getProposalWithDatabase(id: string, scopeId: string, locale: AssetLocale = "en"): Promise<Proposal> {
  const scope = requireReadableApplicationService(scopeId);
  const row = await prisma.proposal.findFirst({ where: { id, ...scopeDatabaseWhere(scope) } });
  if (row) return localizeAsset("proposal", JSON.parse(row.payload) as Proposal, locale);
  throw new Error(`Proposal not found: ${id}`);
}

export async function getContextPacksWithDatabase(scopeId: string, locale: AssetLocale = "en"): Promise<ContextPack[]> {
  const scope = requireReadableApplicationService(scopeId);
  const rows = await prisma.contextPack.findMany({ where: scopeDatabaseWhere(scope), orderBy: { createdAt: "asc" } });
  return rows.map((row) => localizeContextPackRow(row, locale));
}

type ContextPackRow = {
  id: string;
  name: string;
  proposalId: string;
  targetAgent: string;
  summary: string;
  includedAssets: string;
  constraints: string;
  instructions: string;
  generatedMarkdown: string;
  createdAt: Date;
  payload: string | null;
};

function localizeContextPackRow(row: ContextPackRow, locale: AssetLocale): ContextPack {
  const persisted = parseContextPackPayload(row.payload);
  if (!persisted) return contextPackFromLegacyRow(row);
  return localizeAsset("contextPack", persisted, locale);
}

function parseContextPackPayload(payload: string | null): ContextPack | null {
  if (!payload) return null;
  try {
    return JSON.parse(payload) as ContextPack;
  } catch {
    return null;
  }
}

function contextPackFromLegacyRow(row: ContextPackRow): ContextPack {
  return {
    id: row.id,
    name: row.name,
    proposalId: row.proposalId,
    targetAgent: row.targetAgent,
    summary: row.summary,
    includedAssets: JSON.parse(row.includedAssets),
    constraints: JSON.parse(row.constraints),
    instructions: JSON.parse(row.instructions),
    generatedMarkdown: row.generatedMarkdown,
    createdAt: row.createdAt.toISOString()
  };
}

export async function getContextPackWithDatabase(id: string, scopeId: string, locale: AssetLocale = "en"): Promise<ContextPack> {
  const scope = requireReadableApplicationService(scopeId);
  const row = await prisma.contextPack.findFirst({ where: { id, ...scopeDatabaseWhere(scope) } });
  if (row) {
    return localizeContextPackRow(row, locale);
  }
  throw new Error(`Context Pack not found: ${id}`);
}

export async function dashboardStats(scopeId: string) {
  const scope = requireReadableApplicationService(scopeId);
  const dbRows = await prisma.designAsset.findMany({ where: scopeDatabaseWhere(scope), select: { id: true, type: true } });
  return Object.entries(assetCollections)
    .filter(([type]) => !["proposal", "contextPack"].includes(type))
    .map(([type]) => ({
      type,
      count: new Set(dbRows.filter((row) => row.type === type).map((row) => row.id)).size
    }));
}

export async function getAgentServiceWorkspace(applicationServiceId: string, agentId = "specforge-default-agent") {
  requireReadableApplicationService(applicationServiceId);
  return prisma.agentServiceWorkspace.upsert({
    where: { agentType_agentId_applicationServiceId: { agentType: "agent", agentId, applicationServiceId } },
    create: { agentType: "agent", agentId, applicationServiceId },
    update: {}
  });
}

export async function getAssetGraphWithDatabase(scopeId: string, domainId?: string, assetType?: AssetType, locale: AssetLocale = "en"): Promise<AssetGraph> {
  return getScopedAssetGraph(scopeId, domainId, assetType, locale);
}

async function getDatabaseAssets(assetType: AssetType, scopeId: string, locale: AssetLocale): Promise<Asset[]> {
  const scope = requireReadableApplicationService(scopeId);
  const rows = await prisma.designAsset.findMany({
    where: { type: assetType, ...scopeDatabaseWhere(scope) },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => localizeAsset(assetType, JSON.parse(row.payload) as Asset, locale));
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
