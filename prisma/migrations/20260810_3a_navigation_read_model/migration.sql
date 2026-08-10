ALTER TABLE "ProjectionManifest"
  ADD COLUMN IF NOT EXISTS "profileId" TEXT,
  ADD COLUMN IF NOT EXISTS "profileVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "generationId" TEXT,
  ADD COLUMN IF NOT EXISTS "inputDigest" TEXT,
  ADD COLUMN IF NOT EXISTS "contentDigest" TEXT,
  ADD COLUMN IF NOT EXISTS "nodeCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "edgeCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);

CREATE TABLE "ProjectionBuildJob" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "buildKey" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "profileVersion" TEXT NOT NULL,
    "projectionSchemaVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "checkpoint" JSONB NOT NULL DEFAULT '{}',
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "edgeCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "diagnosticRef" TEXT,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectionBuildJob_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "KnowledgeProjectionNode" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "assertionId" TEXT NOT NULL,
    "semanticIdentity" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "sortKey" TEXT NOT NULL,
    "acceptedAssetType" TEXT,
    "acceptedAssetId" TEXT,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeProjectionNode_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "KnowledgeProjectionEdge" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "relationshipIdentity" TEXT NOT NULL,
    "relationshipAssertionId" TEXT,
    "relationshipEventId" TEXT,
    "sourceAssertionId" TEXT NOT NULL,
    "targetAssertionId" TEXT NOT NULL,
    "sourceSemanticIdentity" TEXT NOT NULL,
    "targetSemanticIdentity" TEXT NOT NULL,
    "relationCode" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "relationshipVersion" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeProjectionEdge_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "TraceContinuation" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "browseSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "projectionManifestId" TEXT NOT NULL,
    "queryFingerprint" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "stateDigest" TEXT NOT NULL,
    "frontier" JSONB NOT NULL DEFAULT '[]',
    "visitedIds" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TraceContinuation_pkey" PRIMARY KEY ("dbId")
);

CREATE UNIQUE INDEX "ProjectionBuildJob_scope_id_key" ON "ProjectionBuildJob"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ProjectionBuildJob_scope_build_attempt_key" ON "ProjectionBuildJob"("applicationServiceId", "scopePath", "buildKey", "attempt");
CREATE UNIQUE INDEX "ProjectionBuildJob_one_active_build_key" ON "ProjectionBuildJob"("applicationServiceId", "scopePath", "buildKey") WHERE status IN ('QUEUED', 'BUILDING');
CREATE UNIQUE INDEX "KnowledgeProjectionNode_scope_generation_assertion_key" ON "KnowledgeProjectionNode"("applicationServiceId", "scopePath", "generationId", "assertionId");
CREATE UNIQUE INDEX "KnowledgeProjectionEdge_scope_generation_identity_key" ON "KnowledgeProjectionEdge"("applicationServiceId", "scopePath", "generationId", "relationshipIdentity");
CREATE UNIQUE INDEX "TraceContinuation_scope_session_key" ON "TraceContinuation"("applicationServiceId", "scopePath", "browseSessionId");
CREATE INDEX "ProjectionBuildJob_claim_idx" ON "ProjectionBuildJob"(status, "availableAt", "leaseExpiresAt", "createdAt");
CREATE INDEX "ProjectionBuildJob_scope_baseline_profile_idx" ON "ProjectionBuildJob"("applicationServiceId", "scopePath", "baselineId", "profileId", "profileVersion");
CREATE INDEX "KnowledgeProjectionNode_search_idx" ON "KnowledgeProjectionNode"("applicationServiceId", "scopePath", "generationId", layer, "sortKey", "assertionId");
CREATE INDEX "KnowledgeProjectionNode_identity_idx" ON "KnowledgeProjectionNode"("applicationServiceId", "scopePath", "generationId", "semanticIdentity");
CREATE INDEX "KnowledgeProjectionEdge_source_idx" ON "KnowledgeProjectionEdge"("applicationServiceId", "scopePath", "generationId", "sourceAssertionId", "relationCode", "targetAssertionId");
CREATE INDEX "KnowledgeProjectionEdge_target_idx" ON "KnowledgeProjectionEdge"("applicationServiceId", "scopePath", "generationId", "targetAssertionId", "relationCode", "sourceAssertionId");
CREATE INDEX "TraceContinuation_expiry_idx" ON "TraceContinuation"("expiresAt");
CREATE INDEX "TraceContinuation_scope_subject_expiry_idx" ON "TraceContinuation"("applicationServiceId", "scopePath", "subject", "expiresAt");
