import { createHash } from "node:crypto";
import type { ArchitectureScopeRef, Asset, AssetType, ContextPack, Proposal } from "@specforge/core";

export type ScopedProjectionAsset = Asset | Proposal | ContextPack;

export interface AssetSearchProjectionInput {
  architectureScope: ArchitectureScopeRef;
  assetType: AssetType;
  asset: ScopedProjectionAsset;
  catalogVersion: bigint | number | string;
  updatedAt?: Date | string;
}

export interface AssetSearchProjectionRow {
  applicationServiceId: string;
  scopePath: string;
  assetType: AssetType;
  assetId: string;
  canonicalName: string;
  canonicalSummary: string;
  localizedNameZh: string;
  localizedSummaryZh: string;
  domainId?: string;
  status?: string;
  updatedAt: Date;
  catalogVersion: bigint;
  contentDigest: string;
  searchDocument: string;
}

export function mapAssetSearchProjection(input: AssetSearchProjectionInput): AssetSearchProjectionRow {
  const scope = requireScope(input.architectureScope);
  const asset = asRecord(input.asset);
  const sourceScope = optionalScope(asset.architectureScope);
  if (sourceScope && !sameScope(sourceScope, scope)) {
    throw new Error("PROJECTION_SCOPE_MISMATCH");
  }

  const localized = asRecord(asRecord(asset.localizedContent).zh);
  const canonicalName = firstText(asset.title, asset.name, asset.id);
  const canonicalSummary = firstText(asset.summary, asset.description);
  const localizedNameZh = firstText(localized.title, localized.name, canonicalName);
  const localizedSummaryZh = firstText(localized.summary, localized.description, canonicalSummary);
  const updatedAt = projectionDate(input.updatedAt ?? asset.updatedAt ?? asset.createdAt);
  const catalogVersion = projectionCatalogVersion(input.catalogVersion);

  return {
    applicationServiceId: scope.applicationServiceId,
    scopePath: scope.scopePath,
    assetType: input.assetType,
    assetId: requiredText(asset.id, "asset.id"),
    canonicalName,
    canonicalSummary,
    localizedNameZh,
    localizedSummaryZh,
    ...(optionalText(asset.domainId) ? { domainId: optionalText(asset.domainId) } : {}),
    ...(optionalText(asset.status) ? { status: optionalText(asset.status) } : {}),
    updatedAt,
    catalogVersion,
    contentDigest: digestCanonicalAsset(input.asset),
    searchDocument: normalizeSearchDocument([canonicalName, canonicalSummary, localizedNameZh, localizedSummaryZh])
  };
}

export function digestCanonicalAsset(asset: ScopedProjectionAsset): string {
  return createHash("sha256").update(stableJson(asset)).digest("hex");
}

export function filterAssetSearchProjectionsByScope(
  rows: readonly AssetSearchProjectionRow[],
  architectureScope: ArchitectureScopeRef
): AssetSearchProjectionRow[] {
  const scope = requireScope(architectureScope);
  return rows.filter(
    (row) => row.applicationServiceId === scope.applicationServiceId && row.scopePath === scope.scopePath
  );
}

export function normalizeSearchDocument(values: readonly string[]): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .join(" ")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = optionalText(value);
    if (text) return text;
  }
  throw new Error("PROJECTION_CANONICAL_TEXT_REQUIRED");
}

function requiredText(value: unknown, field: string): string {
  const text = optionalText(value);
  if (!text) throw new Error(`PROJECTION_REQUIRED_FIELD:${field}`);
  return text;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireScope(value: ArchitectureScopeRef): ArchitectureScopeRef {
  if (!optionalText(value?.applicationServiceId) || !optionalText(value?.scopePath)) {
    throw new Error("PROJECTION_SCOPE_REQUIRED");
  }
  return { applicationServiceId: value.applicationServiceId.trim(), scopePath: value.scopePath.trim() };
}

function optionalScope(value: unknown): ArchitectureScopeRef | undefined {
  const record = asRecord(value);
  if (!optionalText(record.applicationServiceId) && !optionalText(record.scopePath)) return undefined;
  if (!optionalText(record.applicationServiceId) || !optionalText(record.scopePath))
    throw new Error("PROJECTION_SCOPE_REQUIRED");
  return {
    applicationServiceId: String(record.applicationServiceId).trim(),
    scopePath: String(record.scopePath).trim()
  };
}

function sameScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): boolean {
  return left.applicationServiceId === right.applicationServiceId && left.scopePath === right.scopePath;
}

function projectionCatalogVersion(value: bigint | number | string): bigint {
  try {
    const version = BigInt(value);
    if (version < 0n) throw new Error();
    return version;
  } catch {
    throw new Error("PROJECTION_CATALOG_VERSION_INVALID");
  }
}

function projectionDate(value: unknown): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new Error("PROJECTION_UPDATED_AT_INVALID");
  return date;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function stableJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableJsonValue(nested)])
    );
  }
  return value;
}
