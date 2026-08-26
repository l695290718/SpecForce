-- Durable, exact-Scope requirement assessment persistence.
-- PostgreSQL is authoritative; no foreign key crosses an application-service Scope.

CREATE TABLE "RequirementBrief" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "canonicalIntent" TEXT NOT NULL,
    "localizedContent" JSONB NOT NULL DEFAULT '{}',
    "confirmedFacts" JSONB NOT NULL DEFAULT '{}',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "acceptanceCriteria" JSONB NOT NULL DEFAULT '[]',
    "qualityTargets" JSONB NOT NULL DEFAULT '{}',
    "constraints" JSONB NOT NULL DEFAULT '[]',
    "exclusions" JSONB NOT NULL DEFAULT '[]',
    "sourceReferences" JSONB NOT NULL DEFAULT '[]',
    "authorId" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RequirementBrief_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "RequirementBrief_scope_id_key" ON "RequirementBrief"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "RequirementBrief_scope_requirement_revision_key" ON "RequirementBrief"("applicationServiceId", "scopePath", "requirementId", "revision");
CREATE INDEX "RequirementBrief_scope_digest_idx" ON "RequirementBrief"("applicationServiceId", "scopePath", "contentDigest");

CREATE TABLE "RequirementAssessmentRun" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "requirementRevision" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "evidenceSnapshotId" TEXT,
    "assessmentId" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "cancellationRequestedAt" TIMESTAMP(3),
    "stopReason" TEXT,
    "partialDiagnostics" JSONB NOT NULL DEFAULT '{}',
    "modelInvocationRefs" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RequirementAssessmentRun_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "RequirementAssessmentRun_scope_id_key" ON "RequirementAssessmentRun"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "RequirementAssessmentRun_scope_idempotency_key" ON "RequirementAssessmentRun"("applicationServiceId", "scopePath", "idempotencyKey");
CREATE INDEX "RequirementAssessmentRun_scope_status_created_idx" ON "RequirementAssessmentRun"("applicationServiceId", "scopePath", "status", "createdAt");
CREATE INDEX "RequirementAssessmentRun_scope_lease_idx" ON "RequirementAssessmentRun"("applicationServiceId", "scopePath", "leaseExpiresAt");

CREATE TABLE "AssessmentEvidenceSnapshot" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "requirementRevision" INTEGER NOT NULL,
    "authorizationDecisionRef" TEXT NOT NULL,
    "catalogWaterline" TEXT NOT NULL,
    "relationshipWaterline" TEXT NOT NULL,
    "projectionCheckpoint" TEXT,
    "orderedAssetManifest" JSONB NOT NULL DEFAULT '[]',
    "relationshipManifest" JSONB NOT NULL DEFAULT '[]',
    "rulesetRevision" TEXT NOT NULL,
    "coveragePolicyRevision" TEXT NOT NULL,
    "promptTemplateDigest" TEXT NOT NULL,
    "reviewTemplateDigest" TEXT NOT NULL,
    "modelProfileRevision" TEXT NOT NULL,
    "executionProfileRevision" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "validAtWaterline" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentEvidenceSnapshot_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "AssessmentEvidenceSnapshot_scope_id_key" ON "AssessmentEvidenceSnapshot"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "AssessmentEvidenceSnapshot_scope_digest_key" ON "AssessmentEvidenceSnapshot"("applicationServiceId", "scopePath", "contentDigest");
CREATE INDEX "AssessmentEvidenceSnapshot_scope_requirement_revision_idx" ON "AssessmentEvidenceSnapshot"("applicationServiceId", "scopePath", "requirementId", "requirementRevision");
CREATE INDEX "AssessmentEvidenceSnapshot_scope_content_digest_idx" ON "AssessmentEvidenceSnapshot"("applicationServiceId", "scopePath", "contentDigest");

CREATE TABLE "RequirementAssessment" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "evidenceCoverage" DOUBLE PRECISION NOT NULL,
    "evidenceSnapshotId" TEXT NOT NULL,
    "designContextDigest" TEXT NOT NULL,
    "canonicalSummary" TEXT NOT NULL,
    "localizedContent" JSONB NOT NULL DEFAULT '{}',
    "impactedFacts" JSONB NOT NULL DEFAULT '[]',
    "hardConstraints" JSONB NOT NULL DEFAULT '[]',
    "unresolvedDependencies" JSONB NOT NULL DEFAULT '[]',
    "solutionOptions" JSONB NOT NULL DEFAULT '[]',
    "workBreakdown" JSONB NOT NULL DEFAULT '[]',
    "humanEstimate" JSONB NOT NULL DEFAULT '{}',
    "aiEstimate" JSONB NOT NULL DEFAULT '{}',
    "assumptions" JSONB NOT NULL DEFAULT '[]',
    "unknowns" JSONB NOT NULL DEFAULT '[]',
    "sensitivityFactors" JSONB NOT NULL DEFAULT '[]',
    "reviewResult" JSONB NOT NULL DEFAULT '{}',
    "validAtWaterline" TEXT NOT NULL,
    "invalidatedBy" TEXT,
    "invalidatedAt" TIMESTAMP(3),
    "staleReason" TEXT,
    "supersedesId" TEXT,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RequirementAssessment_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "RequirementAssessment_scope_id_key" ON "RequirementAssessment"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "RequirementAssessment_scope_requirement_revision_key" ON "RequirementAssessment"("applicationServiceId", "scopePath", "requirementId", "revision");
CREATE INDEX "RequirementAssessment_scope_lifecycle_created_idx" ON "RequirementAssessment"("applicationServiceId", "scopePath", "lifecycle", "createdAt");
CREATE INDEX "RequirementAssessment_scope_content_digest_idx" ON "RequirementAssessment"("applicationServiceId", "scopePath", "contentDigest");
CREATE INDEX "RequirementAssessment_scope_snapshot_idx" ON "RequirementAssessment"("applicationServiceId", "scopePath", "evidenceSnapshotId");

CREATE TABLE "RequirementAssessmentTask" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "assessmentRevision" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "estimate" JSONB NOT NULL DEFAULT '{}',
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RequirementAssessmentTask_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "RequirementAssessmentTask_scope_id_key" ON "RequirementAssessmentTask"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "RequirementAssessmentTask_scope_sequence_key" ON "RequirementAssessmentTask"("applicationServiceId", "scopePath", "assessmentId", "assessmentRevision", "sequence");
CREATE INDEX "RequirementAssessmentTask_scope_assessment_sequence_idx" ON "RequirementAssessmentTask"("applicationServiceId", "scopePath", "assessmentId", "sequence");
CREATE INDEX "RequirementAssessmentTask_scope_content_digest_idx" ON "RequirementAssessmentTask"("applicationServiceId", "scopePath", "contentDigest");

CREATE TABLE "ModelProfile" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "contextLimit" INTEGER NOT NULL,
    "inputPrice" DOUBLE PRECISION,
    "outputPrice" DOUBLE PRECISION,
    "approvedDataClasses" JSONB NOT NULL DEFAULT '[]',
    "calibration" JSONB NOT NULL DEFAULT '{}',
    "observedUsage" JSONB NOT NULL DEFAULT '{}',
    "cachingPolicy" JSONB NOT NULL DEFAULT '{}',
    "priceAssumptions" JSONB NOT NULL DEFAULT '{}',
    "supportedToolProfile" JSONB NOT NULL DEFAULT '{}',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModelProfile_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "ModelProfile_scope_id_key" ON "ModelProfile"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "ModelProfile_scope_profile_revision_key" ON "ModelProfile"("applicationServiceId", "scopePath", "profileId", "revision");
CREATE INDEX "ModelProfile_scope_status_created_idx" ON "ModelProfile"("applicationServiceId", "scopePath", "status", "createdAt");
CREATE INDEX "ModelProfile_scope_content_digest_idx" ON "ModelProfile"("applicationServiceId", "scopePath", "contentDigest");

CREATE TABLE "AgentExecutionProfile" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "primaryModelProfileId" TEXT NOT NULL,
    "reviewModelProfileId" TEXT NOT NULL,
    "toolSet" JSONB NOT NULL DEFAULT '[]',
    "contextAssembly" JSONB NOT NULL DEFAULT '{}',
    "maxContextTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "maxRepairLoops" INTEGER NOT NULL,
    "maxToolCalls" INTEGER NOT NULL,
    "hardTokenBudget" INTEGER NOT NULL,
    "stopOnBudgetExceeded" BOOLEAN NOT NULL,
    "retryPolicy" JSONB NOT NULL DEFAULT '{}',
    "concurrency" INTEGER NOT NULL DEFAULT 1,
    "cacheBehavior" JSONB NOT NULL DEFAULT '{}',
    "verificationCommands" JSONB NOT NULL DEFAULT '[]',
    "stopConditions" JSONB NOT NULL DEFAULT '[]',
    "overrunPolicy" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentExecutionProfile_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "AgentExecutionProfile_scope_id_key" ON "AgentExecutionProfile"("applicationServiceId", "scopePath", "id");
CREATE UNIQUE INDEX "AgentExecutionProfile_scope_profile_revision_key" ON "AgentExecutionProfile"("applicationServiceId", "scopePath", "profileId", "revision");
CREATE INDEX "AgentExecutionProfile_scope_status_created_idx" ON "AgentExecutionProfile"("applicationServiceId", "scopePath", "status", "createdAt");
CREATE INDEX "AgentExecutionProfile_scope_content_digest_idx" ON "AgentExecutionProfile"("applicationServiceId", "scopePath", "contentDigest");

CREATE TABLE "AssessmentExecutionActual" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "runId" TEXT,
    "executionProfileId" TEXT NOT NULL,
    "modelRevisions" JSONB NOT NULL DEFAULT '{}',
    "usageDetails" JSONB NOT NULL DEFAULT '{}',
    "toolInvocations" JSONB NOT NULL DEFAULT '[]',
    "verificationCycles" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "humanIntervention" JSONB NOT NULL DEFAULT '{}',
    "elapsedAgentSeconds" INTEGER,
    "actualPersonDays" DOUBLE PRECISION,
    "changedAssets" JSONB NOT NULL DEFAULT '[]',
    "finalStatus" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AssessmentExecutionActual_pkey" PRIMARY KEY ("dbId")
);
CREATE UNIQUE INDEX "AssessmentExecutionActual_scope_id_key" ON "AssessmentExecutionActual"("applicationServiceId", "scopePath", "id");
CREATE INDEX "AssessmentExecutionActual_scope_assessment_created_idx" ON "AssessmentExecutionActual"("applicationServiceId", "scopePath", "assessmentId", "createdAt");
CREATE INDEX "AssessmentExecutionActual_scope_content_digest_idx" ON "AssessmentExecutionActual"("applicationServiceId", "scopePath", "contentDigest");
