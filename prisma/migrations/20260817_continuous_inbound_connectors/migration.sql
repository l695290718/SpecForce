ALTER TABLE "ConnectorInstance"
  ADD COLUMN IF NOT EXISTS "definitionId" TEXT,
  ADD COLUMN IF NOT EXISTS "configuration" JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS "ConnectorDefinition" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  "configurationSchema" JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorDefinition_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id)
);
CREATE INDEX IF NOT EXISTS "ConnectorDefinition_scope_kind_status_idx"
  ON "ConnectorDefinition" ("applicationServiceId", "scopePath", kind, status);

ALTER TABLE "FederationObservationCursor"
  ADD COLUMN IF NOT EXISTS "lastCompletedSnapshotId" TEXT,
  ADD COLUMN IF NOT EXISTS "lastCompletedBoundaryDigest" TEXT,
  ADD COLUMN IF NOT EXISTS "lastCompletedMappingVersion" TEXT;

ALTER TABLE "FederationObservationBatch"
  ADD COLUMN IF NOT EXISTS "runId" TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS "fencingToken" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'DELTA',
  ADD COLUMN IF NOT EXISTS "snapshotId" TEXT,
  ADD COLUMN IF NOT EXISTS "mappingVersion" TEXT NOT NULL DEFAULT 'legacy-v1',
  ADD COLUMN IF NOT EXISTS "mappingDigest" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "inventoryBoundaryDigest" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "pageIndex" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isLastPage" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "sourceCursor" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceHighWaterMark" TEXT,
  ADD COLUMN IF NOT EXISTS "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "SourceObservation"
  ADD COLUMN IF NOT EXISTS operation TEXT NOT NULL DEFAULT 'UPSERT',
  ADD COLUMN IF NOT EXISTS "deletionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "runId" TEXT,
  ADD COLUMN IF NOT EXISTS "snapshotId" TEXT,
  ADD COLUMN IF NOT EXISTS "inventoryBoundaryDigest" TEXT;

CREATE TABLE IF NOT EXISTS "ConnectorRun" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  mode TEXT NOT NULL,
  "snapshotId" TEXT,
  "mappingVersion" TEXT NOT NULL,
  "mappingDigest" TEXT NOT NULL,
  "inventoryBoundaryDigest" TEXT NOT NULL,
  status TEXT NOT NULL,
  "sourceCursor" TEXT,
  "sourceHighWaterMark" TEXT,
  "acceptedSequence" INTEGER NOT NULL DEFAULT -1,
  "acceptedBatchDigest" TEXT,
  "fencingToken" INTEGER NOT NULL DEFAULT 0,
  coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorRun_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id)
);
CREATE INDEX IF NOT EXISTS "ConnectorRun_scope_stream_status_idx"
  ON "ConnectorRun" ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace", status);
CREATE INDEX IF NOT EXISTS "ConnectorRun_scope_queued_idx"
  ON "ConnectorRun" ("applicationServiceId", "scopePath", "queuedAt");

CREATE TABLE IF NOT EXISTS "ConnectorLease" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  owner TEXT NOT NULL,
  "fencingToken" INTEGER NOT NULL,
  "heartbeatAt" TIMESTAMP(3) NOT NULL,
  "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorLease_scope_stream_key" UNIQUE ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace")
);
CREATE INDEX IF NOT EXISTS "ConnectorLease_scope_expiry_idx"
  ON "ConnectorLease" ("applicationServiceId", "scopePath", "leaseExpiresAt");

CREATE TABLE IF NOT EXISTS "ConnectorSnapshotIdentity" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "runId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "externalAssetType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "normalizedDigest" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorSnapshotIdentity_scope_run_identity_key" UNIQUE ("applicationServiceId", "scopePath", "runId", "externalAssetType", "externalId")
);
CREATE INDEX IF NOT EXISTS "ConnectorSnapshotIdentity_scope_snapshot_identity_idx"
  ON "ConnectorSnapshotIdentity" ("applicationServiceId", "scopePath", "snapshotId", "externalAssetType", "externalId");

CREATE TABLE IF NOT EXISTS "ConnectorDeadLetter" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  sequence INTEGER,
  "pageIndex" INTEGER,
  "errorCode" TEXT NOT NULL,
  "errorMessage" TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "replayedAt" TIMESTAMP(3),
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorDeadLetter_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id)
);
CREATE INDEX IF NOT EXISTS "ConnectorDeadLetter_scope_status_idx"
  ON "ConnectorDeadLetter" ("applicationServiceId", "scopePath", status, "createdAt");

CREATE TABLE IF NOT EXISTS "ConnectorHealthSnapshot" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  status TEXT NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  "capturedAt" TIMESTAMP(3) NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorHealthSnapshot_scope_stream_key" UNIQUE ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace")
);
CREATE INDEX IF NOT EXISTS "ConnectorHealthSnapshot_scope_status_idx"
  ON "ConnectorHealthSnapshot" ("applicationServiceId", "scopePath", status, "capturedAt");
