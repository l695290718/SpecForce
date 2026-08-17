import { contentDigest, type ConnectorObservationPageV2, type ConnectorRunDescriptor, type ConnectorV2SourceAdapter } from "@specforge/core";

export const POSTGRES_SCHEMA_SOURCE_NAMESPACE = "postgres-schema-v1";
export const POSTGRES_SCHEMA_MAPPING_VERSION = "postgres-schema-v1";

export interface PostgresCatalogClient {
  query(sql: string, parameters: readonly unknown[]): Promise<{ rows: PostgresCatalogRow[] }>;
}

export interface PostgresSchemaAdapterOptions {
  client: PostgresCatalogClient;
  schemas: readonly string[];
  excludedSchemas?: readonly string[];
  maxRowsPerPage?: number;
  visibilityPolicy?: string;
}

interface PostgresCatalogRow {
  kind: string;
  identity: string;
  payload: Record<string, unknown>;
}

interface CursorState {
  offset: number;
  highWaterMark?: string;
}

export class PostgresSchemaAdapter implements ConnectorV2SourceAdapter {
  readonly kind = "postgres-schema";
  readonly sourceNamespace = POSTGRES_SCHEMA_SOURCE_NAMESPACE;
  private readonly client: PostgresCatalogClient;
  private readonly schemas: readonly string[];
  private readonly excludedSchemas: readonly string[];
  private readonly maxRowsPerPage: number;
  private readonly visibilityPolicy: string;

  constructor(options: PostgresSchemaAdapterOptions) {
    if (!options.schemas.length) throw new Error("POSTGRES_SCHEMA_SELECTION_REQUIRED");
    if (options.schemas.some((schema) => !isSafeSchemaName(schema)) || (options.excludedSchemas ?? []).some((schema) => !isSafeSchemaName(schema))) throw new Error("POSTGRES_SCHEMA_NAME_INVALID");
    this.client = options.client;
    this.schemas = [...new Set(options.schemas)].sort();
    this.excludedSchemas = [...new Set(options.excludedSchemas ?? [])].sort();
    this.maxRowsPerPage = options.maxRowsPerPage ?? 250;
    this.visibilityPolicy = options.visibilityPolicy ?? "catalog-visible-only";
    if (!Number.isInteger(this.maxRowsPerPage) || this.maxRowsPerPage < 1 || this.maxRowsPerPage > 500) throw new Error("POSTGRES_SCHEMA_PAGE_SIZE_INVALID");
  }

  async poll(input: { run: ConnectorRunDescriptor; fencingToken: number; signal?: AbortSignal }): Promise<ConnectorObservationPageV2> {
    if (input.signal?.aborted) throw new Error("CONNECTOR_POLL_ABORTED");
    const cursor = parseCursor(input.run.sourceCursor);
    const result = await this.client.query(POSTGRES_CATALOG_QUERY, [this.schemas, this.excludedSchemas, this.maxRowsPerPage, cursor.offset]);
    if (input.signal?.aborted) throw new Error("CONNECTOR_POLL_ABORTED");
    const observedAt = new Date().toISOString();
    const rows = result.rows.map((row) => toObservation(row, observedAt));
    const isLastPage = rows.length < this.maxRowsPerPage;
    const nextOffset = cursor.offset + rows.length;
    const sourceHighWaterMark = cursor.highWaterMark ?? observedAt;
    const boundary = inventoryBoundaryDigest(this.schemas, this.excludedSchemas, this.visibilityPolicy);
    return {
      sourceCursor: isLastPage ? null : JSON.stringify({ offset: nextOffset, highWaterMark: sourceHighWaterMark } satisfies CursorState),
      sourceHighWaterMark,
      sourceVersion: "postgres-catalog-v1",
      observedAt,
      observations: rows,
      coverage: { complete: isLastPage, selectedSchemas: this.schemas, excludedSchemas: this.excludedSchemas, visibilityPolicy: this.visibilityPolicy, inventoryBoundaryDigest: boundary, readModel: "pg_catalog_only" },
      isLastPage
    };
  }
}

export function inventoryBoundaryDigest(schemas: readonly string[], excludedSchemas: readonly string[], visibilityPolicy = "catalog-visible-only"): string {
  return contentDigest({ schemas: [...schemas].sort(), excludedSchemas: [...excludedSchemas].sort(), visibilityPolicy, sourceNamespace: POSTGRES_SCHEMA_SOURCE_NAMESPACE });
}

function parseCursor(value: string | null): CursorState {
  if (!value) return { offset: 0 };
  try {
    const parsed = JSON.parse(value) as Partial<CursorState>;
    const offset = parsed.offset;
    if (typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 10_000_000) throw new Error();
    return { offset, highWaterMark: typeof parsed.highWaterMark === "string" ? parsed.highWaterMark : undefined };
  } catch {
    throw new Error("POSTGRES_SCHEMA_CURSOR_INVALID");
  }
}

function toObservation(row: PostgresCatalogRow, observedAt: string) {
  return { id: `postgres-schema:${row.kind}:${row.identity}`, operation: "UPSERT" as const, externalAssetType: row.kind, externalId: row.identity, payload: row.payload, sourceVersion: "postgres-catalog-v1", observedAt };
}

function isSafeSchemaName(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/.test(value);
}

export const POSTGRES_CATALOG_QUERY = `
WITH selected_schemas AS (
  SELECT unnest($1::text[]) AS schema_name
), excluded_schemas AS (
  SELECT unnest($2::text[]) AS schema_name
), metadata AS (
  SELECT 'schema'::text AS kind, n.nspname AS identity,
    jsonb_build_object('schema', n.nspname) AS payload
  FROM pg_namespace n JOIN selected_schemas s ON s.schema_name = n.nspname
  WHERE NOT EXISTS (SELECT 1 FROM excluded_schemas e WHERE e.schema_name = n.nspname)
  UNION ALL
  SELECT 'table', c.nspname || '.' || c.relname,
    jsonb_build_object('schema', c.nspname, 'name', c.relname, 'relationKind', c.relkind)
  FROM pg_class r JOIN pg_namespace c ON c.oid = r.relnamespace
  JOIN selected_schemas s ON s.schema_name = c.nspname
  WHERE r.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND NOT EXISTS (SELECT 1 FROM excluded_schemas e WHERE e.schema_name = c.nspname)
  UNION ALL
  SELECT 'column', c.table_schema || '.' || c.table_name || '.' || c.column_name,
    jsonb_build_object('schema', c.table_schema, 'table', c.table_name, 'name', c.column_name, 'ordinal', c.ordinal_position, 'dataType', c.data_type, 'nullable', c.is_nullable)
  FROM information_schema.columns c JOIN selected_schemas s ON s.schema_name = c.table_schema
  WHERE NOT EXISTS (SELECT 1 FROM excluded_schemas e WHERE e.schema_name = c.table_schema)
  UNION ALL
  SELECT 'constraint', tc.constraint_schema || '.' || tc.table_name || '.' || tc.constraint_name,
    jsonb_build_object('schema', tc.constraint_schema, 'table', tc.table_name, 'name', tc.constraint_name, 'type', tc.constraint_type)
  FROM information_schema.table_constraints tc JOIN selected_schemas s ON s.schema_name = tc.constraint_schema
  WHERE NOT EXISTS (SELECT 1 FROM excluded_schemas e WHERE e.schema_name = tc.constraint_schema)
  UNION ALL
  SELECT 'index', n.nspname || '.' || t.relname || '.' || i.relname,
    jsonb_build_object('schema', n.nspname, 'table', t.relname, 'name', i.relname)
  FROM pg_index x JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace
  JOIN selected_schemas s ON s.schema_name = n.nspname
  WHERE NOT EXISTS (SELECT 1 FROM excluded_schemas e WHERE e.schema_name = n.nspname)
  UNION ALL
  SELECT 'enum', n.nspname || '.' || t.typname,
    jsonb_build_object('schema', n.nspname, 'name', t.typname, 'values', jsonb_agg(e.enumlabel ORDER BY e.enumsortorder))
  FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid JOIN selected_schemas s ON s.schema_name = n.nspname
  WHERE NOT EXISTS (SELECT 1 FROM excluded_schemas x WHERE x.schema_name = n.nspname)
  GROUP BY n.nspname, t.typname
)
SELECT kind, identity, payload FROM metadata ORDER BY kind, identity LIMIT $3 OFFSET $4`;
