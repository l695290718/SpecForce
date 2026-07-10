import { seedData } from "./data/seed-data";
import type { Asset, AssetRef, AssetType, SpecForgeDataStore } from "./types";

export const assetCollections = {
  domain: "domains",
  dataModel: "dataModels",
  api: "apis",
  event: "events",
  businessRule: "businessRules",
  stateMachine: "stateMachines",
  integration: "integrations",
  quality: "qualityRequirements",
  observability: "observabilityDesigns",
  adr: "adrs",
  proposal: "proposals",
  contextPack: "contextPacks"
} as const satisfies Record<AssetType, keyof SpecForgeDataStore>;

export function getStore(): SpecForgeDataStore {
  return seedData;
}

export function listAssets<T extends Asset = Asset>(assetType: AssetType): T[] {
  return getStore()[assetCollections[assetType]] as T[];
}

export function getAsset<T extends Asset = Asset>(assetType: AssetType, assetId: string): T {
  const asset = listAssets<T>(assetType).find((item) => item.id === assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetType}/${assetId}`);
  }
  return asset;
}

export function findAsset(ref: AssetRef): Asset {
  return getAsset(ref.type, ref.id);
}

export function assetLabel(assetType: AssetType): string {
  const labels: Record<AssetType, string> = {
    domain: "Domain Model",
    dataModel: "Data Model",
    api: "API Contract",
    event: "Event Contract",
    businessRule: "Business Rule",
    stateMachine: "State Machine",
    integration: "Integration Contract",
    quality: "Quality Requirement",
    observability: "Observability Design",
    adr: "ADR",
    proposal: "Proposal",
    contextPack: "AI Context Pack"
  };
  return labels[assetType];
}

export function getDomainName(domainId?: string): string {
  if (!domainId) return "Cross-domain";
  return getStore().domains.find((domain) => domain.id === domainId)?.name ?? domainId;
}
