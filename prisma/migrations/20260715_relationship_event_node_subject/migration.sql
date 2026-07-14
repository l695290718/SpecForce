DO $$
BEGIN
  EXECUTE 'ALTER TABLE "RelationshipEvent" ALTER COLUMN "relationshipId" DROP NOT NULL';
  EXECUTE 'ALTER TABLE "RelationshipEvent" ADD COLUMN IF NOT EXISTS "assetNodeId" UUID';

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RelationshipEvent"'::regclass
      AND conname = 'RelationshipEvent_asset_node_scope_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE "RelationshipEvent"
      ADD CONSTRAINT "RelationshipEvent_asset_node_scope_fkey"
      FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "assetNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId")
      ON DELETE RESTRICT ON UPDATE CASCADE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = '"RelationshipEvent"'::regclass
      AND conname = 'RelationshipEvent_exactly_one_subject_check'
  ) THEN
    EXECUTE 'ALTER TABLE "RelationshipEvent"
      ADD CONSTRAINT "RelationshipEvent_exactly_one_subject_check"
      CHECK (("relationshipId" IS NOT NULL)::int + ("assetNodeId" IS NOT NULL)::int = 1)';
  END IF;

  IF to_regclass('"RelationshipEvent_scope_asset_node_idx"') IS NULL THEN
    EXECUTE 'CREATE INDEX "RelationshipEvent_scope_asset_node_idx"
      ON "RelationshipEvent" ("enterpriseId", "applicationServiceId", "scopePath", "assetNodeId", "createdAt")';
  END IF;
END $$;
