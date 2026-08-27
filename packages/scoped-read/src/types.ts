import type { ArchitectureScopeRef } from "@specforge/core";

export type ReadLocale = "en" | "zh";

export type AuthorizedScopeContext = {
  subject: string;
  tenantId?: string;
  architectureScope: ArchitectureScopeRef;
  catalogVersion: string;
  projectionVersion: string;
};

export type AssetSummaryRow = {
  id: string;
  type: string;
  name: string;
  summary: string;
  domainId?: string;
  status?: string;
  updatedAt: string;
  contentDigest: string;
  architectureScope: AuthorizedScopeContext["architectureScope"];
};

export type ScopedReadPage<T> = {
  items: T[];
  total?: number;
  hasMore: boolean;
  nextCursor?: string;
  catalogVersion: string;
  projectionVersion: string;
  resultDigest: string;
};

export type ScopedAssetReadQuery = {
  assetTypes?: string[];
  domainId?: string;
  query?: string;
  locale: ReadLocale;
  pageSize: number;
  cursor?: string;
  sort: "relevance" | "updatedAt";
};

export type ScopedDetailQuery = {
  assetType: string;
  assetId: string;
  locale: ReadLocale;
  include?: Array<"canonical" | "relationships" | "governance" | "markdown">;
};

export type ReadOrderKey = readonly (string | number)[];
