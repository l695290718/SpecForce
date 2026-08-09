import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMcpConnectorRuntime } from "./runtime";
import type { ConnectorSourceAdapter } from "@specforge/core";
import * as federationPersistence from "../federation/persistence";
import * as continuousPersistence from "../federation/continuous-persistence";

vi.mock("../federation/persistence", () => ({ listConnectors: vi.fn() }));
vi.mock("../federation/continuous-persistence", () => ({ getContinuousObservationCursor: vi.fn(), submitContinuousObservationBatch: vi.fn() }));

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
const source: ConnectorSourceAdapter = {
  kind: "local-repository",
  sourceNamespace: "local-repository-v1",
  poll: vi.fn(async () => ({
    sourceCursor: "local-repository:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:1",
    sourceVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    observedAt: "2026-08-09T00:00:00.000Z",
    observations: [{ id: "observation-1", externalAssetType: "api-contract", externalId: "api/openapi.yaml:1", payload: { title: "Orders" }, sourceVersion: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
    coverage: { complete: true },
    hasMore: false
  }))
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(federationPersistence.listConnectors).mockResolvedValue([{ id: "local-repository", kind: "local-repository", capabilities: ["OBSERVE"], status: "ACTIVE", architectureScope: scope }]);
  vi.mocked(continuousPersistence.getContinuousObservationCursor).mockResolvedValue(null);
  vi.mocked(continuousPersistence.submitContinuousObservationBatch).mockResolvedValue({
    status: "ACCEPTED", batchDigest: "batch-1", idempotent: false, architectureScope: scope,
    connectorId: "local-repository", sourceNamespace: "local-repository-v1", sequence: 0,
    previousBatchDigest: null, payloadDigest: "payload-1", observationCount: 1, acceptedAt: "2026-08-09T00:00:00.000Z"
  });
});

describe("MCP connector runtime bridge", () => {
  it("uses the exact Scope connector and existing continuous persistence APIs", async () => {
    const runtime = createMcpConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source });

    const result = await runtime.pollOnce();

    expect(result).toMatchObject({ status: "DELIVERED", sequence: 0, batchDigest: "batch-1" });
    expect(federationPersistence.listConnectors).toHaveBeenCalledWith(scope);
    expect(continuousPersistence.getContinuousObservationCursor).toHaveBeenCalledWith(scope, "local-repository", "local-repository-v1");
    expect(continuousPersistence.submitContinuousObservationBatch).toHaveBeenCalledWith(expect.objectContaining({ architectureScope: scope }));
  });

  it("does not deliver when the connector is absent from the exact Scope", async () => {
    vi.mocked(federationPersistence.listConnectors).mockResolvedValue([]);
    const runtime = createMcpConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source });

    const result = await runtime.pollOnce();

    expect(result).toMatchObject({ status: "FAILED", code: "CONNECTOR_NOT_FOUND" });
    expect(continuousPersistence.submitContinuousObservationBatch).not.toHaveBeenCalled();
  });
});
