ALTER TABLE "KnowledgeScanReport"
  ADD COLUMN IF NOT EXISTS "observationIds" JSONB NOT NULL DEFAULT '[]'::jsonb;
