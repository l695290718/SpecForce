import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction([
    prisma.$executeRawUnsafe(`ALTER TABLE "DesignAsset" ADD COLUMN IF NOT EXISTS "integrationCallKey" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "DesignAsset" ADD COLUMN IF NOT EXISTS "integrationSortKey" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "DesignAsset" ADD COLUMN IF NOT EXISTS "integrationTargetBinding" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "DesignAsset" ADD COLUMN IF NOT EXISTS "integrationProtocolKind" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "DesignAsset" ADD COLUMN IF NOT EXISTS "integrationProtocolLocator" TEXT`),
    prisma.$executeRawUnsafe(`ALTER TABLE "DesignAsset" ADD COLUMN IF NOT EXISTS "integrationResolutionStatus" TEXT`),
    prisma.$executeRawUnsafe(`
      UPDATE "DesignAsset"
      SET "integrationSortKey" = concat("applicationServiceId", E'\\x1f', 'UNRESOLVED', E'\\x1f', 'UNNORMALIZED', E'\\x1f', '', E'\\x1f', id)
      WHERE type = 'integration' AND "integrationSortKey" IS NULL
    `)
  ]);
  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT "applicationServiceId", "scopePath", "integrationCallKey"
    FROM "DesignAsset"
    WHERE "integrationCallKey" IS NOT NULL
    GROUP BY "applicationServiceId", "scopePath", "integrationCallKey"
    HAVING COUNT(*) > 1
    LIMIT 1
  `);
  if (duplicates.length > 0) throw new Error("ATLAS_SCHEMA_COMPATIBILITY_DUPLICATE_CALL_KEY");
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "DesignAsset_applicationServiceId_scopePath_integrationCallKey_key" ON "DesignAsset"("applicationServiceId", "scopePath", "integrationCallKey")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DesignAsset_applicationServiceId_scopePath_type_integrationSortKey_idx" ON "DesignAsset"("applicationServiceId", "scopePath", type, "integrationSortKey")`);
  console.info("ATLAS_SCHEMA_COMPATIBILITY_COMPLETE");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
