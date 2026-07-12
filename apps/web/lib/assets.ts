import {
  assetCollections,
  getAsset,
  getStore,
  listAssets,
  generateContextPack,
  type Asset,
  type AssetGraph,
  type AssetType
} from "@specforge/core";
import type { ContextPack, DomainModel, Proposal } from "@specforge/core";
import type { MessageKey } from "./i18n";
import { prisma } from "./db";

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

export function getRouteAssets(route: string): Asset[] {
  return listAssets(routeToAssetType(route));
}

export function getRouteAsset(route: string, id: string): Asset {
  return getAsset(routeToAssetType(route), id);
}

export async function getRouteAssetsWithDatabase(route: string): Promise<Asset[]> {
  const assetType = routeToAssetType(route);
  const dbAssets = await getDatabaseAssets(assetType);
  return dbAssets.length > 0 ? dbAssets : listAssets(assetType);
}

export async function getRouteAssetWithDatabase(route: string, id: string): Promise<Asset> {
  const assetType = routeToAssetType(route);
  const dbAssets = await getDatabaseAssets(assetType);
  const dbAsset = dbAssets.find((asset) => asset.id === id);
  if (dbAsset) return dbAsset;
  if (dbAssets.length > 0) throw new Error(`Asset not found: ${assetType}/${id}`);
  return getAsset(assetType, id);
}

export async function getDomainsWithDatabase(): Promise<DomainModel[]> {
  return (await getRouteAssetsWithDatabase("domains")) as DomainModel[];
}

export async function getProposalsWithDatabase(): Promise<Proposal[]> {
  const rows = await prisma.proposal.findMany({ orderBy: { createdAt: "asc" } });
  const dbProposals = rows.map((row) => JSON.parse(row.payload) as Proposal);
  return dbProposals.length > 0 ? dbProposals : getStore().proposals;
}

export async function getProposalWithDatabase(id: string): Promise<Proposal> {
  const row = await prisma.proposal.findUnique({ where: { id } });
  if (row) return JSON.parse(row.payload) as Proposal;
  if ((await prisma.proposal.count()) > 0) throw new Error(`Proposal not found: ${id}`);
  return getAsset<Proposal>("proposal", id);
}

export async function getContextPacksWithDatabase(): Promise<ContextPack[]> {
  const rows = await prisma.contextPack.findMany({ orderBy: { createdAt: "asc" } });
  const dbPacks = rows.map((row) => ({
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
  }) satisfies ContextPack);
  return dbPacks.length > 0 ? dbPacks : getStore().contextPacks;
}

export async function getContextPackWithDatabase(id: string): Promise<ContextPack> {
  const row = await prisma.contextPack.findUnique({ where: { id } });
  if (row) {
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
  if ((await prisma.contextPack.count()) > 0) throw new Error(`Context Pack not found: ${id}`);
  return generateContextPack(id.replace(/^ctx-/, "proposal-"));
}

export async function dashboardStats() {
  const store = getStore();
  const dbRows = await prisma.designAsset.findMany({ select: { id: true, type: true } });
  if (dbRows.length > 0) {
    return Object.entries(assetCollections)
      .filter(([type]) => !["proposal", "contextPack"].includes(type))
      .map(([type]) => ({
        type,
        count: new Set(dbRows.filter((row) => row.type === type).map((row) => row.id)).size
      }));
  }
  return Object.entries(assetCollections)
    .filter(([type]) => !["proposal", "contextPack"].includes(type))
    .map(([type, collection]) => {
      const ids = new Set((store[collection] as Array<{ id: string }>).map((item) => item.id));
      dbRows.filter((row) => row.type === type).forEach((row) => ids.add(row.id));
      return { type, count: ids.size };
    });
}

export async function getAssetGraphWithDatabase(domainId?: string, assetType?: AssetType): Promise<AssetGraph> {
  const assetRows = await prisma.designAsset.findMany({ orderBy: { createdAt: "asc" } });
  if (assetRows.length === 0) {
    const { buildAssetGraph } = await import("@specforge/core");
    return buildAssetGraph(domainId, assetType);
  }

  const assets = assetRows.map((row) => JSON.parse(row.payload) as Asset);
  const assetLinks = await getDatabaseAssetLinks();
  const proposals = await getProposalsWithDatabase();
  const contextPacks = await getContextPacksWithDatabase();
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

async function getDatabaseAssets(assetType: AssetType): Promise<Asset[]> {
  const rows = await prisma.designAsset.findMany({ where: { type: assetType }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => JSON.parse(row.payload) as Asset);
}

async function getDatabaseAssetLinks(): Promise<Array<{ id: string; sourceType: AssetType; sourceId: string; targetType: AssetType; targetId: string; relationType: string }>> {
  try {
    return await prisma.$queryRawUnsafe<Array<{ id: string; sourceType: AssetType; sourceId: string; targetType: AssetType; targetId: string; relationType: string }>>(
      "SELECT id, sourceType, sourceId, targetType, targetId, relationType FROM AssetLink ORDER BY createdAt ASC"
    );
  } catch {
    return [];
  }
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
