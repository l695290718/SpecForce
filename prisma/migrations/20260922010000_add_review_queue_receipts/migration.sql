CREATE TABLE IF NOT EXISTS "KnowledgeReviewQueueReceipt" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "readinessReceiptId" TEXT NOT NULL,
    "scanSessionId" TEXT NOT NULL,
    "projection" TEXT NOT NULL,
    "filterDigest" TEXT NOT NULL,
    "reviewSetDigest" TEXT NOT NULL,
    "expectedBundleIdsDigest" TEXT NOT NULL,
    "pageSize" INTEGER NOT NULL,
    "exposure" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "issuedAt" TIMESTAMP NOT NULL,
    "expiresAt" TIMESTAMP NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeReviewQueueReceipt_pkey" PRIMARY KEY ("dbId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeReviewQueueReceipt_scope_id_key"
  ON "KnowledgeReviewQueueReceipt"("applicationServiceId", "scopePath", "id");
CREATE INDEX IF NOT EXISTS "KnowledgeReviewQueueReceipt_scope_session_actor_idx"
  ON "KnowledgeReviewQueueReceipt"("applicationServiceId", "scopePath", "scanSessionId", "actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "KnowledgeReviewQueueReceipt_expiry_idx"
  ON "KnowledgeReviewQueueReceipt"("expiresAt");
