CREATE TABLE IF NOT EXISTS "ConnectorInstance" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), id TEXT NOT NULL, kind TEXT NOT NULL,
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL, "secretReference" TEXT,
  "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConnectorInstance_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id)
);
CREATE TABLE IF NOT EXISTS "SourceObservation" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), id TEXT NOT NULL, "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL, "externalAssetType" TEXT NOT NULL, "externalId" TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb, "normalizedDigest" TEXT NOT NULL, "sourceVersion" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL, status TEXT NOT NULL, provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
  "idempotencyKey" TEXT NOT NULL, "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceObservation_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id),
  CONSTRAINT "SourceObservation_scope_idempotency_key" UNIQUE ("applicationServiceId", "scopePath", "idempotencyKey"),
  CONSTRAINT "SourceObservation_scope_external_identity_key" UNIQUE ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace", "externalAssetType", "externalId", "sourceVersion")
);
CREATE TABLE IF NOT EXISTS "ExternalIdentityMapping" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), id TEXT NOT NULL, "connectorId" TEXT NOT NULL,
  "sourceNamespace" TEXT NOT NULL, "externalAssetType" TEXT NOT NULL, "externalId" TEXT NOT NULL,
  "assetType" TEXT NOT NULL, "assetId" TEXT, "matchStatus" TEXT NOT NULL, "normalizedDigest" TEXT NOT NULL,
  "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalIdentityMapping_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id),
  CONSTRAINT "ExternalIdentityMapping_scope_external_identity_key" UNIQUE ("applicationServiceId", "scopePath", "connectorId", "sourceNamespace", "externalAssetType", "externalId")
);
CREATE TABLE IF NOT EXISTS "AuthorityPolicy" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), id TEXT NOT NULL, "assetType" TEXT NOT NULL,
  "fieldPath" TEXT NOT NULL, authority TEXT NOT NULL, "promotionMode" TEXT NOT NULL, "policyVersion" TEXT NOT NULL,
  "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthorityPolicy_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id),
  CONSTRAINT "AuthorityPolicy_scope_field_version_key" UNIQUE ("applicationServiceId", "scopePath", "assetType", "fieldPath", "policyVersion")
);
CREATE TABLE IF NOT EXISTS "DesignChangeSession" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), id TEXT NOT NULL, "actorId" TEXT NOT NULL, intent TEXT NOT NULL,
  "affectedFactIds" JSONB NOT NULL DEFAULT '[]'::jsonb, "expectedEvidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignChangeSession_scope_id_key" UNIQUE ("applicationServiceId", "scopePath", id)
);
CREATE TABLE IF NOT EXISTS "FederationOutbox" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), "eventType" TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  "idempotencyKey" TEXT NOT NULL, status TEXT NOT NULL, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3), "attemptCount" INTEGER NOT NULL DEFAULT 0, "lastError" TEXT, "designChangeSessionId" TEXT,
  "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FederationOutbox_scope_idempotency_key" UNIQUE ("applicationServiceId", "scopePath", "idempotencyKey")
);
CREATE TABLE IF NOT EXISTS "ReconciliationSnapshot" (
  "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(), root TEXT NOT NULL, issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL, "factDigests" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "applicationServiceId" TEXT NOT NULL, "scopePath" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReconciliationSnapshot_scope_root_key" UNIQUE ("applicationServiceId", "scopePath", root)
);
CREATE INDEX IF NOT EXISTS "ConnectorInstance_scope_status_idx" ON "ConnectorInstance" ("applicationServiceId", "scopePath", status);
CREATE INDEX IF NOT EXISTS "SourceObservation_scope_connector_observed_idx" ON "SourceObservation" ("applicationServiceId", "scopePath", "connectorId", "observedAt");
CREATE INDEX IF NOT EXISTS "ExternalIdentityMapping_scope_asset_idx" ON "ExternalIdentityMapping" ("applicationServiceId", "scopePath", "assetType", "assetId");
CREATE INDEX IF NOT EXISTS "AuthorityPolicy_scope_field_idx" ON "AuthorityPolicy" ("applicationServiceId", "scopePath", "assetType", "fieldPath");
CREATE INDEX IF NOT EXISTS "DesignChangeSession_scope_status_idx" ON "DesignChangeSession" ("applicationServiceId", "scopePath", status, "openedAt");
CREATE INDEX IF NOT EXISTS "FederationOutbox_scope_pending_idx" ON "FederationOutbox" ("applicationServiceId", "scopePath", status, "availableAt");
CREATE INDEX IF NOT EXISTS "FederationOutbox_scope_session_idx" ON "FederationOutbox" ("applicationServiceId", "scopePath", "designChangeSessionId");
CREATE INDEX IF NOT EXISTS "ReconciliationSnapshot_scope_status_idx" ON "ReconciliationSnapshot" ("applicationServiceId", "scopePath", status, "createdAt");
