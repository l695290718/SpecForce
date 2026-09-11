import {
  assetCollections,
  analyzeProposalImpact,
  buildAssetGraph,
  generateContextPack,
  renderAssetAsMarkdown,
  renderAssetSummary,
  runGovernanceChecks,
  type Asset,
  type AssetGraph,
  type AssetLocale,
  type AssetType,
  type AssetTypeMap,
  type SpecForgeDataStore
} from "@specforge/core";
import type { ContextPack, DomainModel, Proposal } from "@specforge/core";
import type { ScopedPrincipal } from "@specforge/core";
import type { MessageKey } from "./i18n";
import { prisma } from "./db";
import { requireReadableApplicationService, scopeDatabaseWhere } from "./scope";
import { graphEdgeDisplayLabel } from "./graph-labels";
import { isLegacyTranslationError, safeLocalizeAssetForRead, withLegacyDerivedReadFallback } from "./read-localization";
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

type PersistedScopeColumns = { applicationServiceId: string; scopePath: string };

export type LocalizedAssetGraph = Omit<AssetGraph, "edges"> & {
  edges: Array<AssetGraph["edges"][number] & { displayLabel: string }>;
};

export type ScopedSearchOptions = { limit: number; offset?: number };
export type ScopedSearchResult<TType extends AssetType> = {
  items: Array<{ id: string; type: TType; name: string; summary: string; relevanceReason: string; asset: AssetTypeMap[TType] }>;
  total: number;
  limit: number;
  offset: number;
};

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

export async function getRouteAssetsWithDatabase(route: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<Asset[]> {
  const assetType = routeToAssetType(route);
  return getDatabaseAssets(assetType, scopeId, locale, principal);
}

export async function getScopedAssetCatalog(scopeId: string, principal?: ScopedPrincipal): Promise<ScopedAssetCatalog> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const where = scopeDatabaseWhere(scope);
  const trustedScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
  const [assetRows, proposalRows, contextPackRows, assetLinks] = await Promise.all([
    prisma.designAsset.findMany({ where, orderBy: { createdAt: "asc" } }),
    prisma.proposal.findMany({ where, orderBy: { createdAt: "asc" } }),
    prisma.contextPack.findMany({ where, orderBy: { createdAt: "asc" } }),
    prisma.assetLink.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true, sourceType: true, sourceId: true, targetType: true, targetId: true, relationType: true, description: true,
        applicationServiceId: true, scopePath: true
      }
    })
  ]);
  const catalog = emptyCatalog() as ScopedAssetCatalog;
  for (const row of assetRows) {
    assertPersistedScope(row, trustedScope);
    const type = row.type as AssetType;
    const collection = assetCollections[type];
    if (collection && type !== "proposal" && type !== "contextPack") {
      (catalog[collection] as Asset[]).push(normalizePersistedAsset(JSON.parse(row.payload) as Asset, row, trustedScope));
    }
  }
  catalog.proposals = proposalRows.map((row) => normalizePersistedAsset(JSON.parse(row.payload) as Proposal, row, trustedScope));
  catalog.contextPacks = contextPackRows.map((row) => normalizePersistedAsset(parseContextPackPayload(row.payload) ?? contextPackFromLegacyRow(row), row, trustedScope));
  catalog.assetLinks = assetLinks.map((row) => {
    assertPersistedScope(row, trustedScope);
    return row as ScopedAssetLink;
  });
  return catalog;
}

export async function searchScopedAssets<TType extends AssetType>(
  assetType: TType,
  scopeId: string,
  query: string,
  locale: AssetLocale,
  options: ScopedSearchOptions,
  principal?: ScopedPrincipal
): Promise<ScopedSearchResult<TType>> {
  const limit = Math.max(1, options.limit);
  const offset = Math.max(0, options.offset ?? 0);
  if (!query.trim()) {
    const scope = requireReadableApplicationService(scopeId, principal);
    const where = { type: assetType, ...scopeDatabaseWhere(scope) };
    const [rows, total] = await Promise.all([
      prisma.designAsset.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        skip: offset,
        take: limit,
        select: { id: true, payload: true }
      }),
      typeof (prisma.designAsset as unknown as { count?: unknown }).count === "function"
        ? (prisma.designAsset as unknown as { count: (args: unknown) => Promise<number> }).count({ where })
        : Promise.resolve(Number.NaN)
    ]);
    const pageRows = rows.slice(0, limit);
    const items = pageRows.map((row) => {
      const localized = safeLocalizeAssetForRead(assetType, JSON.parse(row.payload) as Asset, locale) as AssetTypeMap[TType];
      return {
        id: localized.id,
        type: assetType,
        name: "title" in localized && localized.title ? localized.title : localized.name,
        summary: "description" in localized ? localized.description : localized.summary,
        relevanceReason: locale === "zh" ? "来自当前作用域目录。" : "Included from scoped catalog.",
        asset: localized
      };
    });
    return { items, total: Number.isNaN(total) ? rows.length : total, limit, offset };
  }
  const projected = await searchProjectedAssets(assetType, scopeId, query, locale, { limit, offset }, principal);
  if (projected) return projected as ScopedSearchResult<TType>;
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = (catalog[assetCollections[assetType]] as Asset[])
    .map((asset) => ({ asset, score: terms.reduce((score, term) => score + (JSON.stringify(asset).toLocaleLowerCase().includes(term) ? 1 : 0), 0) }))
    .filter((entry) => terms.length === 0 || entry.score > 0)
    .sort((left, right) => right.score - left.score || left.asset.id.localeCompare(right.asset.id));
  const page = matches.slice(offset, offset + limit);
  const items = page.map(({ asset, score }) => {
    const localized = safeLocalizeAssetForRead(assetType, asset, locale) as AssetTypeMap[TType];
    return {
      id: localized.id,
      type: assetType,
      name: "title" in localized && localized.title ? localized.title : localized.name,
      summary: "description" in localized ? localized.description : localized.summary,
      relevanceReason: locale === "zh"
        ? score > 0 ? `\u5339\u914d ${score} \u4e2a\u67e5\u8be2\u8bcd\u3002` : "\u6765\u81ea\u5f53\u524d\u4f5c\u7528\u57df\u76ee\u5f55\u3002"
        : score > 0 ? `Matched ${score} query term(s).` : "Included from scoped catalog.",
      asset: localized
    };
  });
  return { items, total: matches.length, limit, offset };
}

export async function getScopedAssetGraph(
  scopeId: string,
  domainId?: string,
  assetType?: AssetType,
  locale: AssetLocale = "en",
  principal?: ScopedPrincipal
): Promise<LocalizedAssetGraph> {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  const graph = await withLegacyDerivedReadFallback(locale, (resolvedLocale) =>
    buildAssetGraph(domainId, assetType, { catalog, locale: resolvedLocale })
  );
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
      displayLabel: graphEdgeDisplayLabel(edge.label, locale)
    }))
  };
}

function assertPersistedScope(row: PersistedScopeColumns, expected: PersistedScopeColumns): void {
  if (row.applicationServiceId !== expected.applicationServiceId || row.scopePath !== expected.scopePath) {
    throw new Error(`Persisted row scope mismatch: ${row.applicationServiceId}/${row.scopePath}`);
  }
}

function normalizePersistedAsset<TAsset extends Asset>(asset: TAsset, row: PersistedScopeColumns, expected: PersistedScopeColumns): TAsset {
  assertPersistedScope(row, expected);
  return { ...asset, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath } };
}

function assetIdFromPayload(payload: string): string | undefined {
  try {
    const parsed = JSON.parse(payload) as { id?: unknown };
    return typeof parsed.id === "string" ? parsed.id : undefined;
  } catch {
    return undefined;
  }
}

export async function getScopedAssetDetail(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const scope = requireReadableApplicationService(scopeId, principal);
  const catalog = emptyCatalog() as ScopedAssetCatalog;
  const trustedScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
  const where = { ...scopeDatabaseWhere(scope), id: assetId };
  if (assetType === "proposal") {
    const proposalRows = await prisma.proposal.findMany({ where, take: 1 });
    const proposal = proposalRows[0];
    if (!proposal) throw new Error(`Asset not found: ${assetType}/${assetId}`);
    catalog.proposals.push(normalizePersistedAsset(JSON.parse(proposal.payload) as Proposal, proposal, trustedScope));
    const contextPackRows = await prisma.contextPack.findMany({ where: { ...scopeDatabaseWhere(scope), proposalId: assetId } });
    catalog.contextPacks = contextPackRows.map((row) => localizeContextPackRow(row, locale));
  } else {
    const assetRows = await prisma.designAsset.findMany({ where: { ...where, type: assetType }, take: 1 });
    const row = assetRows.find((candidate) => candidate.id === assetId || assetIdFromPayload(candidate.payload) === assetId);
    if (!row) throw new Error(`Asset not found: ${assetType}/${assetId}`);
    assertPersistedScope(row, trustedScope);
    const canonical = normalizePersistedAsset(JSON.parse(row.payload) as Asset, row, trustedScope);
    (catalog[assetCollections[assetType]] as Asset[]).push(canonical);
  }
  const canonical = (catalog[assetCollections[assetType]] as Asset[]).find((asset) => asset.id === assetId);
  if (!canonical) throw new Error(`Asset not found: ${assetType}/${assetId}`);
  const options = { catalog, locale };
  const [summary, markdown, governance] = await Promise.all([
    withLegacyDerivedReadFallback(locale, (resolvedLocale) => renderAssetSummary(assetType, assetId, { catalog, locale: resolvedLocale })),
    withLegacyDerivedReadFallback(locale, (resolvedLocale) => renderAssetAsMarkdown(assetType, assetId, { catalog, locale: resolvedLocale })),
    runGovernanceChecks(assetType, assetId, options)
  ]);
  return { asset: safeLocalizeAssetForRead(assetType, canonical, locale), summary, markdown, governance };
}

export async function getScopedProposalImpact(proposalId: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  return withLegacyDerivedReadFallback(locale, (resolvedLocale) => analyzeProposalImpact(proposalId, { catalog, locale: resolvedLocale }));
}

export async function generateScopedContextPack(proposalId: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  try {
    return await generateContextPack(proposalId, { catalog, locale });
  } catch (error) {
    if (!isLegacyTranslationError(error)) throw error;
    return generateCanonicalLegacyContextPack(proposalId, catalog);
  }
}

async function generateCanonicalLegacyContextPack(proposalId: string, catalog: ScopedAssetCatalog): Promise<ContextPack> {
  const proposal = catalog.proposals.find((item) => item.id === proposalId);
  if (!proposal) throw new Error(`Proposal not found: ${proposalId}`);
  const impact = await analyzeProposalImpact(proposalId, { catalog, locale: "en" });
  const includedAssets = proposal.impactedAssets.map((ref) => {
    const asset = (catalog[assetCollections[ref.type]] as Asset[]).find((item) => item.id === ref.id);
    if (!asset) throw new Error(`Asset not found: ${ref.type}/${ref.id}`);
    return { ...ref, label: "title" in asset && asset.title ? asset.title : asset.name };
  });
  const constraints = [
    `Honor proposal scope: ${proposal.scope}`,
    `Preserve non-goal boundary: ${proposal.nonGoal}`,
    "Preserve technical identifiers and contract compatibility for included assets."
  ];
  const generatedMarkdown = [
    `# ${proposal.title} Agent Context Pack`, "",
    "## Feature Summary", proposal.description, "",
    "## Goals", proposal.goal, "",
    "## Impacted Assets", ...includedAssets.map((ref) => `- ${ref.label} (${ref.type}/${ref.id})`), "",
    "## Implementation Tasks", ...impact.implementationTasks.map((task) => `- ${task}`), "",
    "## Constraints", ...constraints.map((item) => `- ${item}`)
  ].join("\n");
  return {
    id: `ctx-${proposal.id.replace(/^proposal-/, "")}`,
    name: `${proposal.title} Agent Context Pack`,
    proposalId,
    targetAgent: "codex",
    summary: `${proposal.title}: ${impact.impactedAssetCount} impacted assets, ${impact.riskLevel} risk.`,
    includedAssets,
    constraints,
    instructions: impact.implementationTasks,
    generatedMarkdown,
    createdAt: proposal.updatedAt ?? proposal.createdAt,
    architectureScope: proposal.architectureScope
  };
}

export async function getScopedGovernanceChecks(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  return runGovernanceChecks(assetType, assetId, { catalog, locale });
}

export async function getScopedGovernanceOverview(scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  const targetTypes: AssetType[] = ["api", "event", "dataModel", "businessRule", "proposal"];
  const targets = targetTypes.flatMap((type) =>
    (catalog[assetCollections[type]] as Asset[]).map((asset) => ({ type, id: asset.id }))
  );
  return (await Promise.all(targets.map((target) => runGovernanceChecks(target.type, target.id, { catalog, locale })))).flat();
}

export async function renderScopedAssetSummary(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  return withLegacyDerivedReadFallback(locale, (resolvedLocale) => renderAssetSummary(assetType, assetId, { catalog, locale: resolvedLocale }));
}

export async function renderScopedAssetMarkdown(assetType: AssetType, assetId: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal) {
  const catalog = await getScopedAssetCatalog(scopeId, principal);
  return withLegacyDerivedReadFallback(locale, (resolvedLocale) => renderAssetAsMarkdown(assetType, assetId, { catalog, locale: resolvedLocale }));
}

function emptyCatalog(): SpecForgeDataStore {
  return {
    domains: [], dataModels: [], apis: [], events: [], businessRules: [], stateMachines: [], integrations: [],
    qualityRequirements: [], observabilityDesigns: [], serviceFeatures: [], functionalFeatures: [], adrs: [], proposals: [], contextPacks: [], evidence: []
  };
}

export async function getRouteAssetWithDatabase(route: string, id: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<Asset> {
  const assetType = routeToAssetType(route);
  const dbAssets = await getDatabaseAssets(assetType, scopeId, locale, principal);
  const dbAsset = dbAssets.find((asset) => asset.id === id);
  if (dbAsset) return dbAsset;
  throw new Error(`Asset not found: ${assetType}/${id}`);
}

export async function getDomainsWithDatabase(scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<DomainModel[]> {
  return (await getRouteAssetsWithDatabase("domains", scopeId, locale, principal)) as DomainModel[];
}

async function searchProjectedAssets(
  assetType: AssetType,
  scopeId: string,
  query: string,
  locale: AssetLocale,
  options: ScopedSearchOptions,
  principal?: ScopedPrincipal
): Promise<{ items: Array<{ id: string; type: AssetType; name: string; summary: string; relevanceReason: string; asset: Asset }>; total: number; limit: number; offset: number } | undefined> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const terms = query.toLocaleLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const params: unknown[] = [scope.id, scope.scopePath, assetType];
  const predicates = ['"applicationServiceId" = $1', '"scopePath" = $2', '"assetType" = $3'];
  for (const term of terms) {
    params.push(`%${term}%`);
    predicates.push(`"searchDocument" ILIKE $${params.length}`);
  }
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(1, options.limit);
  params.push(offset, limit);
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ assetId: string; total: bigint | number }>>(
      `SELECT "assetId", COUNT(*) OVER() AS total
       FROM "AssetSearchProjection"
       WHERE ${predicates.join(" AND ")}
       ORDER BY "updatedAt" DESC, "assetId" ASC
       OFFSET $${params.length - 1} LIMIT $${params.length}`,
      ...params
    );
    if (!rows.length) return undefined;
    const assets = await prisma.designAsset.findMany({
      where: { ...scopeDatabaseWhere(scope), type: assetType, id: { in: rows.map((row) => row.assetId) } },
      select: { id: true, payload: true }
    });
    const byId = new Map(assets.map((row) => [row.id, row]));
    const items = rows.flatMap((row) => {
      const persisted = byId.get(row.assetId);
      if (!persisted) return [];
      const asset = safeLocalizeAssetForRead(assetType, JSON.parse(persisted.payload) as Asset, locale);
      return [{
        id: asset.id,
        type: assetType,
        name: "title" in asset && asset.title ? asset.title : asset.name,
        summary: "description" in asset ? asset.description : asset.summary,
        relevanceReason: locale === "zh" ? "匹配双语搜索投影。" : "Matched bilingual search projection.",
        asset
      }];
    });
    return { items, total: Number(rows[0]?.total ?? 0), limit, offset };
  } catch {
    return undefined;
  }
}

export async function getGovernanceTargetsWithDatabase(scopeId: string, principal?: ScopedPrincipal): Promise<Array<{ type: AssetType; id: string }>> {
  const [apis, events, dataModels, businessRules, proposals] = await Promise.all([
    getRouteAssetsWithDatabase("apis", scopeId, "en", principal),
    getRouteAssetsWithDatabase("events", scopeId, "en", principal),
    getRouteAssetsWithDatabase("data-models", scopeId, "en", principal),
    getRouteAssetsWithDatabase("rules", scopeId, "en", principal),
    getProposalsWithDatabase(scopeId, "en", principal)
  ]);
  return [
    ...apis.map((asset) => ({ type: "api" as AssetType, id: asset.id })),
    ...events.map((asset) => ({ type: "event" as AssetType, id: asset.id })),
    ...dataModels.map((asset) => ({ type: "dataModel" as AssetType, id: asset.id })),
    ...businessRules.map((asset) => ({ type: "businessRule" as AssetType, id: asset.id })),
    ...proposals.map((proposal) => ({ type: "proposal" as AssetType, id: proposal.id }))
  ];
}

export async function getProposalsWithDatabase(scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<Proposal[]> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const rows = await prisma.proposal.findMany({ where: scopeDatabaseWhere(scope), orderBy: { createdAt: "asc" } });
  return rows.map((row) => safeLocalizeAssetForRead("proposal", JSON.parse(row.payload) as Proposal, locale));
}

export async function getProposalWithDatabase(id: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<Proposal> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const row = await prisma.proposal.findFirst({ where: { id, ...scopeDatabaseWhere(scope) } });
  if (row) return safeLocalizeAssetForRead("proposal", JSON.parse(row.payload) as Proposal, locale);
  throw new Error(`Proposal not found: ${id}`);
}

export async function getContextPacksWithDatabase(scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<ContextPack[]> {
  const scope = requireReadableApplicationService(scopeId, principal);
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
  return safeLocalizeAssetForRead("contextPack", persisted, locale);
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

export async function getContextPackWithDatabase(id: string, scopeId: string, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<ContextPack> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const row = await prisma.contextPack.findFirst({ where: { id, ...scopeDatabaseWhere(scope) } });
  if (row) {
    return localizeContextPackRow(row, locale);
  }
  throw new Error(`Context Pack not found: ${id}`);
}

export async function dashboardStats(scopeId: string, principal?: ScopedPrincipal) {
  const scope = requireReadableApplicationService(scopeId, principal);
  const dbRows = await prisma.designAsset.findMany({ where: scopeDatabaseWhere(scope), select: { id: true, type: true } });
  return Object.entries(assetCollections)
    .filter(([type]) => !["proposal", "contextPack"].includes(type))
    .map(([type]) => ({
      type,
      count: new Set(dbRows.filter((row) => row.type === type).map((row) => row.id)).size
    }));
}

export async function getAgentServiceWorkspace(applicationServiceId: string, agentId = "specforge-default-agent", principal?: ScopedPrincipal) {
  requireReadableApplicationService(applicationServiceId, principal);
  return prisma.agentServiceWorkspace.upsert({
    where: { agentType_agentId_applicationServiceId: { agentType: "agent", agentId, applicationServiceId } },
    create: { agentType: "agent", agentId, applicationServiceId },
    update: {}
  });
}

export async function getAssetGraphWithDatabase(scopeId: string, domainId?: string, assetType?: AssetType, locale: AssetLocale = "en", principal?: ScopedPrincipal): Promise<AssetGraph> {
  return getScopedAssetGraph(scopeId, domainId, assetType, locale, principal);
}

async function getDatabaseAssets(assetType: AssetType, scopeId: string, locale: AssetLocale, principal?: ScopedPrincipal): Promise<Asset[]> {
  const scope = requireReadableApplicationService(scopeId, principal);
  const rows = await prisma.designAsset.findMany({
    where: { type: assetType, ...scopeDatabaseWhere(scope) },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => safeLocalizeAssetForRead(assetType, JSON.parse(row.payload) as Asset, locale));
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
