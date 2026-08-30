-- Add exact-Scope Candidate Set metadata to the existing architecture-fact batch authority.
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "candidateStatus" TEXT;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "sourceBaselineId" TEXT;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "catalogDigest" TEXT;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "relationshipVersion" TEXT;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "designContextDigest" TEXT;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "analysisIntent" TEXT;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "candidateCounts" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "excludedCandidates" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "blockingIssues" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "ArchitectureFactBatch" ADD COLUMN IF NOT EXISTS "snapshotCapturedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "ArchitectureFactBatch_scope_candidate_status_idx" ON "ArchitectureFactBatch"("applicationServiceId", "scopePath", "candidateStatus", "createdAt");
CREATE INDEX IF NOT EXISTS "ArchitectureFactBatch_scope_candidate_snapshot_idx" ON "ArchitectureFactBatch"("applicationServiceId", "scopePath", "sourceBaselineId", "catalogDigest");
