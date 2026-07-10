import {
  assetCollections,
  getAsset,
  getStore,
  listAssets,
  generateContextPack,
  type Asset,
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
  return mergeById(listAssets(assetType), await getDatabaseAssets(assetType));
}

export async function getRouteAssetWithDatabase(route: string, id: string): Promise<Asset> {
  const assetType = routeToAssetType(route);
  const dbAsset = (await getDatabaseAssets(assetType)).find((asset) => asset.id === id);
  if (dbAsset) return dbAsset;
  return getAsset(assetType, id);
}

export async function getDomainsWithDatabase(): Promise<DomainModel[]> {
  return (await getRouteAssetsWithDatabase("domains")) as DomainModel[];
}

export async function getProposalsWithDatabase(): Promise<Proposal[]> {
  const rows = await prisma.proposal.findMany({ orderBy: { createdAt: "asc" } });
  const dbProposals = rows.map((row) => JSON.parse(row.payload) as Proposal);
  return mergeById(getStore().proposals, dbProposals);
}

export async function getProposalWithDatabase(id: string): Promise<Proposal> {
  const row = await prisma.proposal.findUnique({ where: { id } });
  if (row) return JSON.parse(row.payload) as Proposal;
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
  return mergeById(getStore().contextPacks, dbPacks);
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
  const proposalId = id === "ctx-partial-refund" ? "proposal-partial-refund" : id.replace(/^ctx-/, "proposal-");
  return generateContextPack(proposalId);
}

export async function dashboardStats() {
  const store = getStore();
  const dbRows = await prisma.designAsset.findMany({ select: { id: true, type: true } });
  return Object.entries(assetCollections)
    .filter(([type]) => !["proposal", "contextPack"].includes(type))
    .map(([type, collection]) => {
      const ids = new Set((store[collection] as Array<{ id: string }>).map((item) => item.id));
      dbRows.filter((row) => row.type === type).forEach((row) => ids.add(row.id));
      return { type, count: ids.size };
    });
}

async function getDatabaseAssets(assetType: AssetType): Promise<Asset[]> {
  const rows = await prisma.designAsset.findMany({ where: { type: assetType }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => JSON.parse(row.payload) as Asset);
}

function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  const map = new Map<string, T>();
  base.forEach((item) => map.set(item.id, item));
  extra.forEach((item) => map.set(item.id, item));
  return Array.from(map.values());
}
