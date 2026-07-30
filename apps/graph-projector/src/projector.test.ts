import { describe, expect, it } from "vitest";
import {
  GraphProjector,
  type ClaimedProjection,
  type GraphGateway,
  type ProjectionRepository
} from "./projector.js";

const now = new Date("2026-07-26T00:00:00.000Z");
const scope = {
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

describe("GraphProjector", () => {
  it("replays a duplicate event through the same idempotency key without advancing its checkpoint twice", async () => {
    const event = projection({ id: "outbox-1", graphVersion: 4n });
    const repository = new MemoryRepository([event, event]);
    const gateway = new RecordingGateway();
    const projector = new GraphProjector(repository, gateway, { now: () => now });

    await projector.processOnce();

    expect(gateway.deliveries.map(({ idempotencyKey }) => idempotencyKey)).toEqual([event.idempotencyKey, event.idempotencyKey]);
    expect(repository.checkpoints.get(scopeKey(event))).toBe(4n);
    expect(repository.completed).toHaveLength(2);
  });

  it("reclaims an event after its delivery lease expires", async () => {
    const event = projection({ status: "DELIVERING", leaseOwner: "stale-worker", leaseExpiresAt: new Date("2026-07-25T23:59:59.000Z") });
    const repository = new MemoryRepository([event]);
    const gateway = new RecordingGateway();
    const projector = new GraphProjector(repository, gateway, { workerId: "replacement-worker", now: () => now });

    await projector.processOnce();

    expect(gateway.deliveries).toHaveLength(1);
    expect(repository.claimed[0]).toMatchObject({ id: event.id, leaseOwner: "replacement-worker" });
  });

  it("backs off a failed delivery and dead-letters it at the bounded retry limit", async () => {
    const event = projection({ attemptCount: 0 });
    const repository = new MemoryRepository([event]);
    const gateway = new RecordingGateway(new Error("nebula password=super-secret unavailable"));
    const projector = new GraphProjector(repository, gateway, { now: () => now, maxAttempts: 2, baseRetryDelayMs: 1_000 });

    await expect(projector.processOnce()).resolves.toMatchObject({ retried: 1, deadLettered: 0 });
    expect(repository.retries[0]).toMatchObject({ availableAt: new Date("2026-07-26T00:00:01.000Z") });
    expect(repository.retries[0]?.diagnosticRef).toMatch(/^[a-f0-9]{64}$/u);
    expect(repository.retries[0]?.diagnostic).not.toContain("super-secret");

    repository.ready = [projection({ ...event, attemptCount: 1 })];
    await expect(projector.processOnce()).resolves.toMatchObject({ retried: 0, deadLettered: 1 });
    expect(repository.deadLetters[0]?.diagnosticRef).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("does not advance an exact-scope checkpoint past a failed lower graph version", async () => {
    const lower = projection({ id: "outbox-lower", graphVersion: 3n });
    const higher = projection({ id: "outbox-higher", graphVersion: 4n });
    const repository = new MemoryRepository([lower, higher]);
    const gateway = new RecordingGateway((event) => event.graphVersion === 3n ? new Error("lower version failed") : undefined);
    const projector = new GraphProjector(repository, gateway, { now: () => now });

    await projector.processOnce();

    expect(repository.checkpoints.get(scopeKey(lower))).toBeUndefined();
    expect(repository.completed.map((event) => event.graphVersion)).toEqual([]);
    expect(repository.retries.map((event) => event.id)).toEqual([lower.id]);
    expect(gateway.deliveries.map((event) => event.graphVersion)).toEqual([3n]);
  });

  it("advances sibling application-service checkpoints independently", async () => {
    const designer = projection({ id: "outbox-designer", graphVersion: 7n });
    const policy = projection({
      id: "outbox-policy",
      applicationServiceId: "com.huawei.celon.policyhub",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub",
      graphVersion: 11n
    });
    const repository = new MemoryRepository([designer, policy]);
    const gateway = new RecordingGateway();
    const projector = new GraphProjector(repository, gateway, { now: () => now });

    await projector.processOnce();

    expect(repository.checkpoints).toEqual(new Map([
      [scopeKey(designer), 7n],
      [scopeKey(policy), 11n]
    ]));
    expect(gateway.deliveries.map((event) => ({
      applicationServiceId: event.applicationServiceId,
      scopePath: event.scopePath
    }))).toEqual([
      {
        applicationServiceId: designer.applicationServiceId,
        scopePath: designer.scopePath
      },
      {
        applicationServiceId: policy.applicationServiceId,
        scopePath: policy.scopePath
      }
    ]);
  });

  it("continues a sibling scope after another scope fails", async () => {
    const failedDesigner = projection({ id: "outbox-designer-failed", graphVersion: 3n });
    const policy = projection({
      id: "outbox-policy",
      applicationServiceId: "com.huawei.celon.policyhub",
      scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub",
      graphVersion: 11n
    });
    const blockedDesigner = projection({ id: "outbox-designer-blocked", graphVersion: 4n });
    const repository = new MemoryRepository([failedDesigner, policy, blockedDesigner]);
    const gateway = new RecordingGateway((event) =>
      event.id === failedDesigner.id ? new Error("designer unavailable") : undefined
    );
    const projector = new GraphProjector(repository, gateway, { now: () => now });

    await expect(projector.processOnce()).resolves.toEqual({
      claimed: 3,
      completed: 1,
      retried: 1,
      deadLettered: 0
    });

    expect(gateway.deliveries.map((event) => event.id)).toEqual([
      failedDesigner.id,
      policy.id
    ]);
    expect(repository.checkpoints.get(scopeKey(policy))).toBe(11n);
    expect(repository.checkpoints.get(scopeKey(failedDesigner))).toBeUndefined();
  });
});

class RecordingGateway implements GraphGateway {
  readonly deliveries: ClaimedProjection[] = [];

  constructor(private readonly result: Error | ((event: ClaimedProjection) => Error | undefined) | undefined = undefined) {}

  async project(event: ClaimedProjection): Promise<void> {
    this.deliveries.push(event);
    const failure = typeof this.result === "function" ? this.result(event) : this.result;
    if (failure) throw failure;
  }
}

class MemoryRepository implements ProjectionRepository {
  ready: ClaimedProjection[];
  readonly claimed: ClaimedProjection[] = [];
  readonly completed: ClaimedProjection[] = [];
  readonly retries: Array<ClaimedProjection & { availableAt: Date; diagnostic: string; diagnosticRef: string }> = [];
  readonly deadLetters: Array<ClaimedProjection & { diagnostic: string; diagnosticRef: string }> = [];
  readonly checkpoints = new Map<string, bigint>();

  constructor(events: ClaimedProjection[]) {
    this.ready = events;
  }

  async claim(input: { owner: string; now: Date }) {
    const available = this.ready.filter((event) => event.status === "PENDING" || (event.status === "DELIVERING" && event.leaseExpiresAt! <= input.now));
    this.ready = [];
    const claimed = available.map((event) => ({ ...event, status: "DELIVERING" as const, leaseOwner: input.owner, leaseExpiresAt: new Date(input.now.getTime() + 30_000), attemptCount: event.attemptCount + 1 }));
    this.claimed.push(...claimed);
    return claimed;
  }

  async complete(event: ClaimedProjection) {
    this.completed.push(event);
    const key = scopeKey(event);
    const previous = this.checkpoints.get(key) ?? 0n;
    this.checkpoints.set(key, event.graphVersion > previous ? event.graphVersion : previous);
    return true;
  }

  async retry(event: ClaimedProjection, input: { availableAt: Date; diagnostic: string; diagnosticRef: string }) {
    this.retries.push({ ...event, ...input });
    return true;
  }

  async deadLetter(event: ClaimedProjection, input: { diagnostic: string; diagnosticRef: string }) {
    this.deadLetters.push({ ...event, ...input });
    return true;
  }
}

function projection(overrides: Partial<ClaimedProjection> = {}): ClaimedProjection {
  return {
    id: "outbox-1",
    ...scope,
    relationshipEventId: "event-1",
    graphVersion: 1n,
    eventType: "RELATIONSHIP_UPSERT",
    payload: { eventId: "event-1" },
    idempotencyKey: "relationship-command:outbox-1",
    status: "PENDING",
    attemptCount: 0,
    ...overrides
  };
}

function scopeKey(event: ClaimedProjection): string {
  return `${event.enterpriseId}:${event.applicationServiceId}:${event.scopePath}`;
}
