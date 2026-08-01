CREATE TABLE IF NOT EXISTS "ChangeAttestation" (
  "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attestationId" TEXT NOT NULL,
  "issuer" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "signature" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "parentCommit" TEXT NOT NULL,
  "stagedTreeHash" TEXT NOT NULL,
  "fileManifestDigest" TEXT NOT NULL,
  "scopeMappingDigest" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "applicationServiceId" TEXT NOT NULL,
  "scopePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChangeAttestation_pkey" PRIMARY KEY ("dbId")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChangeAttestation_scope_id_key"
  ON "ChangeAttestation"("applicationServiceId", "scopePath", "attestationId");
CREATE INDEX IF NOT EXISTS "ChangeAttestation_scope_expiry_idx"
  ON "ChangeAttestation"("applicationServiceId", "scopePath", "expiresAt");
CREATE INDEX IF NOT EXISTS "ChangeAttestation_repository_tree_idx"
  ON "ChangeAttestation"("repositoryId", "stagedTreeHash");
