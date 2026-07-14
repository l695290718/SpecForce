DO $$
BEGIN
  EXECUTE 'CREATE TABLE IF NOT EXISTS "RelationshipCommandReceipt" (
    "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "commandHash" TEXT NOT NULL,
    "commandType" TEXT NOT NULL,
    status TEXT NOT NULL,
    result JSONB NOT NULL DEFAULT ''{}''::jsonb,
    "graphVersion" BIGINT NOT NULL,
    "primaryEventId" UUID,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipCommandReceipt_scope_idempotency_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey"),
    CONSTRAINT "RelationshipCommandReceipt_scope_dbId_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "dbId")
  )';

  IF to_regclass('"RelationshipCommandReceipt_scope_created_idx"') IS NULL THEN
    EXECUTE 'CREATE INDEX "RelationshipCommandReceipt_scope_created_idx"
      ON "RelationshipCommandReceipt" ("enterpriseId", "applicationServiceId", "scopePath", "createdAt")';
  END IF;
END $$;
