-- Governed bilingual 3A architecture-fact authoring.
-- PostgreSQL is authoritative; projection tables remain derived.

CREATE TABLE "ArchitectureFactBatch" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "designChangeSessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provenance" JSONB NOT NULL DEFAULT '{}',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "unitRevisionIds" JSONB NOT NULL DEFAULT '[]',
    "membershipRevisionIds" JSONB NOT NULL DEFAULT '[]',
    "mappingRevisionIds" JSONB NOT NULL DEFAULT '[]',
    "canonicalBytes" INTEGER NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArchitectureFactBatch_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "ArchitectureFactBatch_scope_id_key" ON "ArchitectureFactBatch"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ArchitectureFactBatch_scope_idempotency_key" ON "ArchitectureFactBatch"("applicationServiceId", "scopePath", "idempotencyKey");
CREATE INDEX "ArchitectureFactBatch_scope_session_status_idx" ON "ArchitectureFactBatch"("applicationServiceId", "scopePath", "designChangeSessionId", "status");
CREATE INDEX "ArchitectureFactBatch_scope_digest_idx" ON "ArchitectureFactBatch"("applicationServiceId", "scopePath", "contentDigest");

CREATE TABLE "ArchitectureUnitRevision" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "unitIdentity" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "layer" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentUnitIdentity" TEXT,
    "canonicalName" TEXT NOT NULL,
    "canonicalDescription" TEXT NOT NULL,
    "localizedContent" JSONB NOT NULL DEFAULT '{}',
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "criticality" DOUBLE PRECISION NOT NULL,
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "changeSetId" TEXT,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArchitectureUnitRevision_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "ArchitectureUnitRevision_scope_id_key" ON "ArchitectureUnitRevision"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ArchitectureUnitRevision_scope_identity_revision_key" ON "ArchitectureUnitRevision"("applicationServiceId", "scopePath", "unitIdentity", "revision");
CREATE INDEX "ArchitectureUnitRevision_scope_batch_status_idx" ON "ArchitectureUnitRevision"("applicationServiceId", "scopePath", "batchId", "status");
CREATE INDEX "ArchitectureUnitRevision_scope_changeset_status_idx" ON "ArchitectureUnitRevision"("applicationServiceId", "scopePath", "changeSetId", "status");
CREATE INDEX "ArchitectureUnitRevision_scope_layer_kind_identity_idx" ON "ArchitectureUnitRevision"("applicationServiceId", "scopePath", "layer", "kind", "unitIdentity");

CREATE TABLE "ArchitectureUnitMembershipRevision" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "membershipIdentity" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "unitIdentity" TEXT NOT NULL,
    "assertionId" TEXT,
    "assetType" TEXT,
    "assetId" TEXT,
    "semanticIdentity" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "changeSetId" TEXT,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArchitectureUnitMembershipRevision_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "ArchitectureUnitMembershipRevision_scope_id_key" ON "ArchitectureUnitMembershipRevision"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ArchitectureUnitMembershipRevision_scope_identity_revision_key" ON "ArchitectureUnitMembershipRevision"("applicationServiceId", "scopePath", "membershipIdentity", "revision");
CREATE INDEX "ArchitectureUnitMembershipRevision_scope_batch_status_idx" ON "ArchitectureUnitMembershipRevision"("applicationServiceId", "scopePath", "batchId", "status");
CREATE INDEX "ArchitectureUnitMembershipRevision_scope_unit_status_idx" ON "ArchitectureUnitMembershipRevision"("applicationServiceId", "scopePath", "unitIdentity", "status");
CREATE INDEX "ArchitectureUnitMembershipRevision_scope_assertion_status_idx" ON "ArchitectureUnitMembershipRevision"("applicationServiceId", "scopePath", "assertionId", "status");
CREATE INDEX "ArchitectureUnitMembershipRevision_scope_asset_status_idx" ON "ArchitectureUnitMembershipRevision"("applicationServiceId", "scopePath", "assetType", "assetId", "status");

CREATE TABLE "ArchitectureUnitMappingRevision" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "mappingIdentity" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "sourceUnitIdentity" TEXT NOT NULL,
    "targetUnitIdentity" TEXT NOT NULL,
    "mappingFamily" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "relationshipIdentities" JSONB NOT NULL DEFAULT '[]',
    "evidenceRefs" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "changeSetId" TEXT,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ArchitectureUnitMappingRevision_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "ArchitectureUnitMappingRevision_scope_id_key" ON "ArchitectureUnitMappingRevision"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ArchitectureUnitMappingRevision_scope_identity_revision_key" ON "ArchitectureUnitMappingRevision"("applicationServiceId", "scopePath", "mappingIdentity", "revision");
CREATE INDEX "ArchitectureUnitMappingRevision_scope_batch_status_idx" ON "ArchitectureUnitMappingRevision"("applicationServiceId", "scopePath", "batchId", "status");
CREATE INDEX "ArchitectureUnitMappingRevision_scope_source_status_idx" ON "ArchitectureUnitMappingRevision"("applicationServiceId", "scopePath", "sourceUnitIdentity", "status");
CREATE INDEX "ArchitectureUnitMappingRevision_scope_target_status_idx" ON "ArchitectureUnitMappingRevision"("applicationServiceId", "scopePath", "targetUnitIdentity", "status");
CREATE INDEX "ArchitectureUnitMappingRevision_scope_family_status_idx" ON "ArchitectureUnitMappingRevision"("applicationServiceId", "scopePath", "mappingFamily", "status");

ALTER TABLE "KnowledgeChangeSet" ADD COLUMN "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "KnowledgeReviewBundle" ADD COLUMN "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "KnowledgePromotionDecision" ADD COLUMN "approvedArchitectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "KnowledgePromotionReceipt" ADD COLUMN "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "KnowledgePromotionReceipt" ADD COLUMN "architectureFactBatchId" TEXT;
