import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@specforge/identity";

type Input = { login: string; password: string };
const prisma = new PrismaClient();

async function main() {
  const input = JSON.parse(await readStdin()) as Input;
  if (!input.login || !input.password) throw new Error("RECOVERY_INPUT_REQUIRED");
  const passwordDigest = await hashPassword(input.password);
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.userAccount.findUnique({ where: { login: input.login } });
    if (!user || !user.isAdministrator) throw new Error("ADMINISTRATOR_NOT_FOUND");
    await tx.userAccount.update({ where: { id: user.id }, data: { passwordDigest, status: "ACTIVE", disabledAt: null, credentialVersion: { increment: 1 }, authorizationVersion: { increment: 1 } } });
    const sessions = await tx.webSession.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
    const credentials = await tx.agentCredential.updateMany({ where: { agent: { ownerUserId: user.id }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date(), version: { increment: 1 } } });
    await tx.securityAudit.create({ data: { actorType: "system", actorId: "identity-recovery", action: "RECOVER_ADMIN", targetType: "user", targetId: user.id, outcome: "ALLOW", metadata: { sessionsRevoked: sessions.count, credentialsRevoked: credentials.count } } });
    return { id: user.id, sessions: sessions.count, credentials: credentials.count };
  }, { isolationLevel: "Serializable" });
  console.log(JSON.stringify({ status: "RECOVERED", ...result }, null, 2));
}

async function readStdin() { const chunks: Buffer[] = []; for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks).toString("utf8"); }
main().catch((error) => { console.error(error instanceof Error ? error.message : "IDENTITY_RECOVERY_FAILED"); process.exitCode = 1; }).finally(() => prisma.$disconnect());
