import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

type Report = {
  reportVersion: string; status: "DRAFT"; registryDigest: string; grantDigest: string;
  proposedTuples: Array<{ legacyActorType: string; legacyActorId: string; applicationServiceId: string; operations: string[]; sourceGrantId: string }>;
  approvedByUserId: string; confirm: "APPLY";
};
const prisma = new PrismaClient();

async function main() {
  const report = JSON.parse(await readStdin()) as Report;
  if (report.reportVersion !== "identity-migration/v1" || report.status !== "DRAFT" || report.confirm !== "APPLY" || !report.approvedByUserId) throw new Error("IDENTITY_MIGRATION_APPROVAL_REQUIRED");
  const result = await prisma.$transaction(async (tx) => {
    const approver = await tx.userAccount.findUnique({ where: { id: report.approvedByUserId } });
    if (!approver?.isAdministrator || approver.status !== "ACTIVE") throw new Error("ADMINISTRATOR_APPROVAL_REQUIRED");
    const [scopes, grants] = await Promise.all([
      tx.architectureScope.findMany({ orderBy: { scopePath: "asc" } }),
      tx.actorScopeGrant.findMany({ orderBy: [{ actorType: "asc" }, { actorId: "asc" }, { scopeId: "asc" }, { action: "asc" }] })
    ]);
    if (digest(scopes.map((scope) => [scope.id, scope.scopePath, scope.level, scope.parentId ?? null])) !== report.registryDigest || digest(grants.map((grant) => [grant.id, grant.actorType, grant.actorId, grant.scopeId, grant.action])) !== report.grantDigest) throw new Error("IDENTITY_MIGRATION_REPORT_STALE");
    const legacyIds = new Set(grants.map((grant) => grant.id));
    const existingUsers = new Set((await tx.userAccount.findMany({ select: { id: true } })).map((user) => user.id));
    const tuples = report.proposedTuples.filter((tuple) => tuple.legacyActorType === "user" && existingUsers.has(tuple.legacyActorId) && legacyIds.has(tuple.sourceGrantId));
    const flattened = tuples.flatMap((tuple) => tuple.operations.map((operation) => ({ subjectId: tuple.legacyActorId, applicationServiceId: tuple.applicationServiceId, operation, createdByUserId: approver.id })));
    if (flattened.length) await tx.scopeOperationGrant.createMany({ data: flattened, skipDuplicates: true });
    const saved = await tx.legacyScopeGrantMigrationReport.create({ data: { status: "APPLIED", registryDigest: report.registryDigest, grantDigest: report.grantDigest, proposedTuples: report.proposedTuples, approvedByUserId: approver.id, approvedAt: new Date(), appliedAt: new Date() } });
    await tx.securityAudit.create({ data: { actorType: "user", actorId: approver.id, action: "APPLY_IDENTITY_MIGRATION", targetType: "migration-report", targetId: saved.id, outcome: "ALLOW", metadata: { appliedTupleCount: flattened.length, skippedTupleCount: report.proposedTuples.length - tuples.length } } });
    return { reportId: saved.id, appliedTupleCount: flattened.length, skippedTupleCount: report.proposedTuples.length - tuples.length };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ status: "APPLIED", ...result }, null, 2));
}

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
async function readStdin() { const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8"); }
main().catch((error) => { console.error(error instanceof Error ? error.message : "IDENTITY_MIGRATION_FAILED"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
