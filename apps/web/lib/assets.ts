import {
  assetCollections,
  localizeAsset,
  type Asset,
  type AssetGraph,
  type AssetLocale,
  type AssetType
} from "@specforge/core";
import type { ContextPack, DomainModel, Proposal } from "@specforge/core";
import type { MessageKey } from "./i18n";
import { prisma } from "./db";
import { requireReadableApplicationService, scopeDatabaseWhere } from "./scope";

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

export async function getAssetGraphWithDatabase(scopeId: string, domainId?: string, assetType?: AssetType): Promise<AssetGraph> {
  const scope = requireReadableApplicationService(scopeId);
  const assetRows = await prisma.designAsset.findMany({ where: scopeDatabaseWhere(scope), orderBy: { createdAt: "asc" } });

  const assets = assetRows.map((row) => JSON.parse(row.payload) as Asset);
  const assetLinks = await getDatabaseAssetLinks(scopeId);
  const proposals = await getProposalsWithDatabase(scopeId);
  const contextPacks = await getContextPacksWithDatabase(scopeId);
  const nodes: AssetGraph["nodes"] = [];
  const edges: AssetGraph["edges"] = [];

  for (const asset of assets) {
    const type = assetTypeOf(asset, assetRows.find((row) => row.id === asset.id)?.type);
    if (!type) continue;
    if (domainId && "domainId" in asset && asset.domainId !== domainId) continue;
    if (assetType && type !== assetType) continue;
    nodes.push({ id: asset.id, label: "title" in asset ? asset.title : asset.name, type, domainId: "domainId" in asset ? asset.domainId : undefined, summary: assetSummary(asset) });
    if ("domainId" in asset && asset.domainId && asset.id !== asset.domainId) {
      edges.push({ id: `${asset.domainId}->${asset.id}`, source: asset.domainId, target: asset.id, label: "owns" });
    }
  }

  for (const proposal of proposals) {
    if (assetType && assetType !== "proposal") continue;
    if (domainId && proposal.domainId !== domainId) continue;
    nodes.push({ id: proposal.id, label: proposal.title, type: "proposal", domainId: proposal.domainId, summary: proposal.description });
    proposal.impactedAssets.forEach((ref) => {
      if (nodes.some((node) => node.id === ref.id)) {
        edges.push({ id: `${proposal.id}->${ref.id}`, source: proposal.id, target: ref.id, label: "impacts" });
      }
    });
  }

  for (const link of assetLinks) {
    if (assetType && link.sourceType !== assetType && link.targetType !== assetType) continue;
    if (nodes.some((node) => node.id === link.sourceId) && nodes.some((node) => node.id === link.targetId)) {
      edges.push({ id: link.id, source: link.sourceId, target: link.targetId, label: link.relationType });
    }
  }

  for (const pack of contextPacks) {
    if (assetType) continue;
    nodes.push({ id: pack.id, label: pack.name, type: "contextPack", summary: pack.summary });
    if (nodes.some((node) => node.id === pack.proposalId)) {
      edges.push({ id: `${pack.proposalId}->${pack.id}`, source: pack.proposalId, target: pack.id, label: "generates" });
    }
    pack.includedAssets.forEach((ref) => {
      if (nodes.some((node) => node.id === ref.id)) {
        edges.push({ id: `${pack.id}->${ref.id}`, source: pack.id, target: ref.id, label: "includes" });
      }
    });
  }

  return { nodes: dedupeById(nodes), edges: dedupeById(edges) };
}

async function getDatabaseAssets(assetType: AssetType, scopeId: string, locale: AssetLocale): Promise<Asset[]> {
  const scope = requireReadableApplicationService(scopeId);
  const rows = await prisma.designAsset.findMany({
    where: { type: assetType, ...scopeDatabaseWhere(scope) },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => localizeAsset(assetType, JSON.parse(row.payload) as Asset, locale));
}

async function getDatabaseAssetLinks(scopeId: string): Promise<Array<{ id: string; sourceType: AssetType; sourceId: string; targetType: AssetType; targetId: string; relationType: string }>> {
  const scope = requireReadableApplicationService(scopeId);
  return prisma.assetLink.findMany({
    where: scopeDatabaseWhere(scope),
    orderBy: { createdAt: "asc" },
    select: { id: true, sourceType: true, sourceId: true, targetType: true, targetId: true, relationType: true }
  }) as Promise<Array<{ id: string; sourceType: AssetType; sourceId: string; targetType: AssetType; targetId: string; relationType: string }>>;
}

function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  const map = new Map<string, T>();
  base.forEach((item) => map.set(item.id, item));
  extra.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function assetTypeOf(asset: Asset, fallback?: string): AssetType | undefined {
  if (fallback && fallback in assetCollections) return fallback as AssetType;
  if ("boundedContext" in asset) return "domain";
  if ("modelType" in asset) return "dataModel";
  if ("method" in asset) return "api";
  if ("topic" in asset) return "event";
  if ("ruleType" in asset) return "businessRule";
  if ("states" in asset) return "stateMachine";
  if ("sourceSystem" in asset) return "integration";
  if ("category" in asset) return "quality";
  if ("metrics" in asset) return "observability";
  if ("decision" in asset) return "adr";
  if ("goal" in asset) return "proposal";
  return undefined;
}

function assetSummary(asset: Asset): string {
  if ("summary" in asset) return asset.summary;
  return asset.description;
}
