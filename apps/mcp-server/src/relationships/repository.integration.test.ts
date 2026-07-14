import { PrismaClient } from "@prisma/client";
import { defaultHuaweiActor, scopeById } from "@specforge/core";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTrustedRelationshipExecutionContext, RelationshipCommandService, type RelationshipCommandRepository } from "./command-service";
import { PrismaRelationshipRepository } from "./repository";

const testSchemaPrefix = "specforge_relationship_ledger_test_";
const testSchema = `${testSchemaPrefix}${randomUUID().replaceAll("-", "")}`;
const migrationPath = resolve(process.cwd(), "prisma/migrations/20260714_enterprise_relationship_graph/migration.sql");
const nodeSubjectMigrationPath = resolve(process.cwd(), "prisma/migrations/20260715_relationship_event_node_subject/migration.sql");
const receiptMigrationPath = resolve(process.cwd(), "prisma/migrations/20260716_relationship_command_receipts/migration.sql");
const schemaPath = resolve(process.cwd(), "prisma/schema.prisma");
const migrationSql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const nodeSubjectMigrationSql = existsSync(nodeSubjectMigrationPath) ? readFileSync(nodeSubjectMigrationPath, "utf8") : "";
const receiptMigrationSql = existsSync(receiptMigrationPath) ? readFileSync(receiptMigrationPath, "utf8") : "";
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
const writableApplicationService = scopeById("com.huawei.celon.desiner")!;
const commandScope = {
  enterpriseId: "enterprise-command-test",
  applicationServiceId: writableApplicationService.id,
  scopePath: writableApplicationService.scopePath
} as const;

describe("enterprise relationship ledger schema and migration", () => {
  it("defines the scoped ledger models and an additive idempotent AssetLink backfill", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(existsSync(nodeSubjectMigrationPath)).toBe(true);
    expect(existsSync(receiptMigrationPath)).toBe(true);

    for (const model of [
      "AssetNode",
      "RelationshipCurrent",
      "RelationshipEvent",
      "RelationshipCommandReceipt",
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

    expect(schema).toContain('@@unique([enterpriseId, applicationServiceId, scopePath, sourceNodeId, targetNodeId, relationType, source, sourceReference], map: "RelationshipCurrent_enterprise_scope_identity_key")');
    expect(schema).toContain('@@unique([enterpriseId, applicationServiceId, scopePath, idempotencyKey], map: "RelationshipEvent_enterprise_scope_idempotency_key")');
    expect(schema).toContain('@@unique([enterpriseId, applicationServiceId, scopePath, dbId], map: "AssetNode_enterprise_scope_dbId_key")');
    expect(schema).toContain('fields: [enterpriseId, applicationServiceId, scopePath, sourceNodeId]');
    expect(schema).toMatch(/assetNodeId\s+String\?\s+@db\.Uuid/u);
    expect(schema).toMatch(/relationshipId\s+String\?\s+@db\.Uuid/u);
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS "AssetNode"');
    expect(migrationSql).toContain('CREATE TABLE IF NOT EXISTS "RelationshipCurrent"');
    expect(migrationSql).toContain('INSERT INTO "AssetNode"');
    expect(migrationSql).toContain('INSERT INTO "RelationshipCurrent"');
    expect(migrationSql).toContain('FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId")');
    expect(migrationSql).toContain("legacy_backfill_batch_size CONSTANT INTEGER := 500");
    expect(migrationSql).toContain("LIMIT legacy_backfill_batch_size");
    expect(migrationSql).toContain("LOOP");
    expect(migrationSql).toContain("legacy-asset-link");
    expect(migrationSql).not.toContain("md5(");
    expect(migrationSql).toContain("ON CONFLICT");
    expect(migrationSql).not.toContain('DROP TABLE "AssetLink"');
    expect(migrationSql).not.toContain("PARTITION BY");
    expect(nodeSubjectMigrationSql).toContain('ALTER COLUMN "relationshipId" DROP NOT NULL');
    expect(nodeSubjectMigrationSql).toContain('RelationshipEvent_exactly_one_subject_check');
    expect(nodeSubjectMigrationSql.trim()).toMatch(/^DO \$\$[\s\S]*END \$\$;$/u);
    expect(schema).toContain('@@unique([enterpriseId, applicationServiceId, scopePath, idempotencyKey], map: "RelationshipCommandReceipt_scope_idempotency_key")');
    expect(receiptMigrationSql).toContain('CREATE TABLE IF NOT EXISTS "RelationshipCommandReceipt"');
    expect(receiptMigrationSql.trim()).toMatch(/^DO \$\$[\s\S]*END \$\$;$/u);
    expect(testSchema).toMatch(/^specforge_relationship_ledger_test_[0-9a-f]{32}$/u);
  });
});

describe.runIf(integrationEnabled)("enterprise relationship ledger migration", () => {
  beforeAll(async () => {
    await resetDisposableSchema();
    await installLegacyAssetLinkSchema();
  });

  afterAll(async () => {
    await prisma!.$disconnect();
    assertDisposableSchema();
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

  it("rejects a relationship endpoint from a sibling scope", async () => {
    const siblingScope = {
      enterpriseId: scope.enterpriseId,
      applicationServiceId: "com.specforge.relationships.sibling",
      scopePath: "test/relationships/com.specforge.relationships.sibling"
    };
    const foreignNode = await prisma!.assetNode.create({
      data: {
        ...siblingScope,
        nodeType: "api",
        logicalId: "sibling-source",
        rootAssetType: "api",
        rootAssetId: "sibling-source",
        nodePath: "api/sibling-source",
        displayName: "Sibling source",
        metadata: {},
        version: 1n,
        lifecycleStatus: "ACTIVE"
      }
    });
    const localNode = await prisma!.assetNode.create({
      data: {
        ...scope,
        nodeType: "event",
        logicalId: "local-target",
        rootAssetType: "event",
        rootAssetId: "local-target",
        nodePath: "event/local-target",
        displayName: "Local target",
        metadata: {},
        version: 1n,
        lifecycleStatus: "ACTIVE"
      }
    });

    await expect(
      prisma!.relationshipCurrent.create({
        data: {
          ...scope,
          sourceNodeId: foreignNode.dbId,
          targetNodeId: localNode.dbId,
          relationType: "PUBLISHES",
          strength: "strong",
          confidence: 1,
          source: "test-local",
          sourceReference: "test-local:cross-scope",
          version: 1n,
          metadata: {}
        }
      })
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("replays a unique command idempotency receipt without duplicate event or outbox rows", async () => {
    await createCommandEndpoints("idempotent");
    const service = commandService(new PrismaRelationshipRepository(prisma!));
    const command = commandInput("idempotent", "command-idempotency");

    const first = await service.upsertRelationship(command);
    const replay = await service.upsertRelationship(command);

    expect(replay).toMatchObject({ relationshipId: first.relationshipId, eventId: first.eventId, graphVersion: first.graphVersion, replayed: true });
    expect(await prisma!.relationshipCommandReceipt.count({ where: { ...commandScope, idempotencyKey: "command-idempotency", status: "COMPLETED" } })).toBe(1);
    expect(await prisma!.relationshipEvent.count({ where: { ...commandScope, idempotencyKey: { startsWith: "relationship-command:" } } })).toBe(1);
    expect(await prisma!.relationshipOutbox.count({ where: { ...commandScope, idempotencyKey: { startsWith: "relationship-command:" } } })).toBe(1);
  });

  it("rolls back the current relationship when an event write fails after the current mutation", async () => {
    await createCommandEndpoints("rollback");
    const repository = new PrismaRelationshipRepository(prisma!);
    const failingRepository = eventFailingRepository(repository);
    const service = commandService(failingRepository);

    await expect(service.upsertRelationship(commandInput("rollback", "command-rollback"))).rejects.toThrow("FORCED_EVENT_FAILURE");

    expect(await prisma!.relationshipCurrent.count({ where: { ...commandScope, source: "mcp", sourceReference: "mcp:command-rollback" } })).toBe(0);
    expect(await prisma!.relationshipCommandReceipt.count({ where: { ...commandScope, idempotencyKey: "command-rollback" } })).toBe(0);
    expect(await prisma!.relationshipEvent.count({ where: { ...commandScope, idempotencyKey: { startsWith: "relationship-command:" } } })).toBe(0);
    expect(await prisma!.relationshipOutbox.count({ where: { ...commandScope, idempotencyKey: { startsWith: "relationship-command:" } } })).toBe(0);
  });
});

function assertDisposableSchema() {
  if (!new RegExp(`^${testSchemaPrefix}[0-9a-f]{32}$`, "u").test(testSchema)) {
    throw new Error(`Refusing to drop non-disposable schema: ${testSchema}`);
  }
}

async function resetDisposableSchema() {
  assertDisposableSchema();
  await admin!.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${testSchema}" CASCADE`);
  await admin!.$executeRawUnsafe(`CREATE SCHEMA "${testSchema}"`);
}

async function executeMigrationSql() {
  await prisma!.$executeRawUnsafe(migrationSql);
  await prisma!.$executeRawUnsafe(nodeSubjectMigrationSql);
  await prisma!.$executeRawUnsafe(receiptMigrationSql);
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

async function createCommandEndpoints(suffix: string) {
  await prisma!.assetNode.createMany({
    data: [
      {
        ...commandScope,
        nodeType: "api",
        logicalId: `command-source-${suffix}`,
        rootAssetType: "api",
        rootAssetId: `command-source-${suffix}`,
        nodePath: `api/command-source-${suffix}`,
        displayName: "Command source",
        metadata: {},
        version: 1n,
        lifecycleStatus: "ACTIVE"
      },
      {
        ...commandScope,
        nodeType: "event",
        logicalId: `command-target-${suffix}`,
        rootAssetType: "event",
        rootAssetId: `command-target-${suffix}`,
        nodePath: `event/command-target-${suffix}`,
        displayName: "Command target",
        metadata: {},
        version: 1n,
        lifecycleStatus: "ACTIVE"
      }
    ]
  });
}

function commandInput(suffix: string, idempotencyKey: string) {
  return {
    channel: "mcp",
    correlationId: idempotencyKey,
    idempotencyKey,
    source: {
      identity: {
        applicationServiceId: commandScope.applicationServiceId,
        scopePath: commandScope.scopePath,
        nodeType: "api" as const,
        logicalId: `command-source-${suffix}`,
        rootAssetType: "api" as const,
        rootAssetId: `command-source-${suffix}`
      },
      expectedVersion: 1n
    },
    target: {
      identity: {
        applicationServiceId: commandScope.applicationServiceId,
        scopePath: commandScope.scopePath,
        nodeType: "event" as const,
        logicalId: `command-target-${suffix}`,
        rootAssetType: "event" as const,
        rootAssetId: `command-target-${suffix}`
      },
      expectedVersion: 1n
    },
    relationType: "EMITS" as const,
    sourceReference: `mcp:${idempotencyKey}`
  };
}

function commandService(repository: RelationshipCommandRepository) {
  return new RelationshipCommandService(repository, createTrustedRelationshipExecutionContext({
    enterpriseId: commandScope.enterpriseId,
    scope: { applicationServiceId: commandScope.applicationServiceId, scopePath: commandScope.scopePath },
    actor: defaultHuaweiActor
  }));
}

function eventFailingRepository(repository: PrismaRelationshipRepository): RelationshipCommandRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === "transaction") {
        return async (operation: (transaction: RelationshipCommandRepository) => Promise<unknown>) => target.transaction(async (transaction) => {
          const failingTransaction = new Proxy(transaction, {
            get(transactionTarget, transactionProperty, transactionReceiver) {
              if (transactionProperty === "appendEvent") return async () => { throw new Error("FORCED_EVENT_FAILURE"); };
              return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
            }
          }) as RelationshipCommandRepository;
          return operation(failingTransaction);
        });
      }
      return Reflect.get(target, property, receiver);
    }
  }) as RelationshipCommandRepository;
}
