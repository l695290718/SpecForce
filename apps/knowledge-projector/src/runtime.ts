import { createServer, type Server, type ServerResponse } from "node:http";
import type { ArchitectureScopeRef } from "@specforge/core";
import type { ProjectionBuildHealth, ProjectionBuildRepository } from "./repository.js";
import type { ProjectionMaterializer } from "./materializer.js";

export interface KnowledgeProjectorRuntimeOptions { materializer: ProjectionMaterializer; repository: ProjectionBuildRepository; pollIntervalMs?: number; now?: () => Date; }
export interface KnowledgeProjectorRuntime { listen(port?: number, host?: string): Promise<{ url: string }>; close(): Promise<void>; }

export function createKnowledgeProjectorRuntime(options: KnowledgeProjectorRuntimeOptions): KnowledgeProjectorRuntime {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  const now = options.now ?? (() => new Date());
  let timer: NodeJS.Timeout | undefined;
  let stopping = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (active || stopping) return active ?? Promise.resolve();
    active = options.materializer.processOnce().then(() => undefined).catch(() => undefined).finally(() => { active = undefined; });
    return active;
  };
  const server = createServer(async (request, response) => {
    if (request.method !== "GET") return writeJson(response, 404, { status: "unavailable", code: "NOT_FOUND" });
    const url = new URL(request.url ?? "/", "http://knowledge-projector.internal");
    if (url.pathname !== "/health") return writeJson(response, 404, { status: "unavailable", code: "NOT_FOUND" });
    const scope = readScope(url.searchParams);
    if (!scope) return writeJson(response, 400, { status: "unavailable", code: "SCOPE_REQUIRED" });
    try {
      const health = await options.repository.health(scope, now());
      return writeJson(response, health.status === "unavailable" ? 503 : 200, health);
    } catch {
      return writeJson(response, 503, { status: "unavailable", code: "PROJECTION_HEALTH_UNAVAILABLE", queued: 0, building: 0, failed: 0, oldestQueuedAgeSeconds: null, lastPublishedAt: null });
    }
  });
  return {
    async listen(port = 0, host = "127.0.0.1") { if (!server.listening) await listenServer(server, port, host); timer ??= setInterval(() => void tick(), pollIntervalMs); timer.unref(); void tick(); const address = server.address(); if (!address || typeof address === "string") throw new Error("KNOWLEDGE_PROJECTOR_LISTEN_FAILED"); return { url: `http://${host}:${address.port}` }; },
    async close() { stopping = true; if (timer) { clearInterval(timer); timer = undefined; } if (server.listening) await closeServer(server); await active; }
  };
}

export function runtimeConfigFromEnvironment(env: NodeJS.ProcessEnv): { host: string; port: number; pollIntervalMs: number; leaseDurationMs: number } { return { host: env.SPECFORGE_KNOWLEDGE_PROJECTOR_HOST?.trim() || "0.0.0.0", port: bounded(env.SPECFORGE_KNOWLEDGE_PROJECTOR_PORT, 8091, 1, 65_535, "KNOWLEDGE_PROJECTOR_PORT_INVALID"), pollIntervalMs: bounded(env.SPECFORGE_KNOWLEDGE_PROJECTOR_POLL_INTERVAL_MS, 1_000, 10, 60_000, "KNOWLEDGE_PROJECTOR_POLL_INTERVAL_INVALID"), leaseDurationMs: bounded(env.SPECFORGE_KNOWLEDGE_PROJECTOR_LEASE_MS, 300_000, 1_000, 3_600_000, "KNOWLEDGE_PROJECTOR_LEASE_INVALID") }; }
function readScope(params: URLSearchParams): ArchitectureScopeRef | undefined { const applicationServiceId = params.get("applicationServiceId")?.trim(); const scopePath = params.get("scopePath")?.trim(); return applicationServiceId && scopePath ? { applicationServiceId, scopePath } : undefined; }
function bounded(value: string | undefined, fallback: number, min: number, max: number, code: string): number { if (!value?.trim()) return fallback; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(code); return parsed; }
function writeJson(response: ServerResponse, status: number, body: unknown): void { response.writeHead(status, { "content-type": "application/json; charset=utf-8" }); response.end(JSON.stringify(body)); }
function listenServer(server: Server, port: number, host: string): Promise<void> { return new Promise((resolve, reject) => { const onError = (error: Error) => { server.off("listening", onListening); reject(error); }; const onListening = () => { server.off("error", onError); resolve(); }; server.once("error", onError); server.once("listening", onListening); server.listen(port, host); }); }
function closeServer(server: Server): Promise<void> { return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
