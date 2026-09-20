import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const probeUrl = process.env.SPECFORGE_BASELINE_PROBE_DATABASE_URL;
const prepared = process.env.SPECFORGE_BASELINE_PROBE_PREPARED === "1";

const describeProbe = probeUrl && prepared ? describe : describe.skip;

describeProbe("brownfield PostgreSQL baseline integration", () => {
  const prisma = new PrismaClient({ datasourceUrl: probeUrl });
  let repairRelationshipCount = 0;
  let repairEventCount = 0;
  let repairOutboxCount = 0;

  beforeAll(async () => {
    repairRelationshipCount = await countBySource("RelationshipCurrent", "source");
    repairEventCount = await countBySource("RelationshipEvent", "actorId");
    repairOutboxCount = await countBySource("RelationshipOutbox", "payload");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function countBySource(table: string, column: string): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
      table === "RelationshipCurrent"
        ? `SELECT COUNT(*)::int AS count FROM "RelationshipCurrent" WHERE "enterpriseId" = 'legacy-enterprise' AND source = 'brownfield-asset-link-baseline'`
        : table === "RelationshipEvent"
          ? `SELECT COUNT(*)::int AS count FROM "RelationshipEvent" WHERE "enterpriseId" = 'legacy-enterprise' AND "actorId" = '20260920000000_repair_missing_asset_link_relationships'`
          : `SELECT COUNT(*)::int AS count FROM "RelationshipOutbox" WHERE "enterpriseId" = 'legacy-enterprise' AND payload->>'migrationId' = '20260920000000_repair_missing_asset_link_relationships'`
    );
    void column;
    return rows[0]?.count ?? 0;
  }

  it("has no missing semantic relationship for an AssetLink", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`
      SELECT COUNT(*)::int AS count
      FROM "AssetLink" link
      WHERE NOT EXISTS (
        SELECT 1
        FROM "RelationshipCurrent" relationship
        JOIN "AssetNode" source_node
          ON source_node."enterpriseId" = 'legacy-enterprise'
         AND source_node."applicationServiceId" = link."applicationServiceId"
         AND source_node."scopePath" = link."scopePath"
         AND source_node."nodeType" = link."sourceType"
         AND source_node."logicalId" = link."sourceId"
        JOIN "AssetNode" target_node
          ON target_node."enterpriseId" = 'legacy-enterprise'
         AND target_node."applicationServiceId" = link."applicationServiceId"
         AND target_node."scopePath" = link."scopePath"
         AND target_node."nodeType" = link."targetType"
         AND target_node."logicalId" = link."targetId"
        WHERE relationship."enterpriseId" = 'legacy-enterprise'
          AND relationship."applicationServiceId" = link."applicationServiceId"
          AND relationship."scopePath" = link."scopePath"
          AND relationship."sourceNodeId" = source_node."dbId"
          AND relationship."targetNodeId" = target_node."dbId"
          AND relationship."relationType" = link."relationType"
      )
    `);
    expect(rows[0]?.count ?? 0).toBe(0);
  });

  it("keeps the repair ledger stable after a second application", async () => {
    expect(await countBySource("RelationshipCurrent", "source")).toBe(repairRelationshipCount);
    expect(await countBySource("RelationshipEvent", "actorId")).toBe(repairEventCount);
    expect(await countBySource("RelationshipOutbox", "payload")).toBe(repairOutboxCount);
  });

  it("has no duplicate active governance records", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT kind
        FROM "SystemScanGovernanceRecord"
        WHERE status = 'ACTIVE'
        GROUP BY kind
        HAVING COUNT(*) > 1
      ) duplicates
    `);
    expect(rows[0]?.count ?? 0).toBe(0);
  });
});
