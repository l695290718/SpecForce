-- Upgrade legacy globally keyed design records to scope-aware identities.
DO $$
DECLARE
  table_name TEXT;
  composite_constraint TEXT;
  legacy_constraint RECORD;
  legacy_index RECORD;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['DesignAsset', 'Proposal', 'ContextPack', 'AssetLink']
  LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "dbId" UUID', table_name);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "applicationServiceId" TEXT', table_name);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS "scopePath" TEXT', table_name);
    EXECUTE format(
      'UPDATE %I SET "dbId" = COALESCE("dbId", gen_random_uuid()),
       "applicationServiceId" = COALESCE(NULLIF("applicationServiceId", ''''), %L),
       "scopePath" = COALESCE(NULLIF("scopePath", ''''), %L)
       WHERE "dbId" IS NULL OR "applicationServiceId" IS NULL OR "applicationServiceId" = ''''
          OR "scopePath" IS NULL OR "scopePath" = ''''',
      table_name,
      'com.huawei.celon.desiner',
      'pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'
    );
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "dbId" SET DEFAULT gen_random_uuid()', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "dbId" SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "applicationServiceId" SET NOT NULL', table_name);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN "scopePath" SET NOT NULL', table_name);

    FOR legacy_constraint IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = to_regclass(format('%I', table_name))
        AND ((contype = 'p' AND pg_get_constraintdef(oid) ~ '^PRIMARY KEY \("?id"?\)$')
          OR (contype = 'u' AND pg_get_constraintdef(oid) ~ '^UNIQUE \("?id"?\)$'))
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', table_name, legacy_constraint.conname);
    END LOOP;

    FOR legacy_index IN
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = table_name
        AND indexdef ~ '^CREATE UNIQUE INDEX .* \("?id"?\)$'
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I.%I', current_schema(), legacy_index.indexname);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass(format('%I', table_name)) AND contype = 'p'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY ("dbId")', table_name, table_name || '_pkey');
    END IF;

    composite_constraint := table_name || '_applicationServiceId_scopePath_id_key';
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = to_regclass(format('%I', table_name)) AND conname = composite_constraint
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I UNIQUE ("applicationServiceId", "scopePath", id)',
        table_name,
        composite_constraint
      );
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("applicationServiceId")', table_name || '_applicationServiceId_idx', table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I ("scopePath")', table_name || '_scopePath_idx', table_name);
  END LOOP;
END $$;

ALTER TABLE "ContextPack" ADD COLUMN IF NOT EXISTS "payload" TEXT;
