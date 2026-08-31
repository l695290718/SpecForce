import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { Permission } from "@specforge/core";

const prisma = new PrismaClient();
const operationCandidates: Record<"read" | "write", Permission[]> = {
  read: ["asset:read"],
  write: ["asset:write"]
};

async function main() {
  const [scopes, grants] = await Promise.all([
    prisma.architectureScope.findMany({ orderBy: { scopePath: "asc" } }),
    prisma.actorScopeGrant.findMany({ orderBy: [{ actorType: "asc" }, { actorId: "asc" }, { scopeId: "asc" }, { action: "asc" }] })
  ]);
  const applicationServices = scopes.filter((scope) => scope.level === "applicationService");
  const proposedTuples = grants.flatMap((grant) => applicationServices
    .filter((leaf) => leaf.scopePath === scopes.find((scope) => scope.id === grant.scopeId)?.scopePath || leaf.scopePath.startsWith(`${scopes.find((scope) => scope.id === grant.scopeId)?.scopePath ?? "\u0000"}/`))
    .map((leaf) => ({ legacyActorType: grant.actorType, legacyActorId: grant.actorId, applicationServiceId: leaf.id, scopePath: leaf.scopePath, operations: operationCandidates[grant.action as "read" | "write"] ?? [], sourceGrantId: grant.id })));
  const registryDigest = digest(scopes.map((scope) => [scope.id, scope.scopePath, scope.level, scope.parentId ?? null]));
  const grantDigest = digest(grants.map((grant) => [grant.id, grant.actorType, grant.actorId, grant.scopeId, grant.action]));
  console.log(JSON.stringify({ reportVersion: "identity-migration/v1", status: "DRAFT", registryDigest, grantDigest, sourceGrantCount: grants.length, applicationServiceCount: applicationServices.length, proposedTuples }, null, 2));
}

function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
main().catch((error) => { console.error(error instanceof Error ? error.message : "IDENTITY_MIGRATION_REPORT_FAILED"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
