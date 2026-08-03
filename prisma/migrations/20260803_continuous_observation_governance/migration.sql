CREATE TABLE IF NOT EXISTS "FederationObservationCursor" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "acceptedSequence" INTEGER NOT NULL DEFAULT -1,
  "acceptedBatchDigest" TEXT,
  "sourceCursor" TEXT,
  "status" TEXT NOT NULL,
  "lastObservedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FederationObservationBatch" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousBatchDigest" TEXT,
  "batchDigest" TEXT NOT NULL,
  "payloadDigest" TEXT NOT NULL,
  "observationCount" INTEGER NOT NULL,
  "canonicalBytes" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "acceptanceReceipt" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "FederationObservationCursor_scope_connector_namespace_key"
  ON "FederationObservationCursor" ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace");
CREATE INDEX IF NOT EXISTS "FederationObservationCursor_scope_status_idx"
  ON "FederationObservationCursor" ("applicationServiceId", "scopePath", status);
CREATE UNIQUE INDEX IF NOT EXISTS "FederationObservationBatch_scope_sequence_key"
  ON "FederationObservationBatch" ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace", sequence);
CREATE UNIQUE INDEX IF NOT EXISTS "FederationObservationBatch_scope_digest_key"
  ON "FederationObservationBatch" ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace", "batchDigest");
CREATE INDEX IF NOT EXISTS "FederationObservationBatch_scope_connector_accepted_idx"
  ON "FederationObservationBatch" ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace", "acceptedAt");
