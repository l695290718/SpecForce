import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveGraphHealthConfig } from "./live-projection-config";
import { cleanupRunFixtures } from "../../scripts/cleanup-graph-verification-fixtures";

const config = resolveGraphHealthConfig(process.env);
const { applicationServiceId, scopePath, enterpriseId, gatewayUrl, projectorHealthUrl, databaseUrl, liveRunId } = config;
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

type FixtureWatermark = {
  relationships: [FixtureRow, FixtureRow];
  graphVersion: bigint;
  checkpointVersion: bigint;
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
  if (phase !== "prepare" && phase !== "verify" && phase !== "cleanup") throw new Error("GRAPH_LIVE_PHASE_REQUIRED: use --phase prepare, --phase verify, or --phase cleanup");

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let verificationError: unknown;
  try {
    if (phase === "cleanup") {
      const cleanup = await cleanupRunFixturesThroughMcp();
      console.log(JSON.stringify({ phase, architectureScope: { enterpriseId, applicationServiceId, scopePath }, cleanup }, null, 2));
      return;
    }
    await assertGatewayHealth();
    await assertProjectorReachable();
    if (phase === "prepare") await authorFixtureThroughMcp();

    const watermark = await waitForCheckpoint(prisma);
    const traversal = await waitForTraversalConvergence(watermark.graphVersion);
    if (phase === "verify") assertFixtureEdgeIsSingular(traversal);

    const health = await readProjectorHealth();
    if ((health.deadLetterCount ?? 0) > 0) throw new Error("GRAPH_LIVE_DEAD_LETTER: exact Scope has dead-lettered projection work; retry after resolving the Gateway/Projector failure.");
    if (health.lastCheckpoint === null || health.lastCheckpoint === undefined || BigInt(health.lastCheckpoint) < watermark.graphVersion) {
      throw new Error("GRAPH_LIVE_PROJECTOR_CHECKPOINT_STALE: Projector health checkpoint is behind the authoritative graph version; retry after the Projector catches up.");
    }

    console.log(JSON.stringify({
      phase,
      architectureScope: { enterpriseId, applicationServiceId, scopePath },
      relationshipIds: watermark.relationships.map((row) => row.relationship_id),
      eventIds: watermark.relationships.map((row) => row.event_id),
      graphVersion: watermark.graphVersion.toString(),
      checkpoint: watermark.checkpointVersion.toString(),
      outboxStatuses: watermark.relationships.map((row) => row.status),
      eventCounts: watermark.relationships.map((row) => Number(row.event_count)),
      traversalNodes: traversal.nodes?.length ?? 0,
      traversalEdges: traversal.edges?.length ?? 0,
      projectorHealth: health
    }, null, 2));
  } catch (error) {
    verificationError = error;
    throw error;
  } finally {
    if (phase === "verify") {
      try { await cleanupRunFixturesThroughMcp(); }
      catch (cleanupError) { console.error(`GRAPH_LIVE_CLEANUP_FAILED: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}; retry with --phase cleanup for run ${liveRunId}.`); if (!verificationError) throw cleanupError; }
    }
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
    await cleanupRunFixtures(client, config);
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

async function cleanupRunFixturesThroughMcp(): Promise<unknown> {
  const clientModule = createRequire(resolve(process.cwd(), "apps/mcp-server/package.json"));
  const { Client } = clientModule("@modelcontextprotocol/sdk/client/index.js") as typeof import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = clientModule("@modelcontextprotocol/sdk/client/stdio.js") as typeof import("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({ command: process.platform === "win32" ? "pnpm.cmd" : "pnpm", args: ["--filter", "@specforge/mcp-server", "dev"], cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl, SPECFORGE_ENTERPRISE_ID: enterpriseId, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: applicationServiceId } });
  const client = new Client({ name: "specforge-nebula-live-cleanup", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try { return await cleanupRunFixtures(client, config); } finally { await client.close(); await transport.close(); }
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

async function waitForCheckpoint(prisma: PrismaClient): Promise<FixtureWatermark> {
  let lastReason = "no authoritative fixture RelationshipOutbox rows found";
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const rows = await Promise.all([
      readFixtureStateWithClient(prisma, fixtureLinkId(fixture.firstApiId, fixture.secondApiId)),
      readFixtureStateWithClient(prisma, fixtureLinkId(fixture.secondApiId, fixture.thirdApiId))
    ]) as [FixtureRow, FixtureRow];
    if (rows.some((row) => row.status === "DEAD_LETTER")) throw new Error("GRAPH_LIVE_DEAD_LETTER: exact-Scope fixture reached DEAD_LETTER; retry after resolving Gateway delivery diagnostics.");
    const graphVersions = rows.map((row) => row.graph_version);
    const checkpointVersions = rows.map((row) => row.checkpoint_version);
    if (rows.every((row) => row.status === "COMPLETED") && graphVersions.every((version): version is bigint => version !== null) && checkpointVersions.every((version): version is bigint => version !== null)) {
      const graphVersion = graphVersions.reduce((latest, version) => version > latest ? version : latest, 0n);
      const checkpointVersion = checkpointVersions.reduce((latest, version) => version < latest ? version : latest);
      if (checkpointVersion >= graphVersion) return { relationships: rows, graphVersion, checkpointVersion };
    }
    lastReason = rows.map((row) => `status=${row.status ?? "missing"}, graphVersion=${row.graph_version?.toString() ?? "missing"}, checkpoint=${row.checkpoint_version?.toString() ?? "missing"}`).join("; ");
    await delay(1_000);
  }
  throw new Error(`GRAPH_LIVE_CHECKPOINT_TIMEOUT: ${lastReason}; retry after the exact-Scope Projector drains the canonical RelationshipOutbox.`);
}

async function readFixtureState(linkId: string): Promise<FixtureRow> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  try {
    return await readFixtureStateWithClient(prisma, linkId);
  } finally {
    await prisma.$disconnect();
  }
}

async function readFixtureStateWithClient(prisma: PrismaClient, linkId: string): Promise<FixtureRow> {
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
}

function fixtureLinkId(sourceId: string, targetId: string): string {
  return `api:${sourceId}:calls:api:${targetId}`;
}

async function assertGatewayHealth(): Promise<void> {
  const response = await fetch(`${gatewayUrl}/health`).catch(() => undefined);
  if (!response) throw new Error(`NEBULA_LIVE_GATEWAY_UNAVAILABLE: cannot reach ${gatewayUrl}/health; retry after the local Gateway/Nebula profile is running.`);
  if (!response.ok) throw new Error(`NEBULA_LIVE_GATEWAY_UNAVAILABLE: ${gatewayUrl}/health returned HTTP ${response.status}; retry after graphSchemaReady is true.`);
  const body = await response.json() as { graphSchemaReady?: boolean };
  if (body.graphSchemaReady !== true) throw new Error("NEBULA_LIVE_SCHEMA_NOT_READY: Gateway health is reachable but graphSchemaReady is false; retry after Nebula schema bootstrap completes.");
}

async function assertProjectorReachable(): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError = "PROJECTOR_HEALTH_UNAVAILABLE: Projector health endpoint did not become reachable after restart.";
  while (Date.now() < deadline) {
    try {
      const health = await readProjectorHealth();
      if (health.deadLetterCount === undefined) throw new Error("PROJECTOR_HEALTH_CONTRACT_INVALID: health response lacks deadLetterCount; deploy the current Projector image before retrying.");
      return;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("PROJECTOR_HEALTH_UNAVAILABLE:")) throw error;
      lastError = error.message;
      await delay(500);
    }
  }
  throw new Error(`${lastError}; retry after the Projector health endpoint is running.`);
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

async function waitForTraversalConvergence(graphVersion: bigint): Promise<GatewayTraversal> {
  const deadline = Date.now() + 15_000;
  let lastShapeError = "no traversal response";
  while (Date.now() < deadline) {
    try {
      const result = await traverse(graphVersion);
      assertTraversal(result, graphVersion);
      return result;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("NEBULA_LIVE_TRAVERSAL_SHAPE_INVALID:")) throw error;
      lastShapeError = error.message;
      await delay(500);
    }
  }
  throw new Error(`NEBULA_LIVE_TRAVERSAL_CONVERGENCE_TIMEOUT: ${lastShapeError}; retry after the graph projection becomes readable at checkpoint ${graphVersion}.`);
}

function assertTraversal(result: GatewayTraversal, graphVersion: bigint): void {
  if (result.status !== "COMPLETE") throw new Error(`NEBULA_LIVE_TRAVERSAL_INCOMPLETE: status=${result.status ?? "missing"}; retry after graph checkpoint ${graphVersion} is available.`);
  if (result.graphVersion !== graphVersion.toString()) throw new Error("NEBULA_LIVE_TRAVERSAL_VERSION_MISMATCH: Gateway returned a different graph version than the authoritative checkpoint.");
  if ((result.truncationReasons ?? []).length > 0) throw new Error("NEBULA_LIVE_TRAVERSAL_TRUNCATED: exact-Scope verification traversal was truncated.");
  const nodes = result.nodes ?? [];
  const edges = result.edges ?? [];
  const expectedNodes = new Set([fixture.firstApiId, fixture.secondApiId, fixture.thirdApiId]);
  const actualNodes = new Set(nodes.map((node) => node.logicalId));
  const expectedEdges = [
    [fixture.firstApiId, fixture.secondApiId],
    [fixture.secondApiId, fixture.thirdApiId]
  ];
  const hasExpectedEdges = edges.length === expectedEdges.length && expectedEdges.every(([source, target]) => edges.some((edge) => edge.code === "CALLS" && directedEndpointPair(edge, source, target)));
  if (nodes.length !== expectedNodes.size || actualNodes.size !== expectedNodes.size || [...expectedNodes].some((id) => !actualNodes.has(id)) || !hasExpectedEdges) {
    throw new Error(`NEBULA_LIVE_TRAVERSAL_SHAPE_INVALID: expected fixture nodes=${expectedNodes.size}, edges=${expectedEdges.length}, got nodes=${nodes.length}, edges=${edges.length}.`);
  }
  if (nodes.some((node) => node.enterpriseId !== enterpriseId || node.applicationServiceId !== applicationServiceId || node.scopePath !== scopePath)) {
    throw new Error("NEBULA_LIVE_SCOPE_LEAK: traversal returned a node outside the exact Designer Scope.");
  }
}

function assertFixtureEdgeIsSingular(result: GatewayTraversal): void {
  const matching = (result.edges ?? []).filter((edge) => edge.code === "CALLS" && sameEndpointPair(edge, fixture.firstApiId, fixture.secondApiId));
  if (matching.length !== 1) throw new Error(`NEBULA_LIVE_DUPLICATE_EDGE: expected one logical first-hop edge after Projector restart, got ${matching.length}.`);
}

function directedEndpointPair(edge: Record<string, unknown>, sourceId: string, targetId: string): boolean {
  const source = edge.source as Record<string, unknown> | undefined;
  const target = edge.target as Record<string, unknown> | undefined;
  return source?.logicalId === sourceId && target?.logicalId === targetId;
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
