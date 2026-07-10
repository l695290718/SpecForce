import { assetLabel, getAsset } from "../repository";
import type { AssetType } from "../types";

function preview(value: unknown): string {
  if (Array.isArray(value)) return value.slice(0, 4).join(", ");
  if (typeof value === "object" && value) return JSON.stringify(value);
  return `${value ?? ""}`;
}

export async function renderAssetSummary(assetType: string, assetId: string): Promise<string> {
  const asset = getAsset(assetType as AssetType, assetId) as unknown as Record<string, unknown>;
  const lines = [`${assetLabel(assetType as AssetType)}: ${asset.name ?? asset.title}`, `ID: ${assetId}`];
  if (asset.description) lines.push(`Description: ${asset.description}`);
  if (asset.code) lines.push(`Code: ${asset.code}`);
  if (asset.method && asset.path) lines.push(`Endpoint: ${asset.method} ${asset.path}`);
  if (asset.topic) lines.push(`Topic: ${asset.topic}`);
  if (asset.severity) lines.push(`Severity: ${asset.severity}`);
  if (asset.status) lines.push(`Status: ${asset.status}`);
  if (asset.fields) lines.push(`Fields: ${preview(asset.fields)}`);
  if (asset.transitions) lines.push(`Transitions: ${preview(asset.transitions)}`);
  if (asset.relatedAssets) lines.push(`Related: ${preview(asset.relatedAssets)}`);
  return lines.join("\n");
}
