CREATE TABLE "KnowledgeAssertion" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "semanticIdentity" TEXT NOT NULL,
    "factType" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "value" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchingEvidence" JSONB NOT NULL DEFAULT '[]',
    "counterEvidence" JSONB NOT NULL DEFAULT '[]',
    "unresolvedQuestions" JSONB NOT NULL DEFAULT '[]',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "sourceObservationIds" JSONB NOT NULL DEFAULT '[]',
    "extractorId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "changeSetId" TEXT,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeAssertion_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "IdentityCandidate" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "semanticIdentity" TEXT NOT NULL,
    "sourceObservationId" TEXT NOT NULL,
    "targetAssetType" TEXT NOT NULL,
    "targetAssetId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "matchingEvidence" JSONB NOT NULL DEFAULT '[]',
    "counterEvidence" JSONB NOT NULL DEFAULT '[]',
    "decision" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IdentityCandidate_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "KnowledgeChangeSet" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "assetRevisionIds" JSONB NOT NULL DEFAULT '[]',
    "relationshipRevisionIds" JSONB NOT NULL DEFAULT '[]',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "digest" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeChangeSet_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "WorkingStream" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "headChangeSetId" TEXT,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkingStream_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "KnowledgeBaseline" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "changeSetId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "manifest" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeBaseline_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "ProjectionManifest" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "projectionType" TEXT NOT NULL,
    "projectionSchemaVersion" TEXT NOT NULL,
    "sourceRevisionIds" JSONB NOT NULL DEFAULT '[]',
    "relationshipVersion" TEXT NOT NULL,
    "query" JSONB NOT NULL DEFAULT '{}',
    "digest" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectionManifest_pkey" PRIMARY KEY ("dbId")
);

CREATE UNIQUE INDEX "KnowledgeAssertion_scope_id_key" ON "KnowledgeAssertion"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "IdentityCandidate_scope_id_key" ON "IdentityCandidate"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "KnowledgeChangeSet_scope_id_key" ON "KnowledgeChangeSet"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "KnowledgeChangeSet_scope_stream_sequence_key" ON "KnowledgeChangeSet"("applicationServiceId", "scopePath", "streamId", "sequence");
CREATE UNIQUE INDEX "WorkingStream_scope_id_key" ON "WorkingStream"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "KnowledgeBaseline_scope_id_key" ON "KnowledgeBaseline"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ProjectionManifest_scope_id_key" ON "ProjectionManifest"("applicationServiceId", "scopePath", "id");
CREATE INDEX "KnowledgeAssertion_scope_identity_revision_idx" ON "KnowledgeAssertion"("applicationServiceId", "scopePath", "semanticIdentity", "revision");
CREATE INDEX "KnowledgeAssertion_scope_status_idx" ON "KnowledgeAssertion"("applicationServiceId", "scopePath", "status");
CREATE INDEX "KnowledgeAssertion_scope_changeset_idx" ON "KnowledgeAssertion"("applicationServiceId", "scopePath", "changeSetId");
CREATE INDEX "IdentityCandidate_scope_observation_idx" ON "IdentityCandidate"("applicationServiceId", "scopePath", "sourceObservationId");
CREATE INDEX "IdentityCandidate_scope_decision_idx" ON "IdentityCandidate"("applicationServiceId", "scopePath", "decision");
CREATE INDEX "KnowledgeChangeSet_scope_stream_status_idx" ON "KnowledgeChangeSet"("applicationServiceId", "scopePath", "streamId", "status");
CREATE INDEX "WorkingStream_scope_status_idx" ON "WorkingStream"("applicationServiceId", "scopePath", "status");
CREATE INDEX "KnowledgeBaseline_scope_stream_status_idx" ON "KnowledgeBaseline"("applicationServiceId", "scopePath", "streamId", "status");
CREATE INDEX "ProjectionManifest_scope_baseline_type_idx" ON "ProjectionManifest"("applicationServiceId", "scopePath", "baselineId", "projectionType");
