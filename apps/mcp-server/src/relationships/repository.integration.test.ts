import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testSchema = "specforge_relationship_ledger_test";
const migrationPath = resolve(process.cwd(), "prisma/migrations/20260714_enterprise_relationship_graph/migration.sql");
const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const schema = readFileSync(schemaPath, "utf8");

const databaseUrl = process.env.DATABASE_URL ?? "";
const integrationEnabled = process.env.SPECFORGE_PG_INTEGRATION === "1" && databaseUrl.length > 0;
const testUrl = databaseUrl ? new URL(databaseUrl) : null;
if (testUrl) testUrl.searchParams.set("schema", testSchema);
const adminUrl = databaseUrl ? new URL(databaseUrl) : null;
if (adminUrl) adminUrl.searchParams.set("schema", "public");
const prisma = integrationEnabled ? new PrismaClient({ datasourceUrl: testUrl!.toString() }) : null;
const admin = integrationEnabled ? new PrismaClient({ datasourceUrl: adminUrl!.toString() }) : null;

const scope = {
  enterpriseId: "enterprise-test",
  applicationServiceId: "com.specforge.relationships",
  scopePath: "test/relationships/com.specforge.relationships"
} as const;

describe("enterprise relationship ledger schema and migration", () => {
  it("defines the scoped ledger models and an additive idempotent AssetLink backfill", () => {
    expect(existsSync(migrationPath)).toBe(true);

    for (const model of [
      "AssetNode",
      "RelationshipCurrent",
      "RelationshipEvent",
      "RelationshipOutbox",
      "ProjectionCheckpoint",
      "ImpactAnalysisRun",
      "ImpactResultNode",
      "ImpactResultPath"
    ]) {
      const modelBlock = schema.match(new RegExp(`model ${model} \\{([\\s\\S]*?)\\n\\}`, "u"))?.[1] ?? "";
      expect(modelBlock).toContain("enterpriseId");
      expect(modelBlock).toContain("applicationServiceId");
      expect(modelBlock).toContain("scopePath");
      expect(modelBlock).toContain("@db.Uuid");
      expect(modelBlock).toContain("@@index([enterpriseId, applicationServiceId, scopePath");
    }

    expect(schema).toContain("@@unique([enterpriseId, applicationServiceId, scopePath, sourceNodeId, targetNodeId, relationType, source, sourceReference])");
    expect(schema).toContain("@@unique([enterpriseId, applicationServiceId, scopePath, idempotencyKey])");
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS "AssetNode"');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS "RelationshipCurrent"');
    expect(migrationSql).toContain('INSERT INTO "AssetNode"');
    expect(migrationSql).toContain('INSERT INTO "RelationshipCurrent"');
    expect(migrationSql).toContain("legacy-asset-link");
    expect(migrationSql).toContain("md5(");
    expect(migrationSql).toContain("ON CONFLICT");
    expect(migrationSql).not.toContain('DROP TABLE "AssetLink"');
    expect(migrationSql).not.toContain("PARTITION BY");
  });
});

describe.runIf(integrationEnabled)("enterprise relationship ledger migration", () => {
  beforeAll(async () => {
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await admin!.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}"`);
    await installLegacyAssetLinkSchema();
  });

  afterAll(async () => {
    await prisma!.$disconnect();
    await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
    await admin!.$disconnect();
  });

  it("backfills AssetLink idempotently while retaining the legacy record", async () => {
    await executeMigrationSql();
    await executeMigrationSql();

    expect(await prisma!.assetLink.count()).toBe(1);
    expect(await prisma!.assetNode.count({ where: { enterpriseId: "legacy-enterprise" } })).toBe(2);
    expect(await prisma!.relationshipCurrent.count({ where: { source: "legacy-asset-link" } })).toBe(1);
    expect(await prisma!.relationshipEvent.count({ where: { source: "legacy-asset-link" } })).toBe(1);
    expect(await prisma!.relationshipOutbox.count({ where: { status: "PENDING", eventType: "RELATIONSHIP_UPSERT" } })).toBe(1);

    const relationship = await prisma!.relationshipCurrent.findFirstOrThrow({
      where: { source: "legacy-asset-link" },
      include: { sourceNode: true, targetNode: true }
    });
    expect(relationship.sourceReference).toBe("legacy-asset-link:legacy-link");
    expect(relationship.sourceNode).toMatchObject({ nodeType: "proposal", logicalId: "legacy-proposal" });
    expect(relationship.targetNode).toMatchObject({ nodeType: "domain", logicalId: "legacy-domain" });
  });

  it("writes one current relationship, event, and pending outbox record in a test-local transaction", async () => {
    const receipt = await writeTestRelationship();

    expect(await prisma!.relationshipCurrent.count({ where: { dbId: receipt.relationshipId } })).toBe(1);
    expect(await prisma!.relationshipEvent.count({ where: { dbId: receipt.eventId, action: "UPSERT" } })).toBe(1);
    expect(await prisma!.relationshipOutbox.count({ where: { relationshipEventId: receipt.eventId, status: "PENDING" } })).toBe(1);
  });
});

async function executeMigrationSql() {
  await prisma!.$executeRawUnsafe(migrationSql);
}

async function installLegacyAssetLinkSchema() {
  await prisma!.$executeRawUnsafe(`CREATE TABLE "AssetLink" (
    "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    id TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    description TEXT,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("applicationServiceId", "scopePath", id)
  )`);
  await prisma!.$executeRawUnsafe(`INSERT INTO "AssetLink" (
    id, "sourceType", "sourceId", "targetType", "targetId", "relationType", description, "applicationServiceId", "scopePath"
  ) VALUES (
    'legacy-link', 'proposal', 'legacy-proposal', 'domain', 'legacy-domain', 'IMPACTS', 'Legacy impact relation.',
    'legacy-service', 'legacy/service'
  )`);
}

async function writeTestRelationship() {
  return prisma!.$transaction(async (tx) => {
    const sourceNode = await tx.assetNode.create({
      data: {
        ...scope,
        nodeType: "api",
        logicalId: "relationship-source",
        rootAssetType: "api",
        rootAssetId: "relationship-source",
        nodePath: "api/relationship-source",
        displayName: "Relationship source",
        metadata: {},
        version: 1n,
        lifecycleStatus: "ACTIVE"
      }
    });
    const targetNode = await tx.assetNode.create({
      data: {
        ...scope,
        nodeType: "event",
        logicalId: "relationship-target",
        rootAssetType: "event",
        rootAssetId: "relationship-target",
        nodePath: "event/relationship-target",
        displayName: "Relationship target",
        metadata: {},
        version: 1n,
        lifecycleStatus: "ACTIVE"
      }
    });
    const relationship = await tx.relationshipCurrent.create({
      data: {
        ...scope,
        sourceNodeId: sourceNode.dbId,
        targetNodeId: targetNode.dbId,
        relationType: "PUBLISHES",
        strength: "strong",
        confidence: 1,
        source: "test-local",
        sourceReference: "test-local:relationship-write",
        version: 1n,
        metadata: {}
      }
    });
    const event = await tx.relationshipEvent.create({
      data: {
        ...scope,
        relationshipId: relationship.dbId,
        action: "UPSERT",
        newVersion: 1n,
        graphVersion: 1n,
        actorType: "test",
        actorId: "relationship-ledger",
        channel: "integration-test",
        correlationId: "relationship-write",
        idempotencyKey: "test-local:relationship-write",
        source: "test-local",
        snapshot: {}
      }
    });
    await tx.relationshipOutbox.create({
      data: {
        ...scope,
        relationshipEventId: event.dbId,
        graphVersion: 1n,
        eventType: "RELATIONSHIP_UPSERT",
        payload: {},
        status: "PENDING",
        idempotencyKey: "test-local:relationship-write"
      }
    });

    return { relationshipId: relationship.dbId, eventId: event.dbId };
  });
}
