CREATE TABLE IF NOT EXISTS "KnowledgeReadinessPolicy" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "overlay" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeReadinessPolicy_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeReadinessPolicy_scope_id_version_key" ON "KnowledgeReadinessPolicy"("applicationServiceId", "scopePath", "id", "version");
CREATE INDEX IF NOT EXISTS "KnowledgeReadinessPolicy_scope_profile_status_idx" ON "KnowledgeReadinessPolicy"("applicationServiceId", "scopePath", "profileId", "status", "version");

CREATE TABLE IF NOT EXISTS "SystemKnowledgeReadinessReceipt" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "deterministicKey" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grantDigest" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "selectorDigest" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "policyVersion" INTEGER NOT NULL,
    "trustStatus" TEXT NOT NULL,
    "dimensionStatuses" JSONB NOT NULL,
    "baselineBindings" JSONB NOT NULL,
    "sourceWaterlines" JSONB NOT NULL,
    "coverageSummary" JSONB NOT NULL,
    "freshnessSummary" JSONB NOT NULL,
    "reasonCodes" JSONB NOT NULL,
    "remediationActions" JSONB NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "receiptDigest" TEXT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemKnowledgeReadinessReceipt_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SystemKnowledgeReadinessReceipt_scope_id_key" ON "SystemKnowledgeReadinessReceipt"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "SystemKnowledgeReadinessReceipt_scope_deterministic_key" ON "SystemKnowledgeReadinessReceipt"("applicationServiceId", "scopePath", "deterministicKey");
CREATE INDEX IF NOT EXISTS "SKRR_scope_subject_profile_expiry_idx" ON "SystemKnowledgeReadinessReceipt"("applicationServiceId", "scopePath", "subjectId", "profileId", "validUntil");
CREATE INDEX IF NOT EXISTS "SystemKnowledgeReadinessReceipt_scope_lifecycle_created_idx" ON "SystemKnowledgeReadinessReceipt"("applicationServiceId", "scopePath", "lifecycleStatus", "createdAt");
