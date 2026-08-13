-- Scope is a pair. Legacy operational rows may remain unscoped, but partial
-- ownership is invalid and scoped readers must always filter both columns.
ALTER TABLE "GovernanceCheckSnapshot"
  ADD COLUMN IF NOT EXISTS "applicationServiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "scopePath" TEXT;

ALTER TABLE "AuditLog"
  ADD COLUMN IF NOT EXISTS "applicationServiceId" TEXT,
  ADD COLUMN IF NOT EXISTS "scopePath" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'GovernanceCheckSnapshot_scope_pair_check'
  ) THEN
    ALTER TABLE "GovernanceCheckSnapshot"
      ADD CONSTRAINT "GovernanceCheckSnapshot_scope_pair_check"
      CHECK (("applicationServiceId" IS NULL) = ("scopePath" IS NULL));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AuditLog_scope_pair_check'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_scope_pair_check"
      CHECK (("applicationServiceId" IS NULL) = ("scopePath" IS NULL));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "GovernanceCheckSnapshot_scope_asset_idx"
  ON "GovernanceCheckSnapshot"("applicationServiceId", "scopePath", "assetType", "assetId");
CREATE INDEX IF NOT EXISTS "AuditLog_scope_createdAt_idx"
  ON "AuditLog"("applicationServiceId", "scopePath", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_scope_target_idx"
  ON "AuditLog"("applicationServiceId", "scopePath", "targetType", "targetId");
