import type { PrismaClient } from "@prisma/client";
import type { Permission } from "@specforge/core";
import { digestSecret, createOpaqueCredential, hashPassword } from "./credentials";
import { PrismaIdentityRepository, type PersistedAgentCredential } from "./repository";
import type { AuthorizationSubject, ScopedOperationGrant } from "./types";

export class IdentityError extends Error {
  constructor(readonly code: "CREDENTIAL_INACTIVE" | "OWNER_ACCESS_DENIED" | "OPERATION_DENIED" | "IDENTITY_NOT_FOUND" | "INVALID_CREDENTIAL_EXPIRY") {
    super(code);
  }
}

export interface IdentityServiceOptions {
  pepper: string;
  now?: () => Date;
}

export interface ResolvedAgentPrincipal extends AuthorizationSubject {
  actorType: "agent";
  actorId: string;
  credentialId: string;
  ownerGrants: ScopedOperationGrant[];
  credentialCeiling: ScopedOperationGrant[];
}

export class IdentityService {
  readonly repository: PrismaIdentityRepository;
  private readonly now: () => Date;

  constructor(private readonly prisma: PrismaClient, private readonly options: IdentityServiceOptions) {
    if (!options.pepper) throw new Error("IDENTITY_SECRET_PEPPER_REQUIRED");
    this.repository = new PrismaIdentityRepository(prisma);
    this.now = options.now ?? (() => new Date());
  }

  async bootstrapFirstAdministrator(input: { login: string; displayName: string; password: string }): Promise<{ userId: string }> {
    const passwordDigest = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.deploymentBootstrap.findUnique({ where: { bootstrapKey: "identity-v1" } });
      if (existing?.status === "COMPLETED" || await tx.userAccount.count() > 0) throw new Error("IDENTITY_BOOTSTRAP_ALREADY_COMPLETED");
      if (existing) await tx.deploymentBootstrap.update({ where: { bootstrapKey: "identity-v1" }, data: { status: "CLAIMED", attemptCount: { increment: 1 }, startedAt: this.now(), errorMessage: null } });
      else await tx.deploymentBootstrap.create({ data: { bootstrapKey: "identity-v1", status: "CLAIMED", version: "1", attemptCount: 1, startedAt: this.now() } });
      const created = await tx.userAccount.create({ data: { login: input.login, displayName: input.displayName, passwordDigest, isAdministrator: true } });
      await tx.securityAudit.create({ data: { actorType: "system", actorId: "identity-bootstrap", action: "BOOTSTRAP_ADMIN", targetType: "user", targetId: created.id, outcome: "ALLOW", metadata: {} } });
      await tx.deploymentBootstrap.update({ where: { bootstrapKey: "identity-v1" }, data: { status: "COMPLETED", completedAt: this.now(), counts: JSON.stringify({ administrators: 1, grants: 0 }) } });
      return created;
    }, { isolationLevel: "Serializable" });
    return { userId: user.id };
  }

  async createUser(input: { login: string; displayName: string; password: string; isAdministrator?: boolean; actorId: string }): Promise<{ userId: string }> {
    const passwordDigest = await hashPassword(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.userAccount.create({ data: { login: input.login, displayName: input.displayName, passwordDigest, isAdministrator: input.isAdministrator ?? false } });
      await tx.securityAudit.create({ data: audit(input.actorId, "CREATE_USER", "user", created.id) });
      return created;
    });
    return { userId: user.id };
  }

  async createAgent(input: { ownerUserId: string; name: string; actorId: string }): Promise<{ agentId: string }> {
    const owner = await this.prisma.userAccount.findFirst({ where: { id: input.ownerUserId, status: "ACTIVE" } });
    if (!owner) throw new IdentityError("IDENTITY_NOT_FOUND");
    const agent = await this.prisma.$transaction(async (tx) => {
      const created = await tx.agentIdentity.create({ data: { ownerUserId: input.ownerUserId, name: input.name } });
      await tx.securityAudit.create({ data: audit(input.actorId, "CREATE_AGENT", "agent", created.id) });
      return created;
    });
    return { agentId: agent.id };
  }

  async grantOperation(input: { userId: string; applicationServiceId: string; operation: Permission; actorId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const [user, scope] = await Promise.all([
        tx.userAccount.findUnique({ where: { id: input.userId } }),
        tx.architectureScope.findUnique({ where: { id: input.applicationServiceId } })
      ]);
      if (!user || user.status !== "ACTIVE" || !scope || scope.level !== "applicationService") throw new IdentityError("IDENTITY_NOT_FOUND");
      await tx.scopeOperationGrant.upsert({
        where: { subjectId_applicationServiceId_operation: { subjectId: input.userId, applicationServiceId: input.applicationServiceId, operation: input.operation } },
        create: { subjectId: input.userId, applicationServiceId: input.applicationServiceId, operation: input.operation, createdByUserId: input.actorId },
        update: {}
      });
      await tx.userAccount.update({ where: { id: input.userId }, data: { authorizationVersion: { increment: 1 } } });
      await tx.securityAudit.create({ data: audit(input.actorId, "GRANT_OPERATION", "scope-operation-grant", `${input.userId}:${input.applicationServiceId}:${input.operation}`) });
    });
  }

  async revokeOperation(input: { userId: string; applicationServiceId: string; operation: Permission; actorId: string; reason: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.scopeOperationGrant.deleteMany({ where: { subjectId: input.userId, applicationServiceId: input.applicationServiceId, operation: input.operation } });
      if (!deleted.count) throw new IdentityError("IDENTITY_NOT_FOUND");
      await tx.userAccount.update({ where: { id: input.userId }, data: { authorizationVersion: { increment: 1 } } });
      await tx.securityAudit.create({ data: { ...audit(input.actorId, "REVOKE_OPERATION", "scope-operation-grant", `${input.userId}:${input.applicationServiceId}:${input.operation}`), reason: input.reason } });
    });
  }

  async createAgentCredential(input: { ownerUserId: string; agentId: string; ceiling: ScopedOperationGrant[]; expiresAt: Date; actorId: string }): Promise<{ credentialId: string; agentId: string; secret: string; expiresAt: Date }> {
    if (input.expiresAt <= this.now()) throw new IdentityError("INVALID_CREDENTIAL_EXPIRY");
    const issued = createOpaqueCredential(this.options.pepper);
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agentIdentity.findFirst({ where: { id: input.agentId, ownerUserId: input.ownerUserId, status: "ACTIVE" }, include: { owner: { include: { grants: true } } } });
      if (!agent || agent.owner.status !== "ACTIVE") throw new IdentityError("OWNER_ACCESS_DENIED");
      const ownerGrants = agent.owner.grants.map((grant) => ({ applicationServiceId: grant.applicationServiceId, operation: grant.operation as Permission }));
      if (input.ceiling.some((grant) => !ownerGrants.some((owner) => owner.applicationServiceId === grant.applicationServiceId && owner.operation === grant.operation))) throw new IdentityError("OPERATION_DENIED");
      const credential = await tx.agentCredential.create({ data: { agentId: agent.id, secretDigest: issued.digest, expiresAt: input.expiresAt } });
      if (input.ceiling.length) await tx.agentCredentialScopeGrant.createMany({ data: input.ceiling.map((grant) => ({ credentialId: credential.id, applicationServiceId: grant.applicationServiceId, operation: grant.operation })) });
      await tx.securityAudit.create({ data: audit(input.actorId, "ISSUE_AGENT_CREDENTIAL", "agent-credential", credential.id) });
      return { credentialId: credential.id, agentId: agent.id, secret: issued.secret, expiresAt: credential.expiresAt };
    });
  }

  async revokeCredential(input: { credentialId: string; ownerUserId: string; actorId: string; reason: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const credential = await tx.agentCredential.findUnique({ where: { id: input.credentialId }, include: { agent: true } });
      if (!credential || credential.agent.ownerUserId !== input.ownerUserId) throw new IdentityError("OWNER_ACCESS_DENIED");
      await tx.agentCredential.update({ where: { id: credential.id }, data: { status: "REVOKED", revokedAt: this.now(), version: { increment: 1 } } });
      await tx.securityAudit.create({ data: { ...audit(input.actorId, "REVOKE_AGENT_CREDENTIAL", "agent-credential", credential.id), reason: input.reason } });
    });
  }

  async rotateAgentCredential(input: { credentialId: string; ownerUserId: string; actorId: string; expiresAt: Date }): Promise<{ credentialId: string; agentId: string; secret: string; expiresAt: Date }> {
    if (input.expiresAt <= this.now()) throw new IdentityError("INVALID_CREDENTIAL_EXPIRY");
    const issued = createOpaqueCredential(this.options.pepper);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.agentCredential.findUnique({ where: { id: input.credentialId }, include: { agent: { include: { owner: { include: { grants: true } } } }, grantCeiling: true } });
      if (!current || current.agent.ownerUserId !== input.ownerUserId || current.status !== "ACTIVE" || current.agent.status !== "ACTIVE" || current.agent.owner.status !== "ACTIVE") throw new IdentityError("OWNER_ACCESS_DENIED");
      const ceiling = current.grantCeiling.map((grant) => ({ applicationServiceId: grant.applicationServiceId, operation: grant.operation as Permission }));
      const ownerGrants = current.agent.owner.grants.map((grant) => ({ applicationServiceId: grant.applicationServiceId, operation: grant.operation as Permission }));
      if (ceiling.some((grant) => !ownerGrants.some((owner) => owner.applicationServiceId === grant.applicationServiceId && owner.operation === grant.operation))) throw new IdentityError("OPERATION_DENIED");
      const replacement = await tx.agentCredential.create({ data: { agentId: current.agentId, secretDigest: issued.digest, expiresAt: input.expiresAt } });
      if (ceiling.length) await tx.agentCredentialScopeGrant.createMany({ data: ceiling.map((grant) => ({ credentialId: replacement.id, applicationServiceId: grant.applicationServiceId, operation: grant.operation })) });
      await tx.agentCredential.update({ where: { id: current.id }, data: { status: "REVOKED", revokedAt: this.now(), version: { increment: 1 } } });
      await tx.securityAudit.create({ data: audit(input.actorId, "ROTATE_AGENT_CREDENTIAL", "agent-credential", replacement.id) });
      return { credentialId: replacement.id, agentId: current.agentId, secret: issued.secret, expiresAt: replacement.expiresAt };
    });
  }

  async disableUser(input: { userId: string; actorId: string; reason: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.userAccount.findUnique({ where: { id: input.userId } });
      if (!user) throw new IdentityError("IDENTITY_NOT_FOUND");
      await tx.userAccount.update({ where: { id: user.id }, data: { status: "DISABLED", disabledAt: this.now(), authorizationVersion: { increment: 1 }, credentialVersion: { increment: 1 } } });
      await tx.webSession.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: this.now() } });
      await tx.agentCredential.updateMany({ where: { agent: { ownerUserId: user.id }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: this.now(), version: { increment: 1 } } });
      await tx.securityAudit.create({ data: { ...audit(input.actorId, "DISABLE_USER", "user", user.id), reason: input.reason } });
    });
  }

  async resetPassword(input: { userId: string; password: string; actorId: string; reason: string }): Promise<void> {
    const passwordDigest = await hashPassword(input.password);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.userAccount.findUnique({ where: { id: input.userId } });
      if (!user || user.status !== "ACTIVE") throw new IdentityError("IDENTITY_NOT_FOUND");
      await tx.userAccount.update({ where: { id: user.id }, data: { passwordDigest, credentialVersion: { increment: 1 } } });
      await tx.webSession.updateMany({ where: { userId: user.id, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: this.now() } });
      await tx.agentCredential.updateMany({ where: { agent: { ownerUserId: user.id }, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: this.now(), version: { increment: 1 } } });
      await tx.securityAudit.create({ data: { ...audit(input.actorId, "RESET_PASSWORD", "user", user.id), reason: input.reason } });
    });
  }

  async resolveAgentPrincipal(secret: string): Promise<ResolvedAgentPrincipal> {
    const persisted = await this.repository.findCredentialByDigest(digestSecret(secret, this.options.pepper));
    if (!persisted || !verifyActiveCredential(persisted, this.now())) throw new IdentityError("CREDENTIAL_INACTIVE");
    return {
      subjectId: persisted.agentId,
      actorType: "agent",
      actorId: persisted.agentId,
      ownerUserId: persisted.ownerUserId,
      credentialId: persisted.id,
      authorizationVersion: persisted.ownerAuthorizationVersion,
      credentialVersion: BigInt(persisted.version),
      ownerGrants: persisted.ownerGrants,
      credentialCeiling: persisted.credentialCeiling
    };
  }
}

function verifyActiveCredential(credential: PersistedAgentCredential, now: Date): boolean {
  return credential.status === "ACTIVE" && credential.agentStatus === "ACTIVE" && credential.ownerStatus === "ACTIVE" && credential.expiresAt > now;
}

function audit(actorId: string, action: string, targetType: string, targetId: string) {
  return { actorType: "user", actorId, action, targetType, targetId, outcome: "ALLOW", metadata: {} };
}
