import { IdentityService } from "@specforge/identity";
import { prisma } from "../persistence";
import { principalFromManagedAgent, type McpAuthInfo } from "../auth";

export async function resolveMcpBearer(authorization: string | undefined): Promise<McpAuthInfo> {
  const secret = authorization?.match(/^Bearer\s+(sfat_[A-Za-z0-9_-]+)$/i)?.[1];
  if (!secret) throw new Error("AUTHENTICATION_REQUIRED");
  const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER;
  if (!pepper) throw new Error("IDENTITY_SECRET_PEPPER_REQUIRED");
  const service = new IdentityService(prisma, { pepper });
  const principal = principalFromManagedAgent(await service.resolveAgentPrincipal(secret));
  return {
    clientId: principal.actorId,
    scopes: principal.permissions,
    tenantId: principal.tenantId,
    authSource: principal.authSource,
    extra: {
      actor: {
        actorType: principal.actorType,
        actorId: principal.actorId,
        subject: principal.subject,
        grants: principal.grants,
        operationGrants: principal.operationGrants,
        decisionRef: principal.decisionRef
      }
    }
  };
}
