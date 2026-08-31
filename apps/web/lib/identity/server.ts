import { cookies } from "next/headers";
import { createSessionSecret, digestSecret, hashPassword, verifyPassword, IdentityService } from "@specforge/identity";
import { prisma } from "../db";

const cookieName = "__Host-specforge_session";
const csrfCookieName = "specforge_csrf";
function identity() { return new IdentityService(prisma, { pepper: process.env.SPECFORGE_IDENTITY_SECRET_PEPPER ?? "" }); }

export async function loginUser(login: string, password: string) {
  const user = await prisma.userAccount.findUnique({ where: { login } });
  if (!user || user.status !== "ACTIVE" || !(await verifyPassword(password, user.passwordDigest))) throw new Error("AUTHENTICATION_REQUIRED");
  const secret = createSessionSecret();
  const csrf = createSessionSecret();
  const now = new Date();
  const session = await prisma.$transaction(async (tx) => {
    const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER ?? "";
    const created = await tx.webSession.create({ data: { userId: user.id, secretDigest: digestSecret(secret, pepper), csrfDigest: digestSecret(csrf, pepper), idleExpiresAt: new Date(now.getTime() + 30 * 60_000), expiresAt: new Date(now.getTime() + 8 * 60 * 60_000) } });
    await tx.securityAudit.create({ data: { actorType: "user", actorId: user.id, action: "LOGIN", targetType: "user", targetId: user.id, outcome: "ALLOW", metadata: {} } });
    return created;
  });
  return { userId: user.id, sessionId: session.id, secret, csrf };
}

export async function currentWebUser() {
  const secret = (await cookies()).get(cookieName)?.value;
  const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER;
  if (!secret || !pepper) return undefined;
  const session = await prisma.webSession.findUnique({ where: { secretDigest: digestSecret(secret, pepper) }, include: { user: true } });
  if (!session || session.status !== "ACTIVE" || session.user.status !== "ACTIVE" || session.idleExpiresAt <= new Date() || session.expiresAt <= new Date()) return undefined;
  return { ...session.user, sessionId: session.id, csrfDigest: session.csrfDigest };
}

export async function requireWebUser() {
  const user = await currentWebUser();
  if (!user) throw new Error("AUTHENTICATION_REQUIRED");
  return user;
}

export async function requireMutationUser(request: Request) {
  const user = await requireWebUser();
  const origin = request.headers.get("origin");
  const expectedOrigin = process.env.SPECFORGE_WEB_ORIGIN;
  if (!origin || (expectedOrigin && origin !== expectedOrigin)) throw new Error("CSRF_ORIGIN_REJECTED");
  const header = request.headers.get("x-csrf-token");
  const supplied = (await cookies()).get(csrfCookieName)?.value;
  const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER;
  if (!pepper || !header || !supplied || header !== supplied || digestSecret(header, pepper) !== user.csrfDigest) throw new Error("CSRF_TOKEN_REJECTED");
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

export function csrfCookie(csrf: string) {
  return { name: csrfCookieName, value: csrf, httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 8 * 60 * 60 };
}

export { identity };
