import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@specforge/identity";

type Input = { login: string; displayName: string; password: string };
const prisma = new PrismaClient();

async function main() {
  const input = JSON.parse(await readStdin()) as Input;
  if (!input.login || !input.displayName || !input.password) throw new Error("BOOTSTRAP_INPUT_REQUIRED");
  const passwordDigest = await hashPassword(input.password);
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.deploymentBootstrap.findUnique({ where: { bootstrapKey: "identity-v1" } });
    if (existing?.status === "COMPLETED") throw new Error("IDENTITY_BOOTSTRAP_ALREADY_COMPLETED");
    if (existing) await tx.deploymentBootstrap.update({ where: { bootstrapKey: "identity-v1" }, data: { status: "CLAIMED", attemptCount: { increment: 1 }, startedAt: new Date(), errorMessage: null } });
    else await tx.deploymentBootstrap.create({ data: { bootstrapKey: "identity-v1", status: "CLAIMED", version: "1", attemptCount: 1, startedAt: new Date() } });
    const user = await tx.userAccount.create({ data: { login: input.login, displayName: input.displayName, passwordDigest, isAdministrator: true } });
    await tx.securityAudit.create({ data: { actorType: "system", actorId: "identity-bootstrap", action: "BOOTSTRAP_ADMIN", targetType: "user", targetId: user.id, outcome: "ALLOW", metadata: {} } });
    await tx.deploymentBootstrap.update({ where: { bootstrapKey: "identity-v1" }, data: { status: "COMPLETED", completedAt: new Date(), counts: JSON.stringify({ administrators: 1, grants: 0 }) } });
    return user;
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ status: "COMPLETED", userId: result.id, login: result.login, grants: 0 }, null, 2));
}

async function readStdin() { const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8"); }
main().catch((error) => { console.error(error instanceof Error ? error.message : "IDENTITY_BOOTSTRAP_FAILED"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
