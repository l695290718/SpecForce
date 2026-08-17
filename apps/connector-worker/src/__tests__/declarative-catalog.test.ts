import { describe, expect, it } from "vitest";
import type { ConnectorRunDescriptor } from "@specforge/core";
import { DeclarativeCatalogAdapter } from "../adapters/declarative-catalog";

const run: ConnectorRunDescriptor = { id: "run", connectorId: "connector", kind: "cmdb-catalog", configuration: {}, sourceNamespace: "declarative-catalog-v1", mode: "FULL_SNAPSHOT", snapshotId: "snapshot", mappingVersion: "catalog-v1", mappingDigest: "mapping", inventoryBoundaryDigest: "boundary", acceptedSequence: -1, acceptedBatchDigest: null, sourceCursor: null, sourceHighWaterMark: null, status: "RUNNING", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner" } };
const profile = { kind: "cmdb-catalog" as const, endpoint: "https://catalog.example.com/services", collectionPointer: "/items", stableIdPointer: "/id", fields: { name: "/name", owner: "/owner" }, nextCursorPointer: "/next", cursorParameter: "pageToken" };
const policy = { getText: async (url: string) => ({ url, status: 200, etag: "v1", contentType: "application/json", text: JSON.stringify({ items: [{ id: "svc-1", name: "Orders", owner: "team-a" }], next: "next-2" }) }) };

describe("DeclarativeCatalogAdapter", () => {
  it("normalizes stable IDs and bounded pagination", async () => {
    const adapter = new DeclarativeCatalogAdapter({ profile, httpPolicy: policy });
    const page = await adapter.poll({ run, fencingToken: 1 });
    expect(page).toMatchObject({ isLastPage: false, sourceCursor: JSON.stringify({ cursor: "next-2", page: 1 }) });
    expect(page.observations[0]).toMatchObject({ externalId: "svc-1", payload: { name: "Orders", owner: "team-a" } });
  });

  it("rejects executable profile fields and missing IDs", async () => {
    expect(() => new DeclarativeCatalogAdapter({ profile: { ...profile, endpoint: "http://catalog.example.com" }, httpPolicy: policy })).toThrow("CATALOG_HTTPS_ENDPOINT_REQUIRED");
    const adapter = new DeclarativeCatalogAdapter({ profile, httpPolicy: { getText: async () => ({ url: "", status: 200, etag: null, contentType: "application/json", text: JSON.stringify({ items: [{ name: "missing" }] }) }) } });
    await expect(adapter.poll({ run, fencingToken: 1 })).rejects.toThrow("CATALOG_STABLE_ID_MISSING");
  });
});
