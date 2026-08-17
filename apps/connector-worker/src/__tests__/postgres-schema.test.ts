import { describe, expect, it } from "vitest";
import type { ConnectorRunDescriptor } from "@specforge/core";
import { inventoryBoundaryDigest, PostgresSchemaAdapter, POSTGRES_CATALOG_QUERY } from "../adapters/postgres-schema";

const run: ConnectorRunDescriptor = { id: "run", connectorId: "connector", kind: "postgres-schema", configuration: {}, sourceNamespace: "postgres-schema-v1", mode: "FULL_SNAPSHOT", snapshotId: "snapshot", mappingVersion: "postgres-schema-v1", mappingDigest: "mapping", inventoryBoundaryDigest: "boundary", acceptedSequence: -1, acceptedBatchDigest: null, sourceCursor: null, sourceHighWaterMark: null, status: "RUNNING", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner" } };

describe("PostgresSchemaAdapter", () => {
  it("reads catalog rows deterministically without business-table SQL", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const adapter = new PostgresSchemaAdapter({ schemas: ["public"], excludedSchemas: ["audit"], maxRowsPerPage: 2, client: { query: async (sql, parameters) => { queries.push({ sql, parameters }); return { rows: [{ kind: "table", identity: "public.orders", payload: { schema: "public", name: "orders" } }, { kind: "column", identity: "public.orders.id", payload: { dataType: "uuid" } }] }; } } });
    const page = await adapter.poll({ run, fencingToken: 1 });
    expect(page.observations.map((item) => item.externalId)).toEqual(["public.orders", "public.orders.id"]);
    expect(page.isLastPage).toBe(false);
    expect(queries[0]?.parameters).toEqual([["public"], ["audit"], 2, 0]);
    expect(queries[0]?.sql).toBe(POSTGRES_CATALOG_QUERY);
    expect(queries[0]?.sql).not.toMatch(/SELECT\s+\*\s+FROM\s+public\./iu);
    expect(page.coverage).toMatchObject({ readModel: "pg_catalog_only", inventoryBoundaryDigest: inventoryBoundaryDigest(["public"], ["audit"]) });
  });

  it("rejects unsafe names and malformed cursors", async () => {
    expect(() => new PostgresSchemaAdapter({ schemas: ["public;drop"], client: { query: async () => ({ rows: [] }) } })).toThrow("POSTGRES_SCHEMA_NAME_INVALID");
    const adapter = new PostgresSchemaAdapter({ schemas: ["public"], client: { query: async () => ({ rows: [] }) } });
    await expect(adapter.poll({ run: { ...run, sourceCursor: "not-json" }, fencingToken: 1 })).rejects.toThrow("POSTGRES_SCHEMA_CURSOR_INVALID");
  });
});
