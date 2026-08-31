import type { PrismaClient } from "@prisma/client";
import type { ArchitectureScopeRegistry } from "@specforge/core";
import type { ScopedOperationGrant } from "./types";

export interface PersistedAgentCredential {
  id: string;
  agentId: string;
  ownerUserId: string;
  ownerStatus: string;
  agentStatus: string;
  secretDigest: string;
  status: string;
  version: number;
  expiresAt: Date;
  ownerAuthorizationVersion: bigint;
  ownerCredentialVersion: bigint;
  ownerGrants: ScopedOperationGrant[];
  credentialCeiling: ScopedOperationGrant[];
}

export class PrismaIdentityRepository {
  constructor(readonly prisma: PrismaClient) {}

  async resolveRegistry(): Promise<ArchitectureScopeRegistry> {
    const scopes = await this.prisma.architectureScope.findMany({ orderBy: { scopePath: "asc" } });
    return { scopes: scopes.map((scope) => ({ id: scope.id, code: scope.code, name: scope.name, description: scope.description, owner: scope.owner, level: scope.level, parentId: scope.parentId ?? undefined, scopePath: scope.scopePath, purpose: scope.purpose as "product" | "verification" })) };
  }

  async findCredentialByDigest(secretDigest: string): Promise<PersistedAgentCredential | undefined> {
    const credential = await this.prisma.agentCredential.findUnique({
      where: { secretDigest },
      include: {
        agent: { include: { owner: { include: { grants: true } } } },
        grantCeiling: true
      }
    });
    if (!credential) return undefined;
    return {
      id: credential.id,
      agentId: credential.agentId,
      ownerUserId: credential.agent.ownerUserId,
      ownerStatus: credential.agent.owner.status,
      agentStatus: credential.agent.status,
      secretDigest: credential.secretDigest,
      status: credential.status,
      version: credential.version,
      expiresAt: credential.expiresAt,
      ownerAuthorizationVersion: credential.agent.owner.authorizationVersion,
      ownerCredentialVersion: credential.agent.owner.credentialVersion,
      ownerGrants: credential.agent.owner.grants.map(toGrant),
      credentialCeiling: credential.grantCeiling.map(toGrant)
    };
  }
}

function toGrant(grant: { applicationServiceId: string; operation: string }): ScopedOperationGrant {
  return { applicationServiceId: grant.applicationServiceId, operation: grant.operation as ScopedOperationGrant["operation"] };
}
