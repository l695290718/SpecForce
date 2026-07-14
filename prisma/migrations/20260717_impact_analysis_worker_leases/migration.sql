ALTER TABLE "ImpactAnalysisRun"
  ADD COLUMN IF NOT EXISTS "leaseOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ImpactAnalysisRun_scope_lease_idx"
  ON "ImpactAnalysisRun" ("enterpriseId", "applicationServiceId", "scopePath", status, "leaseExpiresAt");
