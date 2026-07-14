-- Permit graph-change events for either a relationship or an asset node, never both.
ALTER TABLE "RelationshipEvent"
  ALTER COLUMN "relationshipId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "assetNodeId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RelationshipEvent"'::regclass
      AND conname = 'RelationshipEvent_asset_node_scope_fkey'
  ) THEN
    ALTER TABLE "RelationshipEvent"
      ADD CONSTRAINT "RelationshipEvent_asset_node_scope_fkey"
      FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "assetNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RelationshipEvent"'::regclass
      AND conname = 'RelationshipEvent_exactly_one_subject_check'
  ) THEN
    ALTER TABLE "RelationshipEvent"
      ADD CONSTRAINT "RelationshipEvent_exactly_one_subject_check"
      CHECK (("relationshipId" IS NOT NULL)::int + ("assetNodeId" IS NOT NULL)::int = 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "RelationshipEvent_scope_asset_node_idx"
  ON "RelationshipEvent" ("enterpriseId", "applicationServiceId", "scopePath", "assetNodeId", "createdAt");
