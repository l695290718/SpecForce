-- PostgreSQL remains authoritative. These fields only govern rebuildable graph projection delivery.
ALTER TABLE "RelationshipOutbox"
  ADD COLUMN IF NOT EXISTS "leaseOwner" TEXT,
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "terminalAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS diagnostic TEXT,
  ADD COLUMN IF NOT EXISTS "diagnosticRef" TEXT;

CREATE INDEX IF NOT EXISTS "RelationshipOutbox_claim_order_idx"
  ON "RelationshipOutbox" (status, "availableAt", "leaseExpiresAt", "createdAt");

CREATE INDEX IF NOT EXISTS "RelationshipOutbox_scope_lease_recovery_idx"
  ON "RelationshipOutbox" ("enterpriseId", "applicationServiceId", "scopePath", status, "leaseExpiresAt");
