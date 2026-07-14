import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe } from "vitest";
import { PostgresGraphStore } from "./postgres";
import { graphStoreContractSuite, graph, scope } from "./graph-store.contract.test";

const schemaPrefix = "specforge_graph_store_test_";
const schema = `${schemaPrefix}${randomUUID().replaceAll("-", "")}`;
const databaseUrl = process.env.DATABASE_URL ?? "";
const enabled = process.env.SPECFORGE_PG_INTEGRATION === "1" && databaseUrl.length > 0;
const testUrl = databaseUrl ? new URL(databaseUrl) : null;
const adminUrl = databaseUrl ? new URL(databaseUrl) : null;
if (testUrl) testUrl.searchParams.set("schema", schema);
if (adminUrl) adminUrl.searchParams.set("schema", "public");
const prisma = enabled ? new PrismaClient({ datasourceUrl: testUrl!.toString() }) : null;
const admin = enabled ? new PrismaClient({ datasourceUrl: adminUrl!.toString() }) : null;
const enterpriseId = "enterprise-graph-store-test";

describe.runIf(enabled)("PostgresGraphStore disposable integration", () => {
  beforeAll(async () => {
    await resetSchema();
    await createLedgerTables();
    await seedGraph();
  });

  afterAll(async () => {
    await prisma!.$disconnect();
    assertDisposableSchema();
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin!.$disconnect();
  });

  graphStoreContractSuite("PostgresGraphStore", async (options) => new PostgresGraphStore(prisma!, { enterpriseId, ...options }));
});

function assertDisposableSchema() {
  if (!new RegExp(`^${schemaPrefix}[0-9a-f]{32}$`, "u").test(schema)) throw new Error(`Refusing to drop non-disposable schema: ${schema}`);
}

async function resetSchema() {
  assertDisposableSchema();
  await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin!.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
}

async function createLedgerTables() {
  await prisma!.$executeRawUnsafe(`CREATE TABLE "AssetNode" (
    "dbId" UUID PRIMARY KEY, "enterpriseId" TEXT NOT NULL, "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL, "logicalId" TEXT NOT NULL, "rootAssetType" TEXT NOT NULL, "rootAssetId" TEXT NOT NULL,
    "parentNodeId" UUID, "nodePath" TEXT NOT NULL, "displayName" TEXT NOT NULL, version BIGINT NOT NULL, "lifecycleStatus" TEXT NOT NULL
  )`);
  await prisma!.$executeRawUnsafe(`CREATE TABLE "RelationshipCurrent" (
    "dbId" UUID PRIMARY KEY, "enterpriseId" TEXT NOT NULL, "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
    "sourceNodeId" UUID NOT NULL, "targetNodeId" UUID NOT NULL, "relationType" TEXT NOT NULL, strength TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL, source TEXT NOT NULL, "sourceReference" TEXT NOT NULL, version BIGINT NOT NULL, "lifecycleStatus" TEXT NOT NULL
  )`);
  await prisma!.$executeRawUnsafe(`CREATE TABLE "RelationshipEvent" (
    "graphVersion" BIGINT NOT NULL, "enterpriseId" TEXT NOT NULL, "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL
  )`);
}

async function seedGraph() {
  const ids = new Map(graph.nodes.map((node, index) => [node.logicalId, `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`]));
  for (const node of graph.nodes) {
    await prisma!.$executeRawUnsafe(
      `INSERT INTO "AssetNode" ("dbId", "enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId", "rootAssetType", "rootAssetId", "nodePath", "displayName", version, "lifecycleStatus") VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::bigint, 'ACTIVE')`,
      ids.get(node.logicalId), enterpriseId, node.applicationServiceId, node.scopePath, node.nodeType, node.logicalId, node.rootAssetType, node.rootAssetId, node.logicalId, node.logicalId, 7
    );
  }
  for (const relation of graph.edges) {
    await prisma!.$executeRawUnsafe(
      `INSERT INTO "RelationshipCurrent" ("dbId", "enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", strength, confidence, source, "sourceReference", version, "lifecycleStatus") VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6::uuid, $7, $8, $9, 'test', $10, $11::bigint, 'ACTIVE')`,
      relation.id === "1" ? "10000000-0000-0000-0000-000000000001" : relation.id === "2" ? "10000000-0000-0000-0000-000000000002" : relation.id === "3" ? "10000000-0000-0000-0000-000000000003" : "10000000-0000-0000-0000-000000000004",
      enterpriseId, relation.source.applicationServiceId, relation.source.scopePath, ids.get(relation.source.logicalId), ids.get(relation.target.logicalId), relation.code, relation.strength, relation.confidence, relation.id, relation.version
    );
  }
  await prisma!.$executeRawUnsafe(
    `INSERT INTO "RelationshipEvent" ("graphVersion", "enterpriseId", "applicationServiceId", "scopePath") VALUES ($1::bigint, $2, $3, $4)`,
    7, enterpriseId, scope.applicationServiceId, scope.scopePath
  );
}
