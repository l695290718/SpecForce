import { describe, expect, it } from "vitest";
import type { ConnectorRunDescriptor } from "@specforge/core";
import { OpenApiSourceAdapter } from "../adapters/openapi";

const run: ConnectorRunDescriptor = { id: "run", connectorId: "connector", kind: "openapi", configuration: {}, sourceNamespace: "openapi-v1", mode: "FULL_SNAPSHOT", snapshotId: "snapshot", mappingVersion: "openapi-v1", mappingDigest: "mapping", inventoryBoundaryDigest: "boundary", acceptedSequence: -1, acceptedBatchDigest: null, sourceCursor: null, sourceHighWaterMark: null, status: "RUNNING", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner" } };

describe("OpenApiSourceAdapter", () => {
  it("normalizes OpenAPI 3.0 and 3.1 operations", async () => {
    const adapter = new OpenApiSourceAdapter({ document: { openapi: "3.1.0", paths: { "/orders": { get: { operationId: "listOrders", responses: { "200": { description: "OK" } } } } } } });
    const page = await adapter.poll({ run, fencingToken: 1 });
    expect(page.observations).toMatchObject([{ externalId: "operation:listOrders", payload: { method: "GET", path: "/orders" } }]);
  });

  it("rejects unsupported versions and reports external references", async () => {
    const unsupported = new OpenApiSourceAdapter({ document: { openapi: "2.0.0", paths: {} } });
    await expect(unsupported.poll({ run, fencingToken: 1 })).rejects.toThrow("OPENAPI_VERSION_UNSUPPORTED");
    const adapter = new OpenApiSourceAdapter({ document: { openapi: "3.0.0", paths: {}, components: { schemas: { Order: { $ref: "https://example.com/schema.json" } } } } });
    await expect(adapter.poll({ run, fencingToken: 1 })).resolves.toMatchObject({ coverage: { unsupportedReferences: ["https://example.com/schema.json"] } });
  });
});
