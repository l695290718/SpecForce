import { assetCollections, assetLabel, findAsset, getAsset, getStore, listAssets, localizeCatalogAsset } from "../repository";
import { renderAssetSummary } from "../summary/render";
import type { Asset, AssetRef, AssetType, DerivedViewOptions } from "../types";

export interface SearchDesignAssetsInput {
  query: string;
  assetTypes?: string[];
  domainId?: string;
  limit?: number;
}

export interface SearchDesignAssetsResult {
  results: Array<{
    id: string;
    type: string;
    name: string;
    summary: string;
    relevanceReason: string;
  }>;
}

export interface GetAssetDetailInput {
  assetType: string;
  assetId: string;
  format?: "markdown" | "json";
}

export type AssetDetailResult =
  | { format: "markdown"; content: string }
  | { format: "json"; asset: Asset };

const assetTypeAliases: Record<string, AssetType> = {
  domain: "domain",
  domains: "domain",
  "data-model": "dataModel",
  "data-models": "dataModel",
  dataModel: "dataModel",
  dataModels: "dataModel",
  api: "api",
  apis: "api",
  event: "event",
  events: "event",
  "business-rule": "businessRule",
  "business-rules": "businessRule",
  businessRule: "businessRule",
  businessRules: "businessRule",
  "state-machine": "stateMachine",
  "state-machines": "stateMachine",
  stateMachine: "stateMachine",
  stateMachines: "stateMachine",
  integration: "integration",
  integrations: "integration",
  quality: "quality",
  observability: "observability",
  adr: "adr",
  adrs: "adr",
  proposal: "proposal",
  proposals: "proposal",
  "context-pack": "contextPack",
  "context-packs": "contextPack",
  contextPack: "contextPack",
  contextPacks: "contextPack"
};

export function normalizeAssetType(assetType: string): AssetType {
  const normalized = assetTypeAliases[assetType];
  if (!normalized) {
    throw new Error(`Unsupported asset type: ${assetType}`);
  }
  return normalized;
}

export function listAllAssetTypes(): AssetType[] {
  return Object.keys(assetCollections) as AssetType[];
}

export function listAssetsByExternalType(assetType: string): Asset[] {
  return listAssets(normalizeAssetType(assetType));
}

export function inferAssetType(assetId: string): AssetType {
  for (const type of listAllAssetTypes()) {
    if (listAssets(type).some((asset) => asset.id === assetId)) {
      return type;
    }
  }
  throw new Error(`Asset not found: ${assetId}`);
}

function assetName(asset: Asset): string {
  return "title" in asset && asset.title ? asset.title : asset.name;
}

function searchableText(asset: Asset): string {
  return JSON.stringify({ canonical: asset, zh: asset.localizedContent?.zh }).toLowerCase();
}

function scoreAsset(asset: Asset, queryTerms: string[]): number {
  const text = searchableText(asset);
  return queryTerms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

export async function searchDesignAssets(input: SearchDesignAssetsInput, options: DerivedViewOptions = {}): Promise<SearchDesignAssetsResult> {
  const queryTerms = input.query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const requestedTypes = input.assetTypes?.length ? input.assetTypes.map(normalizeAssetType) : listAllAssetTypes();
  const limit = Math.max(1, Math.min(input.limit ?? 10, 50));
  const locale = options.locale ?? "en";
  const candidates = requestedTypes.flatMap((type) => listAssets(type, options.catalog).map((asset) => ({ type, asset })));

  const scored = candidates
    .filter(({ asset }) => !input.domainId || !("domainId" in asset) || asset.domainId === input.domainId || asset.id === input.domainId)
    .map(({ type, asset }) => ({ type, canonical: asset, score: scoreAsset(asset, queryTerms) }))
    .filter((item) => item.score > 0 || queryTerms.length === 0)
    .sort((a, b) => b.score - a.score || assetName(a.canonical).localeCompare(assetName(b.canonical)));

  const results = await Promise.all(
    scored.slice(0, limit).map(async ({ type, canonical, score }) => {
      const asset = localizeCatalogAsset(type, canonical, locale, options.catalog) as Asset;
      const relevanceReason = locale === "zh"
        ? score > 0
          ? `在${assetLabel(type, locale)}元数据中匹配 ${score} 个查询词。`
          : `来自${assetLabel(type, locale)}目录。`
        : score > 0
          ? `Matched ${score} query term(s) in ${assetLabel(type, locale)} metadata.`
          : `Included from ${assetLabel(type, locale)} catalog.`;
      return {
        id: asset.id,
        type,
        name: assetName(asset),
        summary: await renderAssetSummary(type, asset.id, options),
        relevanceReason
      };
    })
  );

  return { results };
}

export async function renderAssetAsMarkdown(assetType: string, assetId: string, options: DerivedViewOptions = {}): Promise<string> {
  const normalizedType = normalizeAssetType(assetType);
  const locale = options.locale ?? "en";
  const asset = localizeCatalogAsset(normalizedType, getAsset(normalizedType, assetId, options.catalog), locale, options.catalog) as Asset;
  const summary = await renderAssetSummary(normalizedType, assetId, options);
  const copy = locale === "zh"
    ? { type: "类型", domain: "领域", summary: "Agent 摘要", source: "源 JSON" }
    : { type: "Type", domain: "Domain", summary: "Agent Summary", source: "Source JSON" };
  return [
    `# ${assetName(asset)}`,
    "",
    `- ID: ${asset.id}`,
    `- ${copy.type}: ${assetLabel(normalizedType, locale)}`,
    "domainId" in asset && asset.domainId ? `- ${copy.domain}: ${asset.domainId}` : undefined,
    "",
    `## ${copy.summary}`,
    summary,
    "",
    `## ${copy.source}`,
    "```json",
    JSON.stringify(asset, null, 2),
    "```"
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export async function getAssetDetail(input: GetAssetDetailInput, options: DerivedViewOptions = {}): Promise<AssetDetailResult> {
  const normalizedType = normalizeAssetType(input.assetType);
  if (input.format === "json") {
    const asset = getAsset(normalizedType, input.assetId, options.catalog);
    return { format: "json", asset: localizeCatalogAsset(normalizedType, asset, options.locale ?? "en", options.catalog) as Asset };
  }
  return { format: "markdown", content: await renderAssetAsMarkdown(normalizedType, input.assetId, options) };
}

export function assetRefFromInput(assetType: string, assetId: string): AssetRef {
  const type = normalizeAssetType(assetType);
  const asset = getAsset(type, assetId) as Asset;
  return { type, id: asset.id, label: assetName(asset) };
}

export function listCollectionAsMarkdown(assetType: string): string {
  const type = normalizeAssetType(assetType);
  const assets = listAssets(type) as Asset[];
  return [`# ${assetLabel(type)} Catalog`, "", ...assets.map((asset) => `- ${assetName(asset)} (${type}/${asset.id})`)].join("\n");
}

export function findAssetByRef(ref: AssetRef): Asset {
  return findAsset(ref) as Asset;
}

export function getDomainGraphTarget(domainId?: string): string {
  if (!domainId) return "all domains";
  return getStore().domains.find((domain) => domain.id === domainId)?.name ?? domainId;
}
