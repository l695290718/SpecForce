import { createServer, type Server, type ServerResponse } from "node:http";
import type { ProcessSummary, ProjectionScope } from "./projector.js";

export interface ProjectionHealthSnapshot {
  backlog: number;
  oldestPendingAgeSeconds: number | null;
  lastCheckpoint: bigint | null;
  retryCount: number;
  deadLetterCount: number;
}

export interface ProjectionHealthRepository {
  health(scope: ProjectionScope, now: Date): Promise<ProjectionHealthSnapshot>;
}

export interface ProjectorProcessor {
  processOnce(): Promise<ProcessSummary>;
}

export interface ProjectorRuntimeOptions {
  projector: ProjectorProcessor;
  healthRepository: ProjectionHealthRepository;
  pollIntervalMs?: number;
  now?: () => Date;
}

export interface ProjectorRuntime {
  listen(port?: number, host?: string): Promise<{ url: string }>;
  close(): Promise<void>;
}

export interface ProjectorRuntimeConfig {
  gatewayUrl: string;
  host: string;
  port: number;
  pollIntervalMs: number;
}

export function runtimeConfigFromEnvironment(env: NodeJS.ProcessEnv): ProjectorRuntimeConfig {
  const gatewayUrl = env.SPECFORGE_GRAPH_GATEWAY_URL?.trim().replace(/\/+$/u, "");
  if (!gatewayUrl) throw new Error("GRAPH_GATEWAY_URL_REQUIRED");
  return {
    gatewayUrl,
    host: env.SPECFORGE_GRAPH_PROJECTOR_HOST?.trim() || "0.0.0.0",
    port: boundedInteger(env.SPECFORGE_GRAPH_PROJECTOR_PORT, 8090, 1, 65_535, "GRAPH_PROJECTOR_PORT_INVALID"),
    pollIntervalMs: boundedInteger(
      env.SPECFORGE_GRAPH_PROJECTOR_POLL_INTERVAL_MS,
      1_000,
      10,
      60_000,
      "GRAPH_PROJECTOR_POLL_INTERVAL_INVALID"
    )
  };
}

export function createProjectorRuntime(options: ProjectorRuntimeOptions): ProjectorRuntime {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const now = options.now ?? (() => new Date());
  let timer: NodeJS.Timeout | undefined;
  let processing = false;
  let stopping = false;
  let activeTick: Promise<void> | undefined;

  const tick = (): Promise<void> => {
    if (processing || stopping) return activeTick ?? Promise.resolve();
    processing = true;
    const run = (async () => {
      try {
        await options.projector.processOnce();
      } catch {
        // Exact-scope health is derived from PostgreSQL and cannot safely
        // attribute a process-level failure to one application service.
      } finally {
        processing = false;
      }
    })();
    activeTick = run;
    void run.finally(() => {
      if (activeTick === run) activeTick = undefined;
    });
    return run;
  };

  const server = createServer(async (request, response) => {
    if (request.method !== "GET" || request.url === undefined) {
      writeJson(response, 404, { status: "unavailable", code: "NOT_FOUND" });
      return;
    }
    const url = new URL(request.url, "http://projector.internal");
    if (url.pathname !== "/health") {
      writeJson(response, 404, { status: "unavailable", code: "NOT_FOUND" });
      return;
    }
    const scope = scopeFromSearchParams(url.searchParams);
    if (scope === undefined) {
      writeJson(response, 400, { status: "unavailable", code: "SCOPE_REQUIRED" });
      return;
    }
    try {
      const health = await options.healthRepository.health(scope, now());
      const code = health.deadLetterCount > 0
        ? "PROJECTOR_DEAD_LETTERS"
        : health.retryCount > 0
          ? "PROJECTOR_RETRIES_PENDING"
          : "OK";
      writeJson(response, 200, {
        status: code === "OK" ? "ok" : "degraded",
        code,
        scope,
        backlog: health.backlog,
        oldestPendingAgeSeconds: health.oldestPendingAgeSeconds,
        lastCheckpoint: health.lastCheckpoint?.toString() ?? null,
        retryCount: health.retryCount,
        deadLetterCount: health.deadLetterCount
      });
    } catch {
      writeJson(response, 503, {
        status: "unavailable",
        code: "PROJECTOR_HEALTH_UNAVAILABLE"
      });
    }
  });

  return {
    async listen(port = 0, host = "127.0.0.1") {
      if (!server.listening) await listen(server, port, host);
      timer ??= setInterval(() => void tick(), pollIntervalMs);
      timer.unref();
      void tick();
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("PROJECTOR_LISTEN_FAILED");
      return { url: `http://${host}:${address.port}` };
    },
    async close() {
      stopping = true;
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
      if (server.listening) await close(server);
      await activeTick;
    }
  };
}

function scopeFromSearchParams(searchParams: URLSearchParams): ProjectionScope | undefined {
  const enterpriseId = searchParams.get("enterpriseId")?.trim();
  const applicationServiceId = searchParams.get("applicationServiceId")?.trim();
  const scopePath = searchParams.get("scopePath")?.trim();
  if (!enterpriseId || !applicationServiceId || !scopePath) return undefined;
  return { enterpriseId, applicationServiceId, scopePath };
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, code: string): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code);
  return parsed;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function listen(server: Server, port: number, host: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  });
}
