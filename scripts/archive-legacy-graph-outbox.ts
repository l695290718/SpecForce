import { PrismaClient } from "@prisma/client";

const enterpriseId = "legacy-enterprise";
const archiveableStatuses = ["PENDING", "DELIVERING", "DEAD_LETTER"];
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function main(): Promise<void> {
  const rows = await prisma.relationshipOutbox.groupBy({
    by: ["applicationServiceId", "scopePath", "status"],
    where: { enterpriseId, status: { in: archiveableStatuses } },
    _count: { _all: true }
  });
  const count = rows.reduce((total, row) => total + row._count._all, 0);
  const report = { enterpriseId, archiveableStatuses, count, scopes: rows };

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", ...report }, null, 2));
    return;
  }

  const now = new Date();
  const result = await prisma.$transaction(async (transaction) => {
    const archived = await transaction.relationshipOutbox.updateMany({
      where: { enterpriseId, status: { in: archiveableStatuses } },
      data: { status: "ARCHIVED", terminalAt: now, leaseOwner: null, leaseExpiresAt: null }
    });
    const audit = await transaction.auditLog.create({
      data: {
        actorType: "system",
        actorId: "specforge-graph-runtime",
        channel: "operations",
        action: "archive_legacy_graph_outbox",
        targetType: "RelationshipOutbox",
        targetId: enterpriseId,
        inputSummary: JSON.stringify({ enterpriseId, statuses: archiveableStatuses, dryRunCount: count }),
        outputSummary: JSON.stringify({ archivedCount: archived.count, scopes: rows }),
        status: "COMPLETED"
      }
    });
    return { archivedCount: archived.count, auditId: audit.id };
  });
  console.log(JSON.stringify({ mode: "applied", ...report, ...result }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
