import { cookies } from "next/headers";
import { digestSecret, hashPassword, verifyPassword, IdentityService } from "@specforge/identity";
import { prisma } from "../db";

const cookieName = "__Host-specforge_session";
function identity() { return new IdentityService(prisma, { pepper: process.env.SPECFORGE_IDENTITY_SECRET_PEPPER ?? "" }); }

export async function loginUser(login: string, password: string) {
  const user = await prisma.userAccount.findUnique({ where: { login } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordDigest))) throw new Error("AUTHENTICATION_REQUIRED");
  const secret = (await import("@specforge/identity")).createSessionSecret();
  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.webSession.create({ data: { userId: user.id, secretDigest: digestSecret(secret, process.env.SPECFORGE_IDENTITY_SECRET_PEPPER ?? ""), idleExpiresAt: new Date(now.getTime() + 30 * 60_000), expiresAt: new Date(now.getTime() + 8 * 60 * 60_000) } });
    await tx.securityAudit.create({ data: { actorType: "user", actorId: user.id, action: "LOGIN", targetType: "user", targetId: user.id, outcome: "ALLOW", metadata: {} } });
    return created;
  });
  return { userId: user.id, sessionId: session.id, secret };
}

export async function currentWebUser() {
  const secret = (await cookies()).get(cookieName)?.value;
  const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER;
  if (!secret || !pepper) return undefined;
  const session = await prisma.webSession.findUnique({ where: { secretDigest: digestSecret(secret, pepper) }, include: { user: true } });
  if (!session || session.status !== "ACTIVE" || session.user.status !== "ACTIVE" || session.idleExpiresAt <= new Date() || session.expiresAt <= new Date()) return undefined;
  return { ...session.user, sessionId: session.id };
}

export async function requireWebUser() {
  const user = await currentWebUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  return user;
}

export async function logoutUser() {
  const user = await currentWebUser();
  if (user) await prisma.webSession.update({ where: { id: user.sessionId }, data: { status: "REVOKED", revokedAt: new Date() } });
  return cookieName;
}

export function sessionCookie(secret: string) {
  return { name: cookieName, value: secret, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: 8 * 60 * 60 };
}

export { identity };
