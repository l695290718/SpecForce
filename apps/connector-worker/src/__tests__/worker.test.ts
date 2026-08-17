import { describe, expect, it } from "vitest";
import { ConnectorAdapterRegistry } from "../adapter-registry";
import { ConnectorScheduler } from "../scheduler";
import { EnvironmentSecretResolver } from "../secret-resolver";
import type { ConnectorObservationPageV2, ConnectorRunDescriptor, ConnectorV2WorkerGateway } from "@specforge/core";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/desiner" } as const;

function run(): ConnectorRunDescriptor {
  return { id: "run-1", connectorId: "connector-1", kind: "postgres-schema", configuration: {}, sourceNamespace: "postgres", mode: "FULL_SNAPSHOT", snapshotId: "snapshot-1", mappingVersion: "mapping-v1", mappingDigest: "mapping-digest", inventoryBoundaryDigest: "boundary-digest", acceptedSequence: -1, acceptedBatchDigest: null, sourceCursor: null, sourceHighWaterMark: null, status: "QUEUED", architectureScope: scope };
}

function page(): ConnectorObservationPageV2 {
  return { sourceCursor: "cursor-1", sourceHighWaterMark: "high-water-1", sourceVersion: "source-1", observedAt: "2026-08-17T00:00:00.000Z", coverage: { complete: true }, isLastPage: true, observations: [{ id: "observation-1", operation: "UPSERT", externalAssetType: "table", externalId: "public.orders", payload: { columns: [] }, sourceVersion: "source-1" }] };
}

describe("connector worker", () => {
  it("resolves only approved secret references", async () => {
    const resolver = new EnvironmentSecretResolver({ environment: { DATABASE_PASSWORD: "admin" } });
    await expect(resolver.resolve("env:DATABASE_PASSWORD")).resolves.toBe("admin");
    await expect(resolver.resolve("file:password.txt")).rejects.toThrow("SECRET_REFERENCE_UNSUPPORTED");
    await expect(resolver.resolve("env:MISSING_SECRET")).rejects.toThrow("SECRET_NOT_FOUND");
  });

  it("registers versioned adapters and rejects unsupported mappings", () => {
    const registry = new ConnectorAdapterRegistry();
    registry.register({ kind: "postgres-schema", contractVersion: "continuous-observation/v2", mappingVersions: ["mapping-v1"], factory: () => ({ kind: "postgres-schema", sourceNamespace: "postgres", poll: async () => page() }) });
    expect(registry.create({ kind: "postgres-schema", contractVersion: "continuous-observation/v2", mappingVersion: "mapping-v1", configuration: {}, secrets: new EnvironmentSecretResolver({ environment: {} }) }).kind).toBe("postgres-schema");
    expect(() => registry.create({ kind: "postgres-schema", contractVersion: "continuous-observation/v2", mappingVersion: "mapping-v2", configuration: {}, secrets: new EnvironmentSecretResolver({ environment: {} }) })).toThrow("CONNECTOR_MAPPING_UNSUPPORTED");
  });

  it("claims, submits and finalizes one complete snapshot", async () => {
    const calls: string[] = [];
    const gateway: ConnectorV2WorkerGateway = {
      listDueRuns: async () => [run()],
      claimRun: async ({ runId }) => { calls.push(`claim:${runId}`); return { run: run(), fencingToken: 7 }; },
      heartbeat: async () => { calls.push("heartbeat"); },
      submitBatch: async ({ batch }) => { calls.push(`submit:${batch.sequence}`); return { batchDigest: batch.batchDigest, idempotent: false }; },
      finalize: async ({ fencingToken }) => { calls.push(`finalize:${fencingToken}`); },
      recordFailure: async ({ code }) => { calls.push(`failure:${code}`); }
    };
    const registry = new ConnectorAdapterRegistry();
    registry.register({ kind: "postgres-schema", contractVersion: "continuous-observation/v2", mappingVersions: ["mapping-v1"], factory: () => ({ kind: "postgres-schema", sourceNamespace: "postgres", poll: async () => page() }) });
    const result = await new ConnectorScheduler({ gateway, registry, owner: "worker-a", now: () => new Date("2026-08-17T00:00:00.000Z") }).runOnce();
    expect(result).toMatchObject({ claimed: 1, delivered: 1, finalized: 1, failed: 0 });
    expect(calls).toEqual(["claim:run-1", "submit:0", "heartbeat", "finalize:7"]);
  });

  it("records an adapter failure without leaking secret material", async () => {
    const failures: string[] = [];
    const gateway: ConnectorV2WorkerGateway = {
      listDueRuns: async () => [run()],
      claimRun: async () => { throw new Error("authorization: bearer-secret"); },
      heartbeat: async () => undefined,
      submitBatch: async () => ({ batchDigest: "", idempotent: false }),
      finalize: async () => undefined,
      recordFailure: async ({ message, code }) => { failures.push(`${code}:${message}`); }
    };
    const result = await new ConnectorScheduler({ gateway, registry: new ConnectorAdapterRegistry(), owner: "worker-a" }).runOnce();
    expect(result.failures).toEqual([{ runId: "run-1", code: "CONNECTOR_WORKER_RUN_FAILED" }]);
    expect(failures[0]).toContain("authorization=[REDACTED]");
    expect(failures[0]).not.toContain("bearer-secret");
  });
});
