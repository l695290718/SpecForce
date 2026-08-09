import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const applicationServiceId = process.env.SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID?.trim() || "com.huawei.celon.desiner";
const scopePath = process.env.SPECFORGE_GRAPH_HEALTH_SCOPE_PATH?.trim() || "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner";
const enterpriseId = process.env.SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID?.trim() || process.env.SPECFORGE_ENTERPRISE_ID?.trim() || "enterprise-1";
const gatewayUrl = (process.env.SPECFORGE_GRAPH_GATEWAY_URL?.trim() || "http://127.0.0.1:18088").replace(/\/+$/u, "");
const projectorHealthUrl = (process.env.SPECFORGE_PROJECTOR_HEALTH_URL?.trim() || "http://127.0.0.1:18090").replace(/\/+$/u, "");
const databaseUrl = process.env.DATABASE_URL?.trim();
const liveRunId = process.env.SPECFORGE_GRAPH_LIVE_RUN_ID?.trim() || "manual";
const fixture = {
  firstApiId: `specforge-graph-verification-${liveRunId}-a`,
  secondApiId: `specforge-graph-verification-${liveRunId}-b`,
  thirdApiId: `specforge-graph-verification-${liveRunId}-c`
};

type FixtureRow = {
  relationship_id: string;
  event_id: string | null;
  graph_version: bigint | null;
  status: string | null;
  checkpoint_version: bigint | null;
  event_count: bigint | number;
};

type HealthResponse = {
  status?: string;
  code?: string;
  backlog?: number;
  lastCheckpoint?: string | null;
  retryCount?: number;
  deadLetterCount?: number;
};

type GatewayTraversal = {
  status?: string;
  graphVersion?: string;
  nodes?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
  truncationReasons?: string[];
};

async function main(): Promise<void> {
  const phase = argument("phase");
  if (phase !== "prepare" && phase !== "verify") throw new Error("GRAPH_LIVE_PHASE_REQUIRED: use --phase prepare or --phase verify");
  if (!databaseUrl) throw new Error("GRAPH_LIVE_DATABASE_REQUIRED: set DATABASE_URL to the canonical PostgreSQL authority, not a graph verifier database.");

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await assertGatewayHealth();
    await assertProjectorReachable();
    if (phase === "prepare") await authorFixtureThroughMcp();

    const row = await waitForCheckpoint(prisma);
    const traversal = await traverse(row.graph_version!);
    assertTraversal(traversal, row.graph_version!);
    if (phase === "verify") assertFixtureEdgeIsSingular(traversal);

    const health = await readProjectorHealth();
    if ((health.deadLetterCount ?? 0) > 0) throw new Error("GRAPH_LIVE_DEAD_LETTER: exact Scope has dead-lettered projection work; retry after resolving the Gateway/Projector failure.");
    if (health.lastCheckpoint === null || health.lastCheckpoint === undefined || BigInt(health.lastCheckpoint) < row.graph_version!) {
      throw new Error("GRAPH_LIVE_PROJECTOR_CHECKPOINT_STALE: Projector health checkpoint is behind the authoritative graph version; retry after the Projector catches up.");
    }

    console.log(JSON.stringify({
      phase,
      architectureScope: { enterpriseId, applicationServiceId, scopePath },
      relationshipId: row.relationship_id,
      eventId: row.event_id,
      graphVersion: row.graph_version?.toString(),
      checkpoint: row.checkpoint_version?.toString(),
      outboxStatus: row.status,
      eventCount: Number(row.event_count),
      traversalNodes: traversal.nodes?.length ?? 0,
      traversalEdges: traversal.edges?.length ?? 0,
      projectorHealth: health
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

async function authorFixtureThroughMcp(): Promise<void> {
  const clientModule = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = clientModule("@modelcontextprotocol/sdk/client/index.js") as typeof import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = clientModule("@modelcontextprotocol/sdk/client/stdio.js") as typeof import("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    args: ["--filter", "@specforge/mcp-server", "dev"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SPECFORGE_ENTERPRISE_ID: enterpriseId,
      SPECFORGE_MCP_SEED: "1",
      SPECFORGE_MCP_SEED_SCOPE: applicationServiceId
    }
  });
  const client = new Client({ name: "specforge-nebula-live-gate", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    for (const [index, id] of [fixture.firstApiId, fixture.secondApiId, fixture.thirdApiId].entries()) {
      await callMcp(client, "upsert_design_asset", {
        assetType: "api",
        architectureScope: { applicationServiceId, scopePath },
        asset: apiFixture(id, index)
      });
    }

    const firstLink = await callMcp(client, "link_assets", linkFixture(fixture.firstApiId, fixture.secondApiId));
    const firstLinkId = recordString(firstLink, "id");
    const firstState = await readFixtureState(firstLinkId);
    const secondLink = await callMcp(client, "link_assets", linkFixture(fixture.firstApiId, fixture.secondApiId));
    if (recordString(secondLink, "id") !== firstLinkId) throw new Error("GRAPH_LIVE_IDEMPOTENCY_FAILED: MCP replay returned a different relationship id.");
    const secondState = await readFixtureState(firstLinkId);
    if (Number(secondState.event_count) !== Number(firstState.event_count) || secondState.graph_version !== firstState.graph_version) {
      throw new Error("GRAPH_LIVE_IDEMPOTENCY_FAILED: replaying the same MCP relationship command created a second authoritative event.");
    }

    await callMcp(client, "link_assets", linkFixture(fixture.secondApiId, fixture.thirdApiId));
  } finally {
    await client.close();
    await transport.close();
  }
}

function apiFixture(id: string, index: number): Record<string, unknown> {
  const name = `Nebula projection verification API ${index + 1}`;
  const description = "Ephemeral exact-Scope API fixture used by the NebulaGraph projection gate.";
  return {
    id,
    name,
    description,
    method: "GET",
    path: `/internal/specforge-graph-verification/${index + 1}`,
    domainId: "domain-graph-verification",
    providerSystem: "SpecForge verification",
    consumers: [],
    requestSchema: {},
    responseSchema: { status: "ok" },
    errorCodes: [],
    openapiSpec: "openapi: 3.1.0",
    exposure: "internal",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    architectureScope: { applicationServiceId, scopePath },
    localizedContent: { zh: { name: `Nebula 投影验证 API ${index + 1}`, description: "用于 NebulaGraph 投影门禁的精确 Scope 临时 API。" } }
  };
}

function linkFixture(sourceId: string, targetId: string): Record<string, unknown> {
  return {
    sourceType: "api",
    sourceId,
    targetType: "api",
    targetId,
    relationType: "CALLS",
    description: "NebulaGraph exact-Scope projection verification edge.",
    architectureScope: { applicationServiceId, scopePath }
  };
}

async function callMcp(client: { callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<{ isError?: boolean; content?: Array<{ type: string; text?: string }> }> }, name: string, arguments_: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({ name, arguments: arguments_ });
  const message = (result.content ?? []).map((item) => item.text ?? "").join("");
  if (result.isError) throw new Error(`GRAPH_LIVE_MCP_WRITE_FAILED: ${name}; retry after the canonical MCP PostgreSQL path is available.`);
  try {
    return message ? JSON.parse(message) : undefined;
  } catch {
    throw new Error(`GRAPH_LIVE_MCP_RESPONSE_INVALID: ${name}`);
  }
}

async function waitForCheckpoint(prisma: PrismaClient): Promise<FixtureRow> {
  let lastReason = "no authoritative RelationshipOutbox row found";
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const row = await readFixtureState(fixtureLinkId());
    if (row.status === "DEAD_LETTER") throw new Error("GRAPH_LIVE_DEAD_LETTER: exact-Scope fixture reached DEAD_LETTER; retry after resolving Gateway delivery diagnostics.");
    if (row.graph_version !== null && row.status === "COMPLETED" && row.checkpoint_version !== null && row.checkpoint_version >= row.graph_version) return row;
    lastReason = `status=${row.status ?? "missing"}, graphVersion=${row.graph_version?.toString() ?? "missing"}, checkpoint=${row.checkpoint_version?.toString() ?? "missing"}`;
    await delay(1_000);
  }
  throw new Error(`GRAPH_LIVE_CHECKPOINT_TIMEOUT: ${lastReason}; retry after the exact-Scope Projector drains the canonical RelationshipOutbox.`);
}

async function readFixtureState(linkId: string): Promise<FixtureRow> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  try {
    const rows = await prisma.$queryRawUnsafe<FixtureRow[]>(`
      SELECT current."dbId"::text AS relationship_id,
             event."dbId"::text AS event_id,
             event."graphVersion" AS graph_version,
             outbox.status AS status,
             checkpoint."projectionVersion" AS checkpoint_version,
             (SELECT COUNT(*)::bigint FROM "RelationshipEvent" counted
              WHERE counted."enterpriseId" = current."enterpriseId"
                AND counted."applicationServiceId" = current."applicationServiceId"
                AND counted."scopePath" = current."scopePath"
                AND counted."relationshipId" = current."dbId") AS event_count
      FROM "RelationshipCurrent" current
      LEFT JOIN "RelationshipEvent" event
        ON event."enterpriseId" = current."enterpriseId"
       AND event."applicationServiceId" = current."applicationServiceId"
       AND event."scopePath" = current."scopePath"
       AND event."relationshipId" = current."dbId"
      LEFT JOIN "RelationshipOutbox" outbox
        ON outbox."enterpriseId" = event."enterpriseId"
       AND outbox."applicationServiceId" = event."applicationServiceId"
       AND outbox."scopePath" = event."scopePath"
       AND outbox."relationshipEventId" = event."dbId"
      LEFT JOIN "ProjectionCheckpoint" checkpoint
        ON checkpoint."enterpriseId" = current."enterpriseId"
       AND checkpoint."applicationServiceId" = current."applicationServiceId"
       AND checkpoint."scopePath" = current."scopePath"
       AND checkpoint."partitionId" = 'relationship-outbox'
      WHERE current."enterpriseId" = $1
        AND current."applicationServiceId" = $2
        AND current."scopePath" = $3
        AND current.source = 'legacy-asset-link'
        AND current."sourceReference" = $4
      ORDER BY event."graphVersion" DESC NULLS LAST
      LIMIT 1
    `, enterpriseId, applicationServiceId, scopePath, `legacy-asset-link:${linkId}`);
    const row = rows[0];
    if (!row) throw new Error("GRAPH_LIVE_RELATIONSHIP_MISSING: MCP did not produce the exact-Scope RelationshipCurrent row.");
    return row;
  } finally {
    await prisma.$disconnect();
  }
}

function fixtureLinkId(): string {
  return `api:${fixture.firstApiId}:calls:api:${fixture.secondApiId}`;
}

async function assertGatewayHealth(): Promise<void> {
  const response = await fetch(`${gatewayUrl}/health`).catch(() => undefined);
  if (!response) throw new Error(`NEBULA_LIVE_GATEWAY_UNAVAILABLE: cannot reach ${gatewayUrl}/health; retry after the local Gateway/Nebula profile is running.`);
  if (!response.ok) throw new Error(`NEBULA_LIVE_GATEWAY_UNAVAILABLE: ${gatewayUrl}/health returned HTTP ${response.status}; retry after graphSchemaReady is true.`);
  const body = await response.json() as { graphSchemaReady?: boolean };
  if (body.graphSchemaReady !== true) throw new Error("NEBULA_LIVE_SCHEMA_NOT_READY: Gateway health is reachable but graphSchemaReady is false; retry after Nebula schema bootstrap completes.");
}

async function assertProjectorReachable(): Promise<void> {
  const health = await readProjectorHealth();
  if (health.deadLetterCount === undefined) throw new Error("PROJECTOR_HEALTH_CONTRACT_INVALID: health response lacks deadLetterCount; deploy the current Projector image before retrying.");
}

async function readProjectorHealth(): Promise<HealthResponse> {
  const url = new URL("/health", projectorHealthUrl);
  url.searchParams.set("enterpriseId", enterpriseId);
  url.searchParams.set("applicationServiceId", applicationServiceId);
  url.searchParams.set("scopePath", scopePath);
  const response = await fetch(url).catch(() => undefined);
  if (!response) throw new Error(`PROJECTOR_HEALTH_UNAVAILABLE: cannot reach ${url}; retry after the Projector health endpoint is running.`);
  if (!response.ok) throw new Error(`PROJECTOR_HEALTH_UNAVAILABLE: ${url} returned HTTP ${response.status}; retry after canonical PostgreSQL schema and Projector are ready.`);
  return await response.json() as HealthResponse;
}

async function traverse(graphVersion: bigint): Promise<GatewayTraversal> {
  const response = await fetch(`${gatewayUrl}/v1/traversals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope: { enterpriseId, applicationServiceId, scopePath },
      startNodes: [{ enterpriseId, applicationServiceId, scopePath, nodeType: "api", logicalId: fixture.firstApiId, rootAssetType: "api", rootAssetId: fixture.firstApiId }],
      relationCodes: ["CALLS"],
      maxDepth: 2,
      maxNodes: 20,
      maxPaths: 20,
      timeoutMs: 5_000,
      graphVersion: graphVersion.toString()
    })
  }).catch(() => undefined);
  if (!response) throw new Error(`NEBULA_LIVE_TRAVERSAL_UNAVAILABLE: cannot reach ${gatewayUrl}/v1/traversals; retry after Gateway/Nebula is healthy.`);
  if (!response.ok) throw new Error(`NEBULA_LIVE_TRAVERSAL_FAILED: Gateway returned HTTP ${response.status}; retry after the fixture checkpoint is available.`);
  return await response.json() as GatewayTraversal;
}

function assertTraversal(result: GatewayTraversal, graphVersion: bigint): void {
  if (result.status !== "COMPLETE") throw new Error(`NEBULA_LIVE_TRAVERSAL_INCOMPLETE: status=${result.status ?? "missing"}; retry after graph checkpoint ${graphVersion} is available.`);
  if (result.graphVersion !== graphVersion.toString()) throw new Error("NEBULA_LIVE_TRAVERSAL_VERSION_MISMATCH: Gateway returned a different graph version than the authoritative checkpoint.");
  if ((result.truncationReasons ?? []).length > 0) throw new Error("NEBULA_LIVE_TRAVERSAL_TRUNCATED: exact-Scope verification traversal was truncated.");
  const nodes = result.nodes ?? [];
  const edges = result.edges ?? [];
  if (nodes.length < 3 || edges.length < 2) throw new Error(`NEBULA_LIVE_TRAVERSAL_SHAPE_INVALID: expected a two-hop path, got nodes=${nodes.length}, edges=${edges.length}.`);
  if (nodes.some((node) => node.enterpriseId !== enterpriseId || node.applicationServiceId !== applicationServiceId || node.scopePath !== scopePath)) {
    throw new Error("NEBULA_LIVE_SCOPE_LEAK: traversal returned a node outside the exact Designer Scope.");
  }
}

function assertFixtureEdgeIsSingular(result: GatewayTraversal): void {
  const matching = (result.edges ?? []).filter((edge) => edge.code === "CALLS" && sameEndpointPair(edge, fixture.firstApiId, fixture.secondApiId));
  if (matching.length !== 1) throw new Error(`NEBULA_LIVE_DUPLICATE_EDGE: expected one logical first-hop edge after Projector restart, got ${matching.length}.`);
}

function sameEndpointPair(edge: Record<string, unknown>, first: string, second: string): boolean {
  const source = edge.source as Record<string, unknown> | undefined;
  const target = edge.target as Record<string, unknown> | undefined;
  return (source?.logicalId === first && target?.logicalId === second) || (source?.logicalId === second && target?.logicalId === first);
}

function recordString(value: unknown, key: string): string {
  if (!value || typeof value !== "object" || typeof (value as Record<string, unknown>)[key] !== "string") throw new Error(`GRAPH_LIVE_MCP_RESPONSE_INVALID: missing ${key}`);
  return String((value as Record<string, unknown>)[key]);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? undefined : process.argv[index + 1];
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
