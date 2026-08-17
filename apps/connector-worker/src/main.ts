import { createServer } from "node:http";
import { PrismaConnectorWorkerGateway } from "./prisma-gateway";
import { ConnectorAdapterRegistry } from "./adapter-registry";
import { ConnectorScheduler } from "./scheduler";
import { PostgresSchemaAdapter } from "./adapters/postgres-schema";
import { HttpPolicy } from "./adapters/http-policy";
import { OpenApiSourceAdapter } from "./adapters/openapi";
import { DeclarativeCatalogAdapter } from "./adapters/declarative-catalog";
import { prisma } from "@specforge/mcp-server/persistence";
import { CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION } from "@specforge/core";

const applicationServiceId = process.env.SPECFORGE_CONNECTOR_WORKER_APPLICATION_SERVICE_ID ?? "com.huawei.celon.desiner";
const scopePath = process.env.SPECFORGE_CONNECTOR_WORKER_SCOPE_PATH ?? "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner";
const intervalMs = Number(process.env.SPECFORGE_CONNECTOR_WORKER_INTERVAL_MS ?? "5000");
const owner = process.env.SPECFORGE_CONNECTOR_WORKER_OWNER ?? `connector-worker-${process.pid}`;

function createRegistry() {
  const registry = new ConnectorAdapterRegistry();
  registry.register({ kind: "postgres-schema", contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION, mappingVersions: ["postgres-schema-v1"], factory: ({ configuration }) => new PostgresSchemaAdapter({ client: { query: async (sql, parameters) => ({ rows: await prisma.$queryRawUnsafe(sql, ...parameters) }) }, schemas: strings(configuration.schemas), excludedSchemas: strings(configuration.excludedSchemas), maxRowsPerPage: number(configuration.maxRowsPerPage, 250) }) });
  registry.register({ kind: "openapi", contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION, mappingVersions: ["openapi-v1"], factory: ({ configuration }) => new OpenApiSourceAdapter({ document: record(configuration.document), localFile: stringOrUndefined(configuration.localFile), allowedLocalRoots: strings(configuration.allowedLocalRoots), httpPolicy: httpPolicy(configuration) }) });
  for (const kind of ["cmdb-catalog", "runtime-service-catalog"] as const) registry.register({ kind, contractVersion: CONTINUOUS_OBSERVATION_V2_CONTRACT_VERSION, mappingVersions: ["catalog-v1"], factory: ({ configuration }) => new DeclarativeCatalogAdapter({ profile: record(configuration.profile) as never, httpPolicy: httpPolicy(configuration) }) });
  return registry;
}

async function main() {
  if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 60_000) throw new Error("CONNECTOR_WORKER_INTERVAL_INVALID");
  await prisma.$connect();
  const gateway = new PrismaConnectorWorkerGateway({ architectureScope: { applicationServiceId, scopePath } });
  const scheduler = new ConnectorScheduler({ gateway, registry: createRegistry(), owner, batchLimit: number(process.env.SPECFORGE_CONNECTOR_WORKER_BATCH_LIMIT, 10) });
  let lastTick: { at: string; result: unknown } | null = null;
  let active: Promise<void> | undefined;
  const tick = () => { if (active) return active; active = scheduler.runOnce().then((result) => { lastTick = { at: new Date().toISOString(), result }; }).catch((error) => { lastTick = { at: new Date().toISOString(), result: { failed: true, code: error instanceof Error ? error.message : "CONNECTOR_WORKER_TICK_FAILED" } }; }).finally(() => { active = undefined; }); return active; };
  const timer = setInterval(() => void tick(), intervalMs); timer.unref(); void tick();
  const server = createServer((request, response) => { if (request.method !== "GET" || new URL(request.url ?? "/", "http://localhost").pathname !== "/healthz") { response.writeHead(404).end(); return; } response.writeHead(lastTick?.result && typeof lastTick.result === "object" && "failed" in lastTick.result && lastTick.result.failed ? 503 : 200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: lastTick ? "ok" : "starting", lastTick })); });
  server.listen(Number(process.env.SPECFORGE_CONNECTOR_WORKER_PORT ?? "8092"), process.env.SPECFORGE_CONNECTOR_WORKER_HOST ?? "0.0.0.0");
  const shutdown = async () => { clearInterval(timer); await active; await new Promise<void>((resolve) => server.close(() => resolve())); await prisma.$disconnect(); };
  process.once("SIGINT", () => void shutdown()); process.once("SIGTERM", () => void shutdown());
}

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : []; }
function stringOrUndefined(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value : undefined; }
function number(value: unknown, fallback: number): number { const parsed = typeof value === "number" ? value : Number(value); return Number.isInteger(parsed) ? parsed : fallback; }
function httpPolicy(configuration: Record<string, unknown>) { return new HttpPolicy({ allowedHosts: strings(configuration.allowedHosts), allowHttpLocalhost: configuration.allowHttpLocalhost === true, maxBytes: number(configuration.maxBytes, 2_000_000), maxRedirects: number(configuration.maxRedirects, 3), timeoutMs: number(configuration.timeoutMs, 10_000) }); }

void main().catch((error) => { process.stderr.write(`CONNECTOR_WORKER_STARTUP_FAILED:${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
