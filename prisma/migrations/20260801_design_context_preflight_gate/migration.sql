ALTER TABLE "DesignChangeSession"
  ADD COLUMN IF NOT EXISTS "preflightDigest" TEXT,
  ADD COLUMN IF NOT EXISTS "preflightRelationshipDigest" TEXT,
  ADD COLUMN IF NOT EXISTS "preflightReadAssetIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "closureReason" TEXT;
