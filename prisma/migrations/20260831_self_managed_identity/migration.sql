CREATE TABLE "UserAccount" (
    id TEXT NOT NULL,
    login TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordDigest" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    "isAdministrator" BOOLEAN NOT NULL DEFAULT false,
    "authorizationVersion" BIGINT NOT NULL DEFAULT 1,
    "credentialVersion" BIGINT NOT NULL DEFAULT 1,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserAccount_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "UserAccount_login_key" ON "UserAccount"(login);
CREATE INDEX "UserAccount_status_login_idx" ON "UserAccount"(status, login);

CREATE TABLE "AgentIdentity" (
    id TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentIdentity_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "AgentIdentity_ownerUserId_name_key" ON "AgentIdentity"("ownerUserId", name);
CREATE INDEX "AgentIdentity_ownerUserId_status_idx" ON "AgentIdentity"("ownerUserId", status);
ALTER TABLE "AgentIdentity" ADD CONSTRAINT "AgentIdentity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "UserAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AgentCredential" (
    id TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "secretDigest" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    version INTEGER NOT NULL DEFAULT 1,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentCredential_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "AgentCredential_secretDigest_key" ON "AgentCredential"("secretDigest");
CREATE INDEX "AgentCredential_secretDigest_status_expiresAt_idx" ON "AgentCredential"("secretDigest", status, "expiresAt");
CREATE INDEX "AgentCredential_agentId_status_expiresAt_idx" ON "AgentCredential"("agentId", status, "expiresAt");
ALTER TABLE "AgentCredential" ADD CONSTRAINT "AgentCredential_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentIdentity"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ScopeOperationGrant" (
    id TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    operation TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScopeOperationGrant_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "ScopeOperationGrant_subjectId_applicationServiceId_operation_key" ON "ScopeOperationGrant"("subjectId", "applicationServiceId", operation);
CREATE INDEX "ScopeOperationGrant_subjectId_applicationServiceId_operation_idx" ON "ScopeOperationGrant"("subjectId", "applicationServiceId", operation);
CREATE INDEX "ScopeOperationGrant_applicationServiceId_operation_idx" ON "ScopeOperationGrant"("applicationServiceId", operation);
ALTER TABLE "ScopeOperationGrant" ADD CONSTRAINT "ScopeOperationGrant_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "UserAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScopeOperationGrant" ADD CONSTRAINT "ScopeOperationGrant_applicationServiceId_fkey" FOREIGN KEY ("applicationServiceId") REFERENCES "ArchitectureScope"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AgentCredentialScopeGrant" (
    id TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    operation TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentCredentialScopeGrant_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "AgentCredentialScopeGrant_credentialId_applicationServiceId_operation_key" ON "AgentCredentialScopeGrant"("credentialId", "applicationServiceId", operation);
CREATE INDEX "AgentCredentialScopeGrant_credentialId_applicationServiceId_operation_idx" ON "AgentCredentialScopeGrant"("credentialId", "applicationServiceId", operation);
ALTER TABLE "AgentCredentialScopeGrant" ADD CONSTRAINT "AgentCredentialScopeGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "AgentCredential"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentCredentialScopeGrant" ADD CONSTRAINT "AgentCredentialScopeGrant_applicationServiceId_fkey" FOREIGN KEY ("applicationServiceId") REFERENCES "ArchitectureScope"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WebSession" (
    id TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretDigest" TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    "idleExpiresAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebSession_pkey" PRIMARY KEY (id)
);
CREATE UNIQUE INDEX "WebSession_secretDigest_key" ON "WebSession"("secretDigest");
CREATE INDEX "WebSession_userId_status_expiresAt_idx" ON "WebSession"("userId", status, "expiresAt");
CREATE INDEX "WebSession_status_idleExpiresAt_expiresAt_idx" ON "WebSession"(status, "idleExpiresAt", "expiresAt");
ALTER TABLE "WebSession" ADD CONSTRAINT "WebSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"(id) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "SecurityAudit" (
    id TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    action TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    outcome TEXT NOT NULL,
    reason TEXT,
    "correlationId" TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityAudit_pkey" PRIMARY KEY (id)
);
CREATE INDEX "SecurityAudit_actorType_actorId_createdAt_idx" ON "SecurityAudit"("actorType", "actorId", "createdAt");
CREATE INDEX "SecurityAudit_targetType_targetId_createdAt_idx" ON "SecurityAudit"("targetType", "targetId", "createdAt");
CREATE INDEX "SecurityAudit_createdAt_idx" ON "SecurityAudit"("createdAt");

CREATE TABLE "LegacyScopeGrantMigrationReport" (
    id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT',
    "registryDigest" TEXT NOT NULL,
    "grantDigest" TEXT NOT NULL,
    "proposedTuples" JSONB NOT NULL DEFAULT '[]',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LegacyScopeGrantMigrationReport_pkey" PRIMARY KEY (id)
);
CREATE INDEX "LegacyScopeGrantMigrationReport_status_createdAt_idx" ON "LegacyScopeGrantMigrationReport"(status, "createdAt");
