CREATE TABLE "ArchitectureUnitProjection" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "projectionManifestId" TEXT NOT NULL,
    "unitIdentity" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentUnitIdentity" TEXT,
    "canonicalName" TEXT NOT NULL,
    "localizedName" JSONB,
    "aliases" JSONB NOT NULL DEFAULT '[]',
    "memberCount" INTEGER NOT NULL,
    "criticality" DOUBLE PRECISION NOT NULL,
    "completeness" DOUBLE PRECISION NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "unclassifiedMemberCount" INTEGER NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchitectureUnitProjection_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "ArchitectureUnitMemberProjection" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "projectionManifestId" TEXT NOT NULL,
    "unitIdentity" TEXT NOT NULL,
    "assertionId" TEXT NOT NULL,
    "assetType" TEXT,
    "semanticIdentity" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchitectureUnitMemberProjection_pkey" PRIMARY KEY ("dbId")
);

CREATE TABLE "ArchitectureUnitMappingProjection" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "projectionManifestId" TEXT NOT NULL,
    "mappingIdentity" TEXT NOT NULL,
    "sourceUnitIdentity" TEXT NOT NULL,
    "targetUnitIdentity" TEXT NOT NULL,
    "sourceLayer" TEXT NOT NULL,
    "targetLayer" TEXT NOT NULL,
    "mappingFamily" TEXT NOT NULL,
    "relationshipCount" INTEGER NOT NULL,
    "evidenceCount" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArchitectureUnitMappingProjection_pkey" PRIMARY KEY ("dbId")
);

CREATE UNIQUE INDEX "ArchitectureUnitProjection_scope_generation_identity_key" ON "ArchitectureUnitProjection"("applicationServiceId", "scopePath", "generationId", "unitIdentity");
CREATE UNIQUE INDEX "ArchitectureUnitMemberProjection_scope_gen_unit_assertion_key" ON "ArchitectureUnitMemberProjection"("applicationServiceId", "scopePath", "generationId", "unitIdentity", "assertionId");
CREATE UNIQUE INDEX "ArchitectureUnitMappingProjection_scope_generation_identity_key" ON "ArchitectureUnitMappingProjection"("applicationServiceId", "scopePath", "generationId", "mappingIdentity");
CREATE INDEX "ArchitectureUnitProjection_scope_layer_kind_name_idx" ON "ArchitectureUnitProjection"("applicationServiceId", "scopePath", "generationId", "layer", "kind", "canonicalName");
CREATE INDEX "ArchitectureUnitProjection_scope_parent_idx" ON "ArchitectureUnitProjection"("applicationServiceId", "scopePath", "generationId", "parentUnitIdentity");
CREATE INDEX "ArchitectureUnitMemberProjection_scope_assertion_idx" ON "ArchitectureUnitMemberProjection"("applicationServiceId", "scopePath", "generationId", "assertionId");
CREATE INDEX "ArchitectureUnitMemberProjection_scope_identity_idx" ON "ArchitectureUnitMemberProjection"("applicationServiceId", "scopePath", "generationId", "semanticIdentity");
CREATE INDEX "ArchitectureUnitMappingProjection_scope_source_idx" ON "ArchitectureUnitMappingProjection"("applicationServiceId", "scopePath", "generationId", "sourceUnitIdentity");
CREATE INDEX "ArchitectureUnitMappingProjection_scope_target_idx" ON "ArchitectureUnitMappingProjection"("applicationServiceId", "scopePath", "generationId", "targetUnitIdentity");
CREATE INDEX "ArchitectureUnitMappingProjection_scope_layers_family_idx" ON "ArchitectureUnitMappingProjection"("applicationServiceId", "scopePath", "generationId", "sourceLayer", "targetLayer", "mappingFamily");
