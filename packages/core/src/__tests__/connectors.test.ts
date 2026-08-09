import { describe, expect, it, vi } from "vitest";
import {
  ConnectorRuntime,
  buildBatch,
  type ConnectorCheckpoint,
  type ConnectorDeliveryGateway,
  type ConnectorObservationPage,
  type ConnectorRegistrationSnapshot,
  type ConnectorSourceAdapter
} from "../connectors";
import { computeContinuousBatchIntegrity } from "../federation/continuous";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" };
const siblingScope = { applicationServiceId: "com.huawei.celon.policyhub", scopePath: "policy" };

function registration(overrides: Partial<ConnectorRegistrationSnapshot> = {}): ConnectorRegistrationSnapshot {
  return {
    id: "local-repository",
    kind: "local-repository",
    capabilities: ["OBSERVE"],
    status: "ACTIVE",
    architectureScope: scope,
    ...overrides
  };
}

function page(overrides: Partial<ConnectorObservationPage> = {}): ConnectorObservationPage {
  return {
    sourceCursor: "local:v1:source:1",
    sourceVersion: "source-1",
    observedAt: "2026-08-09T00:00:00.000Z",
    observations: [{ id: "observation-1", externalAssetType: "api", externalId: "orders", payload: { method: "GET" }, sourceVersion: "source-1" }],
    coverage: { complete: true },
    hasMore: false,
    ...overrides
  };
}

function source(pages: ConnectorObservationPage[]): ConnectorSourceAdapter {
  return {
    kind: "local-repository",
    sourceNamespace: "local-repository-v1",
    poll: vi.fn(async () => pages.shift() ?? page({ observations: [], hasMore: false }))
  };
}

function gateway(input: { registration?: ConnectorRegistrationSnapshot | null; cursor?: ConnectorCheckpoint | null; submit?: ConnectorDeliveryGateway["submitBatch"] } = {}): ConnectorDeliveryGateway {
  return {
    getConnector: vi.fn(async () => input.registration === undefined ? registration() : input.registration),
    getCursor: vi.fn(async () => input.cursor ?? null),
    submitBatch: input.submit ?? vi.fn(async ({ batch }) => ({ status: "ACCEPTED", batchDigest: batch.batchDigest, idempotent: false }))
  };
}

describe("provider-neutral connector runtime", () => {
  it("builds the first hash-chained batch from an empty checkpoint", () => {
    const built = buildBatch(scope, "local-repository", "local-repository-v1", null, page());
    expect(built.sequence).toBe(0);
    expect(built.previousBatchDigest).toBeNull();
    expect(computeContinuousBatchIntegrity(built)).toMatchObject({ batchDigest: built.batchDigest, payloadDigest: built.payloadDigest });
  });

  it("resumes from the durable checkpoint and keeps the sequence chain", async () => {
    const delivery = gateway({ cursor: { contractVersion: "continuous-observation/v1", acceptedSequence: 4, acceptedBatchDigest: "digest-4", sourceCursor: "local:v1:source:1" } });
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: source([page({ sourceCursor: "local:v1:source:2" })]), gateway: delivery });

    const result = await runtime.pollOnce();

    expect(result.status).toBe("DELIVERED");
    expect(delivery.submitBatch).toHaveBeenCalledWith(expect.objectContaining({
      batch: expect.objectContaining({ sequence: 5, previousBatchDigest: "digest-4", sourceCursor: "local:v1:source:2" })
    }));
  });

  it("does not submit an unchanged source page", async () => {
    const delivery = gateway({ cursor: { contractVersion: "continuous-observation/v1", acceptedSequence: 0, acceptedBatchDigest: "digest-0", sourceCursor: "local:v1:source:1" } });
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: source([page({ observations: [], hasMore: false })]), gateway: delivery });

    const result = await runtime.pollOnce();

    expect(result.status).toBe("IDLE");
    expect(delivery.submitBatch).not.toHaveBeenCalled();
  });

  it("returns idempotent delivery receipts without resetting the source cursor", async () => {
    const delivery = gateway({ submit: vi.fn(async ({ batch }) => ({ status: "ACCEPTED", batchDigest: batch.batchDigest, idempotent: true })) });
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: source([page()]), gateway: delivery });

    const result = await runtime.pollOnce();

    expect(result).toMatchObject({ status: "DELIVERED", idempotent: true, sourceCursor: "local:v1:source:1" });
  });

  it("fails closed for sibling Scope registrations", async () => {
    const delivery = gateway({ registration: registration({ architectureScope: siblingScope }) });
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: source([page()]), gateway: delivery });

    const result = await runtime.pollOnce();

    expect(result).toMatchObject({ status: "FAILED", code: "SCOPE_MISMATCH" });
    expect(delivery.submitBatch).not.toHaveBeenCalled();
  });

  it("fails closed when OBSERVE capability is missing", async () => {
    const delivery = gateway({ registration: registration({ capabilities: [] }) });
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: source([page()]), gateway: delivery });

    const result = await runtime.pollOnce();

    expect(result).toMatchObject({ status: "FAILED", code: "CONNECTOR_CAPABILITY_MISSING" });
  });

  it("uses bounded exponential backoff for transient delivery failures", async () => {
    let now = new Date("2026-08-09T00:00:00.000Z");
    const delivery = gateway({ submit: vi.fn(async () => { throw new Error("TEMPORARY_DATABASE_FAILURE"); }) });
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: source([page(), page()]), gateway: delivery, baseBackoffMs: 10, maxBackoffMs: 15, now: () => now });

    const first = await runtime.pollOnce();
    const second = await runtime.pollOnce();
    now = new Date(now.getTime() + 10);
    const third = await runtime.pollOnce();

    expect(first.status).toBe("BACKOFF");
    expect(second.status).toBe("BACKOFF");
    expect(third.status).toBe("BACKOFF");
    expect(runtime.status()).toMatchObject({ state: "BACKOFF", failureCount: 2, nextRetryAt: "2026-08-09T00:00:00.025Z" });
  });

  it("supports lifecycle stop and does not poll after stopping", async () => {
    const adapter = source([page()]);
    const runtime = new ConnectorRuntime({ architectureScope: scope, connectorId: "local-repository", source: adapter, gateway: gateway() });
    runtime.start();
    runtime.stop();

    const result = await runtime.pollOnce();

    expect(result.status).toBe("STOPPED");
    expect(adapter.poll).not.toHaveBeenCalled();
  });
});
