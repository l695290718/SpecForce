import { contentDigest, type ConnectorObservationPageV2, type ConnectorRunDescriptor, type ConnectorV2SourceAdapter } from "@specforge/core";
export interface CatalogHttpClient { getText(url: string, signal?: AbortSignal): Promise<{ url: string; status: number; etag: string | null; contentType: string; text: string }>; }

export type DeclarativeCatalogKind = "cmdb-catalog" | "runtime-service-catalog";

export interface DeclarativeCatalogProfile {
  kind: DeclarativeCatalogKind;
  endpoint: string;
  collectionPointer: string;
  stableIdPointer: string;
  fields: Record<string, string>;
  operationPointer?: string;
  deletionReasonPointer?: string;
  nextCursorPointer?: string;
  cursorParameter?: string;
  sourceVersion?: string;
  maxPages?: number;
  evidenceExpiresAt?: string;
}

export interface DeclarativeCatalogAdapterOptions { profile: DeclarativeCatalogProfile; httpPolicy: CatalogHttpClient; }

export class DeclarativeCatalogAdapter implements ConnectorV2SourceAdapter {
  readonly kind: DeclarativeCatalogKind;
  readonly sourceNamespace = "declarative-catalog-v1";
  private readonly profile: DeclarativeCatalogProfile;
  private readonly httpPolicy: CatalogHttpClient;

  constructor(options: DeclarativeCatalogAdapterOptions) {
    validateProfile(options.profile);
    this.kind = options.profile.kind;
    this.profile = options.profile;
    this.httpPolicy = options.httpPolicy;
  }

  async poll(input: { run: ConnectorRunDescriptor; fencingToken: number; signal?: AbortSignal }): Promise<ConnectorObservationPageV2> {
    const state = parseCursor(input.run.sourceCursor);
    const url = new URL(this.profile.endpoint);
    if (state.cursor) url.searchParams.set(this.profile.cursorParameter ?? "cursor", state.cursor);
    const response = await this.httpPolicy.getText(url.toString(), input.signal);
    let body: unknown;
    try { body = JSON.parse(response.text); } catch { throw new Error("CATALOG_RESPONSE_INVALID_JSON"); }
    const collection = pointer(body, this.profile.collectionPointer);
    if (!Array.isArray(collection)) throw new Error("CATALOG_COLLECTION_NOT_ARRAY");
    const sourceVersion = this.profile.sourceVersion ?? response.etag ?? "catalog-v1";
    const observations = collection.map((item, index) => this.observation(item, index, sourceVersion));
    const next = this.profile.nextCursorPointer ? pointer(body, this.profile.nextCursorPointer) : undefined;
    const isLastPage = typeof next !== "string" || next.length === 0;
    const observedAt = new Date().toISOString();
    return { sourceCursor: isLastPage ? null : JSON.stringify({ cursor: next, page: state.page + 1 }), sourceHighWaterMark: response.etag ?? observedAt, sourceVersion, observedAt, observations, coverage: { complete: isLastPage, profileDigest: contentDigest(this.profile), page: state.page, itemCount: observations.length, evidenceExpiresAt: this.profile.evidenceExpiresAt ?? null, evidenceExpired: Boolean(this.profile.evidenceExpiresAt && Date.parse(this.profile.evidenceExpiresAt) < Date.now()) }, isLastPage };
  }

  private observation(item: unknown, index: number, sourceVersion: string) {
    const stableId = pointer(item, this.profile.stableIdPointer);
    if (typeof stableId !== "string" || !stableId.trim()) throw new Error(`CATALOG_STABLE_ID_MISSING:${index}`);
    const operationValue = this.profile.operationPointer ? pointer(item, this.profile.operationPointer) : "UPSERT";
    const operation: "UPSERT" | "TOMBSTONE" | null = operationValue === "TOMBSTONE" ? "TOMBSTONE" : operationValue === "UPSERT" ? "UPSERT" : null;
    if (!operation) throw new Error("CATALOG_OPERATION_INVALID");
    const payload = Object.fromEntries(Object.entries(this.profile.fields).map(([name, path]) => [name, pointer(item, path)]));
    return { id: `catalog:${this.kind}:${stableId}`, operation, externalAssetType: this.kind, externalId: stableId, ...(operation === "TOMBSTONE" ? { deletionReason: this.profile.deletionReasonPointer ? String(pointer(item, this.profile.deletionReasonPointer) ?? "source-tombstone") : "source-tombstone" } : { payload }), sourceVersion };
  }
}

function validateProfile(profile: DeclarativeCatalogProfile): void {
  if (!profile.endpoint || !profile.collectionPointer || !profile.stableIdPointer || !profile.kind) throw new Error("CATALOG_PROFILE_REQUIRED");
  if (!/^https:\/\//iu.test(profile.endpoint)) throw new Error("CATALOG_HTTPS_ENDPOINT_REQUIRED");
  if (Object.keys(profile).some((key) => ["script", "module", "expression", "command", "shell", "transform"].includes(key))) throw new Error("CATALOG_EXECUTABLE_FIELD_FORBIDDEN");
  if (!Number.isInteger(profile.maxPages ?? 100) || (profile.maxPages ?? 100) < 1 || (profile.maxPages ?? 100) > 1000) throw new Error("CATALOG_PAGE_LIMIT_INVALID");
  for (const path of [profile.collectionPointer, profile.stableIdPointer, ...Object.values(profile.fields), profile.operationPointer, profile.deletionReasonPointer, profile.nextCursorPointer].filter((value): value is string => Boolean(value))) if (!path.startsWith("/") && path !== "") throw new Error("CATALOG_POINTER_INVALID");
}

function pointer(value: unknown, path: string): unknown {
  if (path === "") return value;
  return path.split("/").slice(1).reduce<unknown>((current, token) => { if (current === null || current === undefined || typeof current !== "object") return undefined; const key = token.replace(/~1/g, "/").replace(/~0/g, "~"); return (current as Record<string, unknown>)[key]; }, value);
}

function parseCursor(value: string | null): { cursor: string | null; page: number } {
  if (!value) return { cursor: null, page: 0 };
  try { const parsed = JSON.parse(value) as { cursor?: unknown; page?: unknown }; if (typeof parsed.cursor !== "string" || !Number.isInteger(parsed.page) || (parsed.page as number) < 1) throw new Error(); return { cursor: parsed.cursor, page: parsed.page as number }; } catch { throw new Error("CATALOG_CURSOR_INVALID"); }
}
