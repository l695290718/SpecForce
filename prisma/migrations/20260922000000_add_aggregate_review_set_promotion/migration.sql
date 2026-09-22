-- Additive receipt metadata for atomic promotion of risk/domain review partitions.
-- This migration intentionally does not reset or replay historical data.

ALTER TABLE "KnowledgePromotionReceipt"
  ALTER COLUMN "promotionDecisionId" DROP NOT NULL;

ALTER TABLE "KnowledgePromotionReceipt"
  ADD COLUMN "reviewSetId" TEXT,
  ADD COLUMN "reviewBundleIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "promotionDecisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "sourceObservationIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN coverage JSONB NOT NULL DEFAULT '{}'::jsonb;
