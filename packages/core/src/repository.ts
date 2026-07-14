import { seedData } from "./data/seed-data";
import { AssetLocalizationError, localizeAsset } from "./localization/assets";
import type { Asset, AssetLocale, AssetRef, AssetType, AssetTypeMap, SpecForgeDataStore } from "./types";

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

export function getStore(catalog?: SpecForgeDataStore): SpecForgeDataStore {
  return catalog ?? seedData;
}

export function listAssets<T extends Asset = Asset>(assetType: AssetType, catalog?: SpecForgeDataStore): T[] {
  return getStore(catalog)[assetCollections[assetType]] as T[];
}

export function getAsset<T extends Asset = Asset>(assetType: AssetType, assetId: string, catalog?: SpecForgeDataStore): T {
  const asset = listAssets<T>(assetType, catalog).find((item) => item.id === assetId);
  if (!asset) {
    throw new Error(`Asset not found: ${assetType}/${assetId}`);
  }
  return asset;
}

export function findAsset(ref: AssetRef, catalog?: SpecForgeDataStore): Asset {
  return getAsset(ref.type, ref.id, catalog);
}

export function localizedAsset<TType extends AssetType>(assetType: TType, assetId: string, locale: AssetLocale = "en", catalog?: SpecForgeDataStore): AssetTypeMap[TType] {
  return localizeCatalogAsset(assetType, getAsset<AssetTypeMap[TType]>(assetType, assetId, catalog), locale, catalog);
}

export function localizeCatalogAsset<TType extends AssetType>(
  assetType: TType,
  asset: AssetTypeMap[TType],
  locale: AssetLocale = "en",
  catalog?: SpecForgeDataStore
): AssetTypeMap[TType] {
  try {
    return localizeAsset(assetType, asset, locale);
  } catch (error) {
    if (locale === "zh" && !catalog && error instanceof AssetLocalizationError && error.code === "ASSET_TRANSLATION_REQUIRED") {
      return localizeAsset(assetType, asset, "en");
    }
    throw error;
  }
}

export function assetLabel(assetType: AssetType, locale: AssetLocale = "en"): string {
  const labels: Record<AssetLocale, Record<AssetType, string>> = {
    en: {
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
    },
    zh: {
      domain: "领域模型",
      dataModel: "数据模型",
      api: "API 契约",
      event: "事件契约",
      businessRule: "业务规则",
      stateMachine: "状态机",
      integration: "集成契约",
      quality: "质量要求",
      observability: "可观测性设计",
      adr: "架构决策记录",
      proposal: "变更提案",
      contextPack: "Agent 上下文包"
    }
  };
  return labels[locale][assetType];
}

export function getDomainName(domainId?: string, catalog?: SpecForgeDataStore, locale: AssetLocale = "en"): string {
  if (!domainId) return locale === "zh" ? "跨领域" : "Cross-domain";
  const domain = getStore(catalog).domains.find((item) => item.id === domainId);
  return domain ? localizeCatalogAsset("domain", domain, locale, catalog).name : domainId;
}
