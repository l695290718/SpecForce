import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProjectorRuntime,
  runtimeConfigFromEnvironment,
  type ProjectionHealthRepository,
  type ProjectionHealthSnapshot
} from "./runtime.js";
import type { ProcessSummary, ProjectionScope } from "./projector.js";

const scope: ProjectionScope = {
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const running: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((runtime) => runtime.close()));
});

describe("graph projector HTTP runtime", () => {
  it("requires an explicit Gateway URL for the executable runtime", () => {
    expect(() => runtimeConfigFromEnvironment({
      SPECFORGE_GRAPH_PROJECTOR_PORT: "8090"
    })).toThrow("GRAPH_GATEWAY_URL_REQUIRED");
  });

  it("parses bounded executable runtime settings", () => {
    expect(runtimeConfigFromEnvironment({
      SPECFORGE_GRAPH_GATEWAY_URL: "http://graph-gateway:8088/",
      SPECFORGE_GRAPH_PROJECTOR_HOST: "0.0.0.0",
      SPECFORGE_GRAPH_PROJECTOR_PORT: "8091",
      SPECFORGE_GRAPH_PROJECTOR_POLL_INTERVAL_MS: "250"
    })).toEqual({
      gatewayUrl: "http://graph-gateway:8088",
      host: "0.0.0.0",
      port: 8091,
      pollIntervalMs: 250
    });
  });

  it("reports exact-scope projection health without exposing repository diagnostics", async () => {
    const healthRepository = new RecordingHealthRepository({
      backlog: 7,
      oldestPendingAgeSeconds: 42,
      lastCheckpoint: 19n,
      retryCount: 3,
      deadLetterCount: 1
    });
    const runtime = createProjectorRuntime({
      projector: new IdleProjector(),
      healthRepository,
      pollIntervalMs: 60_000,
      now: () => new Date("2026-07-28T10:00:00.000Z")
    });
    running.push(runtime);
    const { url } = await runtime.listen();

    const response = await fetch(`${url}/health?${scopeSearchParams()}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "degraded",
      code: "PROJECTOR_DEAD_LETTERS",
      scope,
      backlog: 7,
      oldestPendingAgeSeconds: 42,
      lastCheckpoint: "19",
      retryCount: 3,
      deadLetterCount: 1
    });
    expect(healthRepository.calls).toEqual([
      { scope, now: new Date("2026-07-28T10:00:00.000Z") }
    ]);
  });

  it("requires the complete exact scope", async () => {
    const healthRepository = new RecordingHealthRepository(emptyHealth());
    const runtime = createProjectorRuntime({
      projector: new IdleProjector(),
      healthRepository,
      pollIntervalMs: 60_000
    });
    running.push(runtime);
    const { url } = await runtime.listen();

    const response = await fetch(`${url}/health?enterpriseId=enterprise-1`);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      status: "unavailable",
      code: "SCOPE_REQUIRED"
    });
    expect(healthRepository.calls).toEqual([]);
  });

  it("sanitizes health repository failures", async () => {
    const healthRepository: ProjectionHealthRepository = {
      async health() {
        throw new Error("password=super-secret postgresql://admin:admin@db/specforge");
      }
    };
    const runtime = createProjectorRuntime({
      projector: new IdleProjector(),
      healthRepository,
      pollIntervalMs: 60_000
    });
    running.push(runtime);
    const { url } = await runtime.listen();

    const response = await fetch(`${url}/health?${scopeSearchParams()}`);
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(503);
    expect(body).toBe(JSON.stringify({
      status: "unavailable",
      code: "PROJECTOR_HEALTH_UNAVAILABLE"
    }));
    expect(body).not.toContain("super-secret");
    expect(body).not.toContain("postgresql://");
  });

  it("reports a sanitized schema-not-ready health code", async () => {
    const healthRepository: ProjectionHealthRepository = {
      async health() {
        throw Object.assign(new Error("PROJECTOR_SCHEMA_NOT_READY"), {
          name: "ProjectionHealthError",
          code: "PROJECTOR_SCHEMA_NOT_READY"
        });
      }
    };
    const runtime = createProjectorRuntime({
      projector: new IdleProjector(),
      healthRepository,
      pollIntervalMs: 60_000
    });
    running.push(runtime);
    const { url } = await runtime.listen();

    const response = await fetch(`${url}/health?${scopeSearchParams()}`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: "unavailable",
      code: "PROJECTOR_SCHEMA_NOT_READY"
    });
  });

  it("does not leak another scope's loop retry into exact-scope health", async () => {
    const runtime = createProjectorRuntime({
      projector: {
        async processOnce() {
          return { claimed: 1, completed: 0, retried: 1, deadLettered: 0 };
        }
      },
      healthRepository: new RecordingHealthRepository(emptyHealth()),
      pollIntervalMs: 60_000
    });
    running.push(runtime);
    const { url } = await runtime.listen();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const response = await fetch(`${url}/health?${scopeSearchParams()}`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: "ok",
      code: "OK",
      scope
    });
  });

  it("executes the projector loop and stops cleanly", async () => {
    const processOnce = vi.fn(async (): Promise<ProcessSummary> => ({
      claimed: 0,
      completed: 0,
      retried: 0,
      deadLettered: 0
    }));
    const runtime = createProjectorRuntime({
      projector: { processOnce },
      healthRepository: new RecordingHealthRepository(emptyHealth()),
      pollIntervalMs: 5
    });
    running.push(runtime);

    await runtime.listen();
    await vi.waitFor(() => expect(processOnce).toHaveBeenCalled());
    await runtime.close();
    const callCount = processOnce.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(processOnce).toHaveBeenCalledTimes(callCount);
  });

  it("waits for an in-flight projection before closing its dependencies", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const processOnce = vi.fn(async (): Promise<ProcessSummary> => {
      await blocked;
      return { claimed: 0, completed: 0, retried: 0, deadLettered: 0 };
    });
    const runtime = createProjectorRuntime({
      projector: { processOnce },
      healthRepository: new RecordingHealthRepository(emptyHealth()),
      pollIntervalMs: 60_000
    });
    running.push(runtime);
    await runtime.listen();
    await vi.waitFor(() => expect(processOnce).toHaveBeenCalledTimes(1));

    let closed = false;
    const closing = runtime.close().then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(closed).toBe(false);
    release?.();
    await closing;
    expect(closed).toBe(true);
  });
});

class RecordingHealthRepository implements ProjectionHealthRepository {
  readonly calls: Array<{ scope: ProjectionScope; now: Date }> = [];

  constructor(private readonly snapshot: ProjectionHealthSnapshot) {}

  async health(exactScope: ProjectionScope, now: Date): Promise<ProjectionHealthSnapshot> {
    this.calls.push({ scope: exactScope, now });
    return this.snapshot;
  }
}

class IdleProjector {
  async processOnce(): Promise<ProcessSummary> {
    return { claimed: 0, completed: 0, retried: 0, deadLettered: 0 };
  }
}

function emptyHealth(): ProjectionHealthSnapshot {
  return {
    backlog: 0,
    oldestPendingAgeSeconds: null,
    lastCheckpoint: null,
    retryCount: 0,
    deadLetterCount: 0
  };
}

function scopeSearchParams(): URLSearchParams {
  return new URLSearchParams({
    enterpriseId: scope.enterpriseId,
    applicationServiceId: scope.applicationServiceId,
    scopePath: scope.scopePath
  });
}
