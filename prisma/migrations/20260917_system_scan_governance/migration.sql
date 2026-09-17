CREATE TABLE "SystemScanGovernanceRecord" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemScanGovernanceRecord_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "ScopeScanRuntimeProfile" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ScopeScanRuntimeProfile_pkey" PRIMARY KEY ("dbId")
);

CREATE UNIQUE INDEX "SystemScanGovernanceRecord_kind_version_key" ON "SystemScanGovernanceRecord"("kind", "version");
CREATE UNIQUE INDEX "SystemScanGovernanceRecord_kind_digest_key" ON "SystemScanGovernanceRecord"("kind", "contentDigest");
CREATE INDEX "SystemScanGovernanceRecord_active_idx" ON "SystemScanGovernanceRecord"("kind", "status", "publishedAt");
CREATE UNIQUE INDEX "ScopeScanRuntimeProfile_scope_id_key" ON "ScopeScanRuntimeProfile"("applicationServiceId", "scopePath", "id");
CREATE INDEX "ScopeScanRuntimeProfile_scope_status_idx" ON "ScopeScanRuntimeProfile"("applicationServiceId", "scopePath", "status");
