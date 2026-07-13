import { assetLabel, localizedAsset } from "../repository";
import type { AssetType, DerivedViewOptions } from "../types";

function preview(value: unknown): string {
  if (Array.isArray(value)) {
    return value.slice(0, 4).map((item) => typeof item === "object" && item ? JSON.stringify(item) : `${item}`).join(", ");
  }
  if (typeof value === "object" && value) return JSON.stringify(value);
  return `${value ?? ""}`;
}

export async function renderAssetSummary(assetType: string, assetId: string, options: DerivedViewOptions = {}): Promise<string> {
  const type = assetType as AssetType;
  const locale = options.locale ?? "en";
  const asset = localizedAsset(type, assetId, locale, options.catalog) as unknown as Record<string, unknown>;
  const copy = locale === "zh"
    ? { id: "ID", description: "说明", code: "编码", endpoint: "端点", topic: "主题", severity: "严重级别", status: "状态", fields: "字段", transitions: "转换", related: "关联资产" }
    : { id: "ID", description: "Description", code: "Code", endpoint: "Endpoint", topic: "Topic", severity: "Severity", status: "Status", fields: "Fields", transitions: "Transitions", related: "Related" };
  const lines = [`${assetLabel(type, locale)}: ${asset.name ?? asset.title}`, `${copy.id}: ${assetId}`];
  if (asset.description) lines.push(`${copy.description}: ${asset.description}`);
  if (asset.code) lines.push(`${copy.code}: ${asset.code}`);
  if (asset.method && asset.path) lines.push(`${copy.endpoint}: ${asset.method} ${asset.path}`);
  if (asset.topic) lines.push(`${copy.topic}: ${asset.topic}`);
  if (asset.severity) lines.push(`${copy.severity}: ${asset.severity}`);
  if (asset.status) lines.push(`${copy.status}: ${asset.status}`);
  if (asset.fields) lines.push(`${copy.fields}: ${preview(asset.fields)}`);
  if (asset.transitions) lines.push(`${copy.transitions}: ${preview(asset.transitions)}`);
  if (asset.relatedAssets) lines.push(`${copy.related}: ${preview(asset.relatedAssets)}`);
  return lines.join("\n");
}
