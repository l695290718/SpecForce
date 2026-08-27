import { createHash } from "node:crypto";
import type { ArchitectureScopeRef } from "@specforge/core";
import { decodeReadCursor, encodeReadCursor, type ReadCursorBinding } from "./cursor";
import type {
  AssetSummaryRow,
  AuthorizedScopeContext,
  ReadOrderKey,
  ScopedAssetReadQuery,
  ScopedReadPage
} from "./types";

export type NormalizedReadQuery = Omit<ScopedAssetReadQuery, "cursor" | "pageSize"> & { pageSize: number };

export interface AssetRelationshipRow {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description?: string;
  architectureScope: ArchitectureScopeRef;
}

export interface RelationshipReadQuery {
  sourceType?: string;
  sourceId?: string;
  targetType?: string;
  targetId?: string;
  relationType?: string;
  pageSize: number;
  cursor?: string;
}

export interface ScopedAssetReadRepository {
  searchSummaries(scope: ArchitectureScopeRef, query: NormalizedReadQuery, after?: ReadOrderKey): Promise<{ rows: AssetSummaryRow[]; hasMore: boolean }>;
  findSummary(scope: ArchitectureScopeRef, assetType: string, assetId: string): Promise<AssetSummaryRow | undefined>;
  listRelationships(scope: ArchitectureScopeRef, query: RelationshipReadQuery, after?: ReadOrderKey): Promise<{ rows: AssetRelationshipRow[]; hasMore: boolean }>;
}

export type ScopedAssetReadService = ReturnType<typeof createScopedAssetReadService>;

export function createScopedAssetReadService(repository: ScopedAssetReadRepository, limits: { minPageSize?: number; maxPageSize?: number } = {}) {
  const minPageSize = limits.minPageSize ?? 1;
  const maxPageSize = limits.maxPageSize ?? 50;

  return {
    async search(input: { context: AuthorizedScopeContext; query: ScopedAssetReadQuery }): Promise<ScopedReadPage<AssetSummaryRow>> {
      const query = normalizeQuery(input.query, minPageSize, maxPageSize);
      const queryDigest = digest(query);
      const binding = cursorBinding(input.context, queryDigest, query.locale);
      const after = input.query.cursor ? decodeReadCursor(input.query.cursor, binding).orderKey : undefined;
      const page = await repository.searchSummaries(input.context.architectureScope, query, after);
      assertRowsInScope(page.rows, input.context.architectureScope);
      return pageResult(page.rows, page.hasMore, input.context, binding, queryDigest, after);
    },

    async detail(input: { context: AuthorizedScopeContext; assetType: string; assetId: string }): Promise<AssetSummaryRow> {
      const row = await repository.findSummary(input.context.architectureScope, input.assetType, input.assetId);
      if (!row) throw new Error("ASSET_NOT_FOUND");
      assertRowsInScope([row], input.context.architectureScope);
      return row;
    },

    async relationships(input: { context: AuthorizedScopeContext; query: RelationshipReadQuery }): Promise<ScopedReadPage<AssetRelationshipRow>> {
      const query = { ...input.query, pageSize: Math.min(maxPageSize, Math.max(minPageSize, input.query.pageSize)) };
      const queryDigest = digest(query);
      const binding = cursorBinding(input.context, queryDigest, "en");
      const after = input.query.cursor ? decodeReadCursor(input.query.cursor, binding).orderKey : undefined;
      const page = await repository.listRelationships(input.context.architectureScope, query, after);
      assertRowsInScope(page.rows, input.context.architectureScope);
      return pageResult(page.rows, page.hasMore, input.context, binding, queryDigest, after);
    }
  };
}

function normalizeQuery(input: ScopedAssetReadQuery, minPageSize: number, maxPageSize: number): NormalizedReadQuery {
  return {
    assetTypes: input.assetTypes?.map((value) => value.trim()).filter(Boolean).sort(),
    ...(input.domainId?.trim() ? { domainId: input.domainId.trim() } : {}),
    ...(input.query?.trim() ? { query: input.query.trim() } : {}),
    locale: input.locale,
    pageSize: Math.min(maxPageSize, Math.max(minPageSize, input.pageSize)),
    sort: input.sort
  };
}

function cursorBinding(context: AuthorizedScopeContext, queryDigest: string, locale: "en" | "zh"): ReadCursorBinding {
  return {
    subject: context.subject,
    architectureScope: context.architectureScope,
    locale,
    queryDigest,
    catalogVersion: context.catalogVersion,
    projectionVersion: context.projectionVersion
  };
}

function pageResult<T extends { id: string }>(rows: T[], hasMore: boolean, context: AuthorizedScopeContext, binding: ReadCursorBinding, queryDigest: string, after?: ReadOrderKey): ScopedReadPage<T> {
  const last = rows.at(-1);
  const nextCursor = hasMore && last
    ? encodeReadCursor({ version: 1, ...binding, orderKey: orderKey(last, after) })
    : undefined;
  return {
    items: rows,
    hasMore,
    ...(nextCursor ? { nextCursor } : {}),
    catalogVersion: context.catalogVersion,
    projectionVersion: context.projectionVersion,
    resultDigest: digest(rows.map((row) => row.id).concat(queryDigest))
  };
}

function orderKey(row: { id: string; updatedAt?: string }, previous?: ReadOrderKey): ReadOrderKey {
  const key: ReadOrderKey = [row.updatedAt ?? "", row.id];
  if (previous && key.every((part, index) => part === previous[index])) throw new Error("READ_ORDER_KEY_NOT_ADVANCED");
  return key;
}

function assertRowsInScope(rows: Array<{ architectureScope: ArchitectureScopeRef }>, scope: ArchitectureScopeRef): void {
  if (rows.some((row) => row.architectureScope.applicationServiceId !== scope.applicationServiceId || row.architectureScope.scopePath !== scope.scopePath)) {
    throw new Error("READ_SCOPE_MISMATCH");
  }
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_, nested) => typeof nested === "bigint" ? nested.toString() : nested)).digest("hex");
}
