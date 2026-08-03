ALTER TABLE "KnowledgeAssertion"
  ADD COLUMN IF NOT EXISTS "riskTier" TEXT NOT NULL DEFAULT 'T1',
  ADD COLUMN IF NOT EXISTS "domainCluster" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedByActorId" TEXT;

CREATE TABLE IF NOT EXISTS "ScannerRelease" (
  "id" TEXT PRIMARY KEY,
  "version" TEXT NOT NULL UNIQUE,
  "contractVersion" TEXT NOT NULL,
  "artifactDigests" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "manifest" JSONB NOT NULL,
  "signature" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ScannerRelease_status_published_idx"
  ON "ScannerRelease"("status", "publishedAt");

CREATE TABLE IF NOT EXISTS "KnowledgeScanSession" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "id" TEXT NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "connectorId" TEXT NOT NULL,
  "designChangeSessionId" TEXT NOT NULL,
  "scannerReleaseId" TEXT NOT NULL,
  "contractVersion" TEXT NOT NULL,
  "nonceDigest" TEXT NOT NULL,
  "snapshotIdentity" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "repositoryPolicy" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "evidencePolicy" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "parserPolicy" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "budgets" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "status" TEXT NOT NULL,
  "acceptedSequence" INTEGER NOT NULL DEFAULT -1,
  "acceptedBatchDigest" TEXT,
  "observationCount" INTEGER NOT NULL DEFAULT 0,
  "finalizationManifest" JSONB,
  "finalizationDigest" TEXT,
  "blockedReason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeScanSession_scannerReleaseId_fkey"
    FOREIGN KEY ("scannerReleaseId") REFERENCES "ScannerRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeScanSession_scope_id_key"
    UNIQUE ("applicationServiceId", "scopePath", "id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeScanSession_id_idx"
  ON "KnowledgeScanSession"("id");
CREATE INDEX IF NOT EXISTS "KnowledgeScanSession_scope_status_expiry_idx"
  ON "KnowledgeScanSession"("applicationServiceId", "scopePath", "status", "expiresAt");

CREATE TABLE IF NOT EXISTS "KnowledgeScanBatch" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" TEXT NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "previousBatchDigest" TEXT,
  "batchDigest" TEXT NOT NULL,
  "payloadDigest" TEXT NOT NULL,
  "observationCount" INTEGER NOT NULL,
  "canonicalBytes" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "acceptanceReceipt" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeScanBatch_scope_session_sequence_key"
    UNIQUE ("applicationServiceId", "scopePath", "sessionId", "sequence"),
  CONSTRAINT "KnowledgeScanBatch_scope_session_digest_key"
    UNIQUE ("applicationServiceId", "scopePath", "sessionId", "batchDigest"),
  CONSTRAINT "KnowledgeScanBatch_session_scope_fkey"
    FOREIGN KEY ("applicationServiceId", "scopePath", "sessionId")
    REFERENCES "KnowledgeScanSession"("applicationServiceId", "scopePath", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "KnowledgeScanBatch_session_id_idx"
  ON "KnowledgeScanBatch"("sessionId");

CREATE TABLE IF NOT EXISTS "KnowledgePromotionReceipt" (
  "dbId" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "id" TEXT NOT NULL,
  "promotionDecisionId" TEXT NOT NULL,
  "sourceDigest" TEXT NOT NULL,
  "assetRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "relationshipRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgePromotionReceipt_scope_id_key"
    UNIQUE ("applicationServiceId", "scopePath", "id"),
  CONSTRAINT "KnowledgePromotionReceipt_scope_decision_digest_key"
    UNIQUE ("applicationServiceId", "scopePath", "promotionDecisionId", "sourceDigest")
);
