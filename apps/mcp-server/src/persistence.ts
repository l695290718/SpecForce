import { Prisma, PrismaClient } from "@prisma/client";
import { assertWritableApplicationService, assetLabel, authorizePrincipalScope, defaultHuaweiActor, hasScopeAccess, huaweiArchitectureScopes, localizeAsset, normalizeAssetType, relationshipOntology, scopeById, seedHuaweiActor, validateAssetLocalization } from "@specforge/core";
import type { ArchitectureScopeRef, Asset, AssetLocale, AssetType, ContextPack, Proposal, RelationshipCode, ScopedActor, ScopedPrincipal } from "@specforge/core";
import { createHash } from "node:crypto";
import { createTrustedRelationshipExecutionContext, RelationshipCommandService, type DeleteLegacyRelationshipCommand, type UpsertRelationshipCommand } from "./relationships/command-service";
import { PrismaRelationshipRepository, type RelationshipScope } from "./relationships/repository";
import { currentRequestPrincipal } from "./auth";

const globalForPrisma = globalThis as unknown as { specforgeMcpPrisma?: PrismaClient };
const legacyContextPackFallbackSymbol = Symbol("legacyContextPackFallback");
let persistenceSchemaPromise: Promise<void> | undefined;

export const prisma = globalForPrisma.specforgeMcpPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.specforgeMcpPrisma = prisma;
}

export interface UpsertDesignAssetInput {
  assetType: AssetType;
  asset: Asset;
}

export interface UpsertProposalInput {
  proposal: Proposal;
}

export interface UpsertContextPackInput {
  contextPack: ContextPack;
}

export interface DeletePersistedDesignDataInput {
  architectureScope: ArchitectureScopeRef;
  assetIds?: string[];
  proposalIds?: string[];
  contextPackIds?: string[];
}

export interface AssetLinkInput {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description?: string;
  architectureScope?: ArchitectureScopeRef;
}

export interface PersistedAssetLink extends AssetLinkInput {
  id: string;
  createdAt: string;
}


export function resolveWritableScope(actor: ScopedActor, scope: ArchitectureScopeRef | undefined): ArchitectureScopeRef {
  if (!scope) throw new Error("Architecture scope is required.");
  const applicationService = scopeById(scope.applicationServiceId);
  if (!applicationService || applicationService.scopePath !== scope.scopePath) throw new Error("Scope write is not authorized.");
  if (isScopedPrincipal(actor)) return authorizePrincipalScope(actor, scope, "write");
  return assertWritableApplicationService(actor, applicationService);
}

export function writableActor(): ScopedActor {
  const principal = currentRequestPrincipal();
  if (principal) return principal;
  return process.env.SPECFORGE_MCP_SEED === "1" ? seedHuaweiActor : defaultHuaweiActor;
}

export function isSeedMode(): boolean {
  return process.env.SPECFORGE_MCP_SEED === "1";
}

export function readableScope(applicationServiceId: string): ArchitectureScopeRef {
  const scope = scopeById(applicationServiceId);
  const actor = currentRequestPrincipal() ?? (isSeedMode() ? seedHuaweiActor : defaultHuaweiActor);
  if (!scope || scope.level !== "applicationService") throw new Error("Scope read is not authorized.");
  if (isScopedPrincipal(actor)) return authorizePrincipalScope(actor, { applicationServiceId: scope.id, scopePath: scope.scopePath }, "read");
  if (!hasScopeAccess(actor, scope, "read")) throw new Error("Scope read is not authorized.");
  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

function isScopedPrincipal(actor: ScopedActor): actor is ScopedPrincipal {
  return "subject" in actor && "tenantId" in actor && "permissions" in actor && "decisionRef" in actor;
}

export async function ensureArchitectureScopes() {
  for (const scope of huaweiArchitectureScopes) {
    await prisma.architectureScope.upsert({
      where: { id: scope.id },
      create: scope,
      update: {
        code: scope.code,
        name: scope.name,
        description: scope.description,
        owner: scope.owner,
        level: scope.level,
        parentId: scope.parentId,
        scopePath: scope.scopePath,
        purpose: scope.purpose ?? "product"
      }
    });
  }

  for (const actor of [defaultHuaweiActor, seedHuaweiActor]) for (const grant of actor.grants) {
    await prisma.actorScopeGrant.upsert({
      where: { actorType_actorId_scopeId_action: { actorType: actor.actorType, actorId: actor.actorId, scopeId: grant.scopeId, action: grant.action } },
      create: { actorType: actor.actorType, actorId: actor.actorId, scopeId: grant.scopeId, action: grant.action },
      update: {}
    });
  }
}

export async function listPersistedArchitectureScopes() {
  await ensureMcpPersistenceSchema();
  return prisma.architectureScope.findMany({ orderBy: { scopePath: "asc" } });
}

export async function ensureMcpPersistenceSchema() {
  persistenceSchemaPromise ??= initializeMcpPersistenceSchema().catch((error) => {
    persistenceSchemaPromise = undefined;
    throw error;
  });
  return persistenceSchemaPromise;
}

async function initializeMcpPersistenceSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ArchitectureScope" (
      id TEXT PRIMARY KEY NOT NULL, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      description TEXT NOT NULL, owner TEXT NOT NULL, level TEXT NOT NULL,
      "parentId" TEXT, "scopePath" TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL DEFAULT 'product',
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "ActorScopeGrant" (
    id TEXT PRIMARY KEY NOT NULL, "actorType" TEXT NOT NULL, "actorId" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL, action TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE("actorType", "actorId", "scopeId", action)
  )`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "DesignAsset" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT NOT NULL,
      "domainId" TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      payload TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DesignAsset_type_idx" ON "DesignAsset"(type)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "DesignAsset_domainId_idx" ON "DesignAsset"("domainId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Proposal" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      "domainId" TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      payload TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ContextPack" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      "proposalId" TEXT NOT NULL,
      "targetAgent" TEXT NOT NULL,
      summary TEXT NOT NULL,
      "includedAssets" TEXT NOT NULL,
      constraints TEXT NOT NULL,
      instructions TEXT NOT NULL,
      "generatedMarkdown" TEXT NOT NULL,
      payload TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ContextPack_proposalId_idx" ON "ContextPack"("proposalId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GovernanceCheckSnapshot" (
      id TEXT PRIMARY KEY NOT NULL,
      "assetType" TEXT NOT NULL,
      "assetId" TEXT NOT NULL,
      results TEXT NOT NULL,
      "applicationServiceId" TEXT,
      "scopePath" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ArchitectureScope" ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'product'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "GovernanceCheckSnapshot" ADD COLUMN IF NOT EXISTS "applicationServiceId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "GovernanceCheckSnapshot" ADD COLUMN IF NOT EXISTS "scopePath" TEXT`);
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GovernanceCheckSnapshot_scope_pair_check') THEN
        ALTER TABLE "GovernanceCheckSnapshot"
          ADD CONSTRAINT "GovernanceCheckSnapshot_scope_pair_check"
          CHECK (("applicationServiceId" IS NULL) = ("scopePath" IS NULL));
      END IF;
    END $$;
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GovernanceCheckSnapshot_assetType_assetId_idx" ON "GovernanceCheckSnapshot"("assetType", "assetId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "GovernanceCheckSnapshot_scope_asset_idx" ON "GovernanceCheckSnapshot"("applicationServiceId", "scopePath", "assetType", "assetId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AssetLink" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "targetType" TEXT NOT NULL,
      "targetId" TEXT NOT NULL,
      "relationType" TEXT NOT NULL,
      description TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssetLink_source_idx" ON "AssetLink"("sourceType", "sourceId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssetLink_target_idx" ON "AssetLink"("targetType", "targetId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "AssetLink_relationType_idx" ON "AssetLink"("relationType")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeAssertion" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "semanticIdentity" TEXT NOT NULL,
      "factType" TEXT NOT NULL,
      layer TEXT NOT NULL,
      aspect TEXT NOT NULL,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      "matchingEvidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "counterEvidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "unresolvedQuestions" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "sourceObservationIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "extractorId" TEXT NOT NULL,
      "riskTier" TEXT NOT NULL DEFAULT 'T1',
      "domainCluster" TEXT,
      "generatedByActorId" TEXT,
      revision INTEGER NOT NULL,
      "changeSetId" TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeAssertion" ADD COLUMN IF NOT EXISTS "riskTier" TEXT NOT NULL DEFAULT 'T1'`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeAssertion" ADD COLUMN IF NOT EXISTS "domainCluster" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeAssertion" ADD COLUMN IF NOT EXISTS "generatedByActorId" TEXT`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ArchitectureFactBatch" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "idempotencyKey" TEXT NOT NULL,
      "designChangeSessionId" TEXT NOT NULL,
      status TEXT NOT NULL,
      provenance JSONB NOT NULL DEFAULT '{}'::jsonb,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "unitRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "membershipRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "mappingRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "canonicalBytes" INTEGER NOT NULL,
      "contentDigest" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "idempotencyKey")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ArchitectureUnitRevision" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "unitIdentity" TEXT NOT NULL,
      revision INTEGER NOT NULL,
      layer TEXT NOT NULL,
      kind TEXT NOT NULL,
      "parentUnitIdentity" TEXT,
      "canonicalName" TEXT NOT NULL,
      "canonicalDescription" TEXT NOT NULL,
      "localizedContent" JSONB NOT NULL DEFAULT '{}'::jsonb,
      aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
      criticality DOUBLE PRECISION NOT NULL,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "changeSetId" TEXT,
      "contentDigest" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "unitIdentity", revision)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ArchitectureUnitMembershipRevision" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "membershipIdentity" TEXT NOT NULL,
      revision INTEGER NOT NULL,
      "unitIdentity" TEXT NOT NULL,
      "assertionId" TEXT,
      "assetType" TEXT,
      "assetId" TEXT,
      "semanticIdentity" TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "changeSetId" TEXT,
      "contentDigest" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "membershipIdentity", revision)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ArchitectureUnitMappingRevision" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "mappingIdentity" TEXT NOT NULL,
      revision INTEGER NOT NULL,
      "sourceUnitIdentity" TEXT NOT NULL,
      "targetUnitIdentity" TEXT NOT NULL,
      "mappingFamily" TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      "relationshipIdentities" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL,
      "batchId" TEXT NOT NULL,
      "changeSetId" TEXT,
      "contentDigest" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "mappingIdentity", revision)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "IdentityCandidate" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "semanticIdentity" TEXT NOT NULL,
      "sourceObservationId" TEXT NOT NULL,
      "targetAssetType" TEXT NOT NULL,
      "targetAssetId" TEXT,
      confidence DOUBLE PRECISION NOT NULL,
      "matchingEvidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "counterEvidence" JSONB NOT NULL DEFAULT '[]'::jsonb,
      decision TEXT NOT NULL,
      "reviewedBy" TEXT,
      "reviewedAt" TIMESTAMP,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeChangeSet" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "streamId" TEXT NOT NULL,
      sequence BIGINT NOT NULL,
      status TEXT NOT NULL,
      "assetRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "relationshipRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      digest TEXT NOT NULL,
      "promotionDecisionId" TEXT,
      "committedAt" TIMESTAMP,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "streamId", sequence)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "WorkingStream" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      "headChangeSetId" TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeBaseline" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "streamId" TEXT NOT NULL,
      "changeSetId" TEXT NOT NULL,
      status TEXT NOT NULL,
      manifest JSONB NOT NULL DEFAULT '{}'::jsonb,
      "publishedAt" TIMESTAMP,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectionManifest" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "baselineId" TEXT NOT NULL,
      "projectionType" TEXT NOT NULL,
      "projectionSchemaVersion" TEXT NOT NULL,
      "sourceRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "relationshipVersion" TEXT NOT NULL,
      query JSONB NOT NULL DEFAULT '{}'::jsonb,
      digest TEXT NOT NULL,
      "generatedAt" TIMESTAMP NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "ProjectionManifest"
    ADD COLUMN IF NOT EXISTS "profileId" TEXT,
    ADD COLUMN IF NOT EXISTS "profileVersion" TEXT,
    ADD COLUMN IF NOT EXISTS "generationId" TEXT,
    ADD COLUMN IF NOT EXISTS "inputDigest" TEXT,
    ADD COLUMN IF NOT EXISTS "contentDigest" TEXT,
    ADD COLUMN IF NOT EXISTS "nodeCount" INTEGER,
    ADD COLUMN IF NOT EXISTS "edgeCount" INTEGER,
    ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectionBuildJob" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "buildKey" TEXT NOT NULL,
      "generationId" TEXT NOT NULL,
      "baselineId" TEXT NOT NULL,
      "profileId" TEXT NOT NULL,
      "profileVersion" TEXT NOT NULL,
      "projectionSchemaVersion" TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER NOT NULL DEFAULT 1,
      "leaseOwner" TEXT,
      "leaseExpiresAt" TIMESTAMP,
      checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
      "nodeCount" INTEGER NOT NULL DEFAULT 0,
      "edgeCount" INTEGER NOT NULL DEFAULT 0,
      "errorCode" TEXT,
      "diagnosticRef" TEXT,
      "availableAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "completedAt" TIMESTAMP,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "buildKey", attempt)
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeProjectionNode" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      "generationId" TEXT NOT NULL,
      "baselineId" TEXT NOT NULL,
      "assertionId" TEXT NOT NULL,
      "semanticIdentity" TEXT NOT NULL,
      layer TEXT NOT NULL,
      "sortKey" TEXT NOT NULL,
      "acceptedAssetType" TEXT,
      "acceptedAssetId" TEXT,
      "contentDigest" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", "generationId", "assertionId")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeProjectionEdge" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      "generationId" TEXT NOT NULL,
      "baselineId" TEXT NOT NULL,
      "relationshipIdentity" TEXT NOT NULL,
      "relationshipAssertionId" TEXT,
      "relationshipEventId" TEXT,
      "sourceAssertionId" TEXT NOT NULL,
      "targetAssertionId" TEXT NOT NULL,
      "sourceSemanticIdentity" TEXT NOT NULL,
      "targetSemanticIdentity" TEXT NOT NULL,
      "relationCode" TEXT NOT NULL,
      confidence DOUBLE PRECISION NOT NULL,
      "relationshipVersion" TEXT NOT NULL,
      "contentDigest" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", "generationId", "relationshipIdentity")
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TraceContinuation" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      "browseSessionId" TEXT NOT NULL,
      "tenantId" TEXT NOT NULL,
      subject TEXT NOT NULL,
      "baselineId" TEXT NOT NULL,
      "projectionManifestId" TEXT NOT NULL,
      "queryFingerprint" TEXT NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 0,
      "stateDigest" TEXT NOT NULL,
      frontier JSONB NOT NULL DEFAULT '[]'::jsonb,
      "visitedIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "expiresAt" TIMESTAMP NOT NULL,
      "consumedAt" TIMESTAMP,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", "browseSessionId")
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ProjectionBuildJob_one_active_build_key" ON "ProjectionBuildJob"("applicationServiceId", "scopePath", "buildKey") WHERE status IN ('QUEUED', 'BUILDING')`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectionBuildJob_claim_idx" ON "ProjectionBuildJob"(status, "availableAt", "leaseExpiresAt", "createdAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ProjectionBuildJob_scope_baseline_profile_idx" ON "ProjectionBuildJob"("applicationServiceId", "scopePath", "baselineId", "profileId", "profileVersion")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeProjectionNode_search_idx" ON "KnowledgeProjectionNode"("applicationServiceId", "scopePath", "generationId", layer, "sortKey", "assertionId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeProjectionNode_identity_idx" ON "KnowledgeProjectionNode"("applicationServiceId", "scopePath", "generationId", "semanticIdentity")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeProjectionEdge_source_idx" ON "KnowledgeProjectionEdge"("applicationServiceId", "scopePath", "generationId", "sourceAssertionId", "relationCode", "targetAssertionId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeProjectionEdge_target_idx" ON "KnowledgeProjectionEdge"("applicationServiceId", "scopePath", "generationId", "targetAssertionId", "relationCode", "sourceAssertionId")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TraceContinuation_expiry_idx" ON "TraceContinuation"("expiresAt")`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "TraceContinuation_scope_subject_expiry_idx" ON "TraceContinuation"("applicationServiceId", "scopePath", subject, "expiresAt")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeReviewBundle" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "designChangeSessionId" TEXT NOT NULL,
      status TEXT NOT NULL,
      "riskTier" TEXT NOT NULL,
      "assertionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "identityCandidateIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
      "blockingIssues" JSONB NOT NULL DEFAULT '[]'::jsonb,
      digest TEXT NOT NULL,
      "createdBy" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeChangeSet" ADD COLUMN IF NOT EXISTS "promotionDecisionId" TEXT`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeChangeSet" ADD COLUMN IF NOT EXISTS "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeReviewBundle" ADD COLUMN IF NOT EXISTS "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeReviewBundle_scope_session_status_idx" ON "KnowledgeReviewBundle"("applicationServiceId", "scopePath", "designChangeSessionId", status)`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgePromotionDecision" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "reviewBundleId" TEXT NOT NULL,
      "designChangeSessionId" TEXT NOT NULL,
      decision TEXT NOT NULL,
      "approvedAssertionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "approvedIdentityCandidateIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "approvedArchitectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "evidenceRefs" JSONB NOT NULL DEFAULT '[]'::jsonb,
      reason TEXT NOT NULL,
      "actorId" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id)
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgePromotionDecision_scope_bundle_decision_idx" ON "KnowledgePromotionDecision"("applicationServiceId", "scopePath", "reviewBundleId", decision)`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgePromotionDecision" ADD COLUMN IF NOT EXISTS "approvedArchitectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeScanReport" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "designChangeSessionId" TEXT NOT NULL,
      "scannerId" TEXT NOT NULL,
      "scannerVersion" TEXT NOT NULL,
      "rootLabel" TEXT NOT NULL,
      manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
      "observationIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
      "manifestDigest" TEXT NOT NULL,
      "reportDigest" TEXT NOT NULL,
      status TEXT NOT NULL,
      "generatedAt" TIMESTAMP NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE("applicationServiceId", "scopePath", id),
      UNIQUE("applicationServiceId", "scopePath", "reportDigest")
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgeScanReport" ADD COLUMN IF NOT EXISTS "observationIds" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeScanReport_scope_session_status_idx" ON "KnowledgeScanReport"("applicationServiceId", "scopePath", "designChangeSessionId", status)`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ScannerRelease" (
      id TEXT PRIMARY KEY NOT NULL,
      version TEXT NOT NULL UNIQUE,
      "contractVersion" TEXT NOT NULL,
      "artifactDigests" JSONB NOT NULL DEFAULT '{}'::jsonb,
      manifest JSONB NOT NULL,
      signature TEXT NOT NULL,
      "keyId" TEXT NOT NULL,
      status TEXT NOT NULL,
      "publishedAt" TIMESTAMP NOT NULL,
      "revokedAt" TIMESTAMP,
      "revocationReason" TEXT,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "ScannerRelease_status_published_idx" ON "ScannerRelease"(status, "publishedAt")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeScanSession" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
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
      budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      "acceptedSequence" INTEGER NOT NULL DEFAULT -1,
      "acceptedBatchDigest" TEXT,
      "observationCount" INTEGER NOT NULL DEFAULT 0,
      "finalizationManifest" JSONB,
      "finalizationDigest" TEXT,
      "blockedReason" TEXT,
      "expiresAt" TIMESTAMP NOT NULL,
      "finalizedAt" TIMESTAMP,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KnowledgeScanSession_scope_id_key" UNIQUE("applicationServiceId", "scopePath", id),
      CONSTRAINT "KnowledgeScanSession_scannerReleaseId_fkey" FOREIGN KEY("scannerReleaseId") REFERENCES "ScannerRelease"(id) ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeScanSession_id_idx" ON "KnowledgeScanSession"(id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeScanSession_scope_status_expiry_idx" ON "KnowledgeScanSession"("applicationServiceId", "scopePath", status, "expiresAt")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgeScanBatch" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      "sessionId" TEXT NOT NULL,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      "previousBatchDigest" TEXT,
      "batchDigest" TEXT NOT NULL,
      "payloadDigest" TEXT NOT NULL,
      "observationCount" INTEGER NOT NULL,
      "canonicalBytes" INTEGER NOT NULL,
      status TEXT NOT NULL,
      "acceptanceReceipt" JSONB NOT NULL DEFAULT '{}'::jsonb,
      "acceptedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KnowledgeScanBatch_scope_session_sequence_key" UNIQUE("applicationServiceId", "scopePath", "sessionId", sequence),
      CONSTRAINT "KnowledgeScanBatch_scope_session_digest_key" UNIQUE("applicationServiceId", "scopePath", "sessionId", "batchDigest"),
      CONSTRAINT "KnowledgeScanBatch_session_scope_fkey" FOREIGN KEY("applicationServiceId", "scopePath", "sessionId") REFERENCES "KnowledgeScanSession"("applicationServiceId", "scopePath", id) ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "KnowledgeScanBatch_session_id_idx" ON "KnowledgeScanBatch"("sessionId")`);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "KnowledgePromotionReceipt" (
      "dbId" UUID PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
      id TEXT NOT NULL,
      "promotionDecisionId" TEXT NOT NULL,
      "sourceDigest" TEXT NOT NULL,
      "assetRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "relationshipRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "architectureFactBatchId" TEXT,
      "applicationServiceId" TEXT NOT NULL,
      "scopePath" TEXT NOT NULL,
      "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "KnowledgePromotionReceipt_scope_id_key" UNIQUE("applicationServiceId", "scopePath", id),
      CONSTRAINT "KnowledgePromotionReceipt_scope_decision_digest_key" UNIQUE("applicationServiceId", "scopePath", "promotionDecisionId", "sourceDigest")
    )
  `);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgePromotionReceipt" ADD COLUMN IF NOT EXISTS "architectureFactRevisionIds" JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await prisma.$executeRawUnsafe(`ALTER TABLE "KnowledgePromotionReceipt" ADD COLUMN IF NOT EXISTS "architectureFactBatchId" TEXT`);
  await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgePromotionReceipt_scope_decision_key" ON "KnowledgePromotionReceipt"("applicationServiceId", "scopePath", "promotionDecisionId")`);
  await upgradeLegacyPersistedIdentitySchema();
  for (const table of ["DesignAsset", "Proposal", "ContextPack", "AssetLink"]) {
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_applicationServiceId_idx" ON "${table}"("applicationServiceId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "${table}_scopePath_idx" ON "${table}"("scopePath")`);
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE "ContextPack" ADD COLUMN IF NOT EXISTS "payload" TEXT`);
  await ensureArchitectureScopes();
}

export async function upgradeLegacyPersistedIdentitySchema() {
  const fallbackScope = scopeById("com.huawei.celon.desiner");
  if (!fallbackScope) throw new Error("Default application-service scope is unavailable.");

  for (const table of ["DesignAsset", "Proposal", "ContextPack", "AssetLink"]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "dbId" UUID`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "applicationServiceId" TEXT`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "scopePath" TEXT`);
    await prisma.$executeRawUnsafe(
      `UPDATE "${table}"
       SET "dbId" = COALESCE("dbId", gen_random_uuid()),
           "applicationServiceId" = COALESCE(NULLIF("applicationServiceId", ''), $1),
           "scopePath" = COALESCE(NULLIF("scopePath", ''), $2)
       WHERE "dbId" IS NULL OR "applicationServiceId" IS NULL OR "applicationServiceId" = '' OR "scopePath" IS NULL OR "scopePath" = ''`,
      fallbackScope.id,
      fallbackScope.scopePath
    );
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "dbId" SET DEFAULT gen_random_uuid()`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "dbId" SET NOT NULL`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "applicationServiceId" SET NOT NULL`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ALTER COLUMN "scopePath" SET NOT NULL`);
    await prisma.$executeRawUnsafe(scopedIdentityConstraintUpgradeSql(table));
  }
}

function scopedIdentityConstraintUpgradeSql(table: string): string {
  const compositeConstraint = `${table}_applicationServiceId_scopePath_id_key`;
  return `DO $$
  DECLARE
    legacy_constraint RECORD;
    legacy_index RECORD;
  BEGIN
    FOR legacy_constraint IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = '"${table}"'::regclass
        AND ((contype = 'p' AND pg_get_constraintdef(oid) ~ '^PRIMARY KEY \\(\"?id\"?\\)$')
          OR (contype = 'u' AND pg_get_constraintdef(oid) ~ '^UNIQUE \\(\"?id\"?\\)$'))
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', '${table}', legacy_constraint.conname);
    END LOOP;

    FOR legacy_index IN
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = '${table}'
        AND indexdef ~ '^CREATE UNIQUE INDEX .* \\(\"?id\"?\\)$'
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS %I.%I', current_schema(), legacy_index.indexname);
    END LOOP;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = '"${table}"'::regclass AND contype = 'p'
    ) THEN
      ALTER TABLE "${table}" ADD CONSTRAINT "${table}_pkey" PRIMARY KEY ("dbId");
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = '"${table}"'::regclass AND conname = '${compositeConstraint}'
    ) AND to_regclass(format('%I.%I', current_schema(), '${compositeConstraint}')) IS NULL THEN
      ALTER TABLE "${table}" ADD CONSTRAINT "${compositeConstraint}"
        UNIQUE ("applicationServiceId", "scopePath", id);
    END IF;
  END $$`;
}

export async function upsertDesignAsset(input: UpsertDesignAssetInput) {
  const asset = input.asset as unknown as Record<string, unknown>;
  const scope = resolveWritableScope(writableActor(), asset.architectureScope as ArchitectureScopeRef | undefined);
  const localizedAsset = { ...asset, architectureScope: scope } as Asset;
  validateAssetLocalization(input.assetType, localizedAsset);
  const canonicalAsset = localizeAsset(input.assetType, localizedAsset, "en") as unknown as Record<string, unknown>;
  assertString(canonicalAsset.id, "asset.id");
  assertString(canonicalAsset.name ?? canonicalAsset.title, "asset.name");
  await ensureMcpPersistenceSchema();

  await prisma.$transaction(async (transaction) => {
    await transaction.designAsset.upsert({
      where: {
        applicationServiceId_scopePath_id: {
          applicationServiceId: scope.applicationServiceId,
          scopePath: scope.scopePath,
          id: String(canonicalAsset.id)
        }
      },
      create: {
        id: String(canonicalAsset.id),
        type: input.assetType,
        name: String(canonicalAsset.name ?? canonicalAsset.title ?? canonicalAsset.id),
        code: optionalString(canonicalAsset.code),
        description: optionalString(canonicalAsset.description) ?? "",
        domainId: optionalString(canonicalAsset.domainId),
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        payload: JSON.stringify(canonicalAsset),
        createdAt: optionalDate(canonicalAsset.createdAt),
        updatedAt: optionalDate(canonicalAsset.updatedAt)
      },
      update: {
        type: input.assetType,
        name: String(canonicalAsset.name ?? canonicalAsset.title ?? canonicalAsset.id),
        code: optionalString(canonicalAsset.code),
        description: optionalString(canonicalAsset.description) ?? "",
        domainId: optionalString(canonicalAsset.domainId),
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        payload: JSON.stringify(canonicalAsset),
        updatedAt: optionalDate(canonicalAsset.updatedAt)
      }
    });
    const graphIdempotencyKey = designAssetGraphIdempotencyKey(input.assetType, canonicalAsset);
    await relationshipService(transaction, configuredRelationshipScope(scope)).upsertAssetGraph({
      channel: "mcp",
      correlationId: `design-asset:${input.assetType}:${canonicalAsset.id}:${canonicalAsset.updatedAt ?? ""}`,
      idempotencyKey: graphIdempotencyKey,
      assetType: input.assetType,
      asset: localizedAsset
    });
  });

  return { id: canonicalAsset.id, type: input.assetType, status: "upserted" };
}

export async function upsertProposal(input: UpsertProposalInput) {
  const proposal = input.proposal as Proposal;
  const scope = resolveWritableScope(writableActor(), proposal.architectureScope);
  const localizedProposal = { ...proposal, architectureScope: scope } as Proposal;
  validateAssetLocalization("proposal", localizedProposal);
  const canonicalProposal = localizeAsset("proposal", localizedProposal, "en");
  assertString(proposal.id, "proposal.id");
  assertString(canonicalProposal.title, "proposal.title");
  await ensureMcpPersistenceSchema();

  await prisma.proposal.upsert({
    where: {
      applicationServiceId_scopePath_id: {
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        id: canonicalProposal.id
      }
    },
    create: {
      id: canonicalProposal.id,
      title: canonicalProposal.title,
      description: canonicalProposal.description,
      status: canonicalProposal.status,
      domainId: canonicalProposal.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonicalProposal),
      createdAt: new Date(canonicalProposal.createdAt),
      updatedAt: new Date(canonicalProposal.updatedAt)
    },
    update: {
      title: canonicalProposal.title,
      description: canonicalProposal.description,
      status: canonicalProposal.status,
      domainId: canonicalProposal.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonicalProposal),
      updatedAt: new Date(canonicalProposal.updatedAt)
    }
  });

  return { id: canonicalProposal.id, status: "upserted" };
}

export async function upsertContextPack(input: UpsertContextPackInput) {
  const pack = input.contextPack;
  validateAssetLocalization("contextPack", pack);
  const scope = resolveWritableScope(writableActor(), pack.architectureScope);
  const localizedPack = { ...pack, architectureScope: scope };
  const canonicalPack = localizeAsset("contextPack", localizedPack, "en") as ContextPack;
  assertString(pack.id, "contextPack.id");
  assertString(pack.proposalId, "contextPack.proposalId");
  await ensureMcpPersistenceSchema();

  await prisma.contextPack.upsert({
    where: {
      applicationServiceId_scopePath_id: {
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        id: canonicalPack.id
      }
    },
    create: {
      id: canonicalPack.id,
      name: canonicalPack.name,
      proposalId: canonicalPack.proposalId,
      targetAgent: canonicalPack.targetAgent,
      summary: canonicalPack.summary,
      includedAssets: JSON.stringify(canonicalPack.includedAssets),
      constraints: JSON.stringify(canonicalPack.constraints),
      instructions: JSON.stringify(canonicalPack.instructions),
      generatedMarkdown: canonicalPack.generatedMarkdown,
      payload: JSON.stringify(canonicalPack),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      createdAt: new Date(canonicalPack.createdAt)
    },
    update: {
      proposalId: canonicalPack.proposalId,
      name: canonicalPack.name,
      targetAgent: canonicalPack.targetAgent,
      summary: canonicalPack.summary,
      includedAssets: JSON.stringify(canonicalPack.includedAssets),
      constraints: JSON.stringify(canonicalPack.constraints),
      instructions: JSON.stringify(canonicalPack.instructions),
      generatedMarkdown: canonicalPack.generatedMarkdown,
      payload: JSON.stringify(canonicalPack),
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath
    }
  });

  return { id: canonicalPack.id, proposalId: canonicalPack.proposalId, status: "upserted" };
}

export async function deletePersistedDesignData(input: DeletePersistedDesignDataInput) {
  if (!isSeedMode()) throw new Error("Seed cleanup is not enabled.");
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const assetIds = input.assetIds ?? [];
  const proposalIds = input.proposalIds ?? [];
  const contextPackIds = input.contextPackIds ?? [];

  const scopedWhere = {
    applicationServiceId: scope.applicationServiceId,
    scopePath: scope.scopePath
  };
  const ids = [...assetIds, ...proposalIds, ...contextPackIds];
  await prisma.$transaction(async (transaction) => {
    await lockRelationshipScope(transaction, configuredRelationshipScope(scope));
    const links = ids.length
      ? await transaction.assetLink.findMany({
        where: {
          ...scopedWhere,
          OR: [{ sourceId: { in: ids } }, { targetId: { in: ids } }]
        }
      })
      : [];
    for (const link of links) {
      const relationshipScope = await resolveLegacyRelationshipScope(transaction, scope, `legacy-asset-link:${link.id}`);
      await synchronizeLegacyAssetLinkDelete(transaction, link, relationshipScope);
    }
    await transaction.contextPack.deleteMany({ where: { ...scopedWhere, id: { in: contextPackIds } } });
    await transaction.proposal.deleteMany({ where: { ...scopedWhere, id: { in: proposalIds } } });
    await transaction.designAsset.deleteMany({ where: { ...scopedWhere, id: { in: assetIds } } });
    if (!ids.length) return;
    const sourcePlaceholders = ids.map((_, index) => `$${index + 3}`).join(",");
    const targetPlaceholders = ids.map((_, index) => `$${ids.length + index + 3}`).join(",");
    await transaction.$executeRawUnsafe(
      `DELETE FROM "AssetLink"
       WHERE "applicationServiceId" = $1
         AND "scopePath" = $2
         AND ("sourceId" IN (${sourcePlaceholders}) OR "targetId" IN (${targetPlaceholders}))`,
      scope.applicationServiceId,
      scope.scopePath,
      ...ids,
      ...ids
    );
  });

  return {
    deletedAssetIds: assetIds,
    deletedProposalIds: proposalIds,
    deletedContextPackIds: contextPackIds,
    applicationServiceId: scope.applicationServiceId,
    status: "deleted"
  };
}

export async function upsertAssetLink(input: AssetLinkInput): Promise<PersistedAssetLink> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  const sourceType = normalizeAssetType(input.sourceType);
  const targetType = normalizeAssetType(input.targetType);
  assertString(input.sourceId, "sourceId");
  assertString(input.targetId, "targetId");
  assertString(input.relationType, "relationType");
  const designFactRelation = isDesignFactRelation(input.relationType);
  const relationshipCode = designFactRelation ? undefined : normalizeLegacyRelationshipCode(input.relationType);
  const id = assetLinkId({ ...input, sourceType, targetType });
  await ensureMcpPersistenceSchema();
  await prisma.$transaction(async (transaction) => {
    const relationshipScope = relationshipCode
      ? await resolveLegacyRelationshipScope(transaction, scope, `legacy-asset-link:${id}`)
      : undefined;
    const link = await transaction.assetLink.upsert({
      where: {
        applicationServiceId_scopePath_id: {
          applicationServiceId: scope.applicationServiceId,
          scopePath: scope.scopePath,
          id
        }
      },
      create: {
        id,
        sourceType,
        sourceId: input.sourceId,
        targetType,
        targetId: input.targetId,
        relationType: input.relationType,
        description: input.description,
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath
      },
      update: {
        sourceType,
        sourceId: input.sourceId,
        targetType,
        targetId: input.targetId,
        relationType: input.relationType,
        description: input.description
      }
    });
    if (relationshipCode && relationshipScope) await synchronizeLegacyAssetLinkUpsert(transaction, link, relationshipCode, relationshipScope);
  });

  return {
    id,
    sourceType,
    sourceId: input.sourceId,
    targetType,
    targetId: input.targetId,
    relationType: input.relationType,
    description: input.description,
    architectureScope: scope,
    createdAt: new Date().toISOString()
  };
}

function isDesignFactRelation(relationType: string): boolean {
  return new Set(["DECIDES", "IMPLEMENTS_DECISION", "IMPLEMENTS_CONTEXT_FOR", "VALIDATES"])
    .has(relationType.trim().toUpperCase());
}

export async function listPersistedAssetLinks(applicationServiceId: string): Promise<PersistedAssetLink[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.assetLink.findMany({
    where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => ({
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    targetType: row.targetType,
    targetId: row.targetId,
    relationType: row.relationType,
    description: row.description ?? undefined,
    architectureScope: scope,
    createdAt: row.createdAt.toISOString()
  }));
}

export async function listPersistedAssets(applicationServiceId: string, assetType?: AssetType): Promise<Array<{ type: AssetType; asset: Asset }>> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.designAsset.findMany({
    where: { ...(assetType ? { type: assetType } : {}), applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
    orderBy: { createdAt: "asc" }
  });
  return rows.map((row) => ({ type: normalizeAssetType(row.type), asset: JSON.parse(row.payload) as Asset }));
}

export async function listPersistedProposals(applicationServiceId: string): Promise<Proposal[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.proposal.findMany({ where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, orderBy: { createdAt: "asc" } });
  return rows.map((row) => JSON.parse(row.payload) as Proposal);
}

export async function listPersistedContextPacks(applicationServiceId: string): Promise<ContextPack[]> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const rows = await prisma.contextPack.findMany({ where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, orderBy: { createdAt: "asc" } });
  return rows.map(rowToContextPack);
}

export async function getPersistedAsset(assetType: string, assetId: string, applicationServiceId: string): Promise<Asset> {
  await ensureMcpPersistenceSchema();
  const scope = readableScope(applicationServiceId);
  const type = normalizeAssetType(assetType);
  const where = {
    applicationServiceId_scopePath_id: {
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      id: assetId
    }
  };
  if (type === "proposal") {
    const row = await prisma.proposal.findUnique({ where });
    if (!row) throw new Error(`Asset not found: ${type}/${assetId}`);
    return JSON.parse(row.payload) as Proposal;
  }
  if (type === "contextPack") {
    const row = await prisma.contextPack.findUnique({ where });
    if (!row) throw new Error(`Asset not found: ${type}/${assetId}`);
    return rowToContextPack(row);
  }
  const row = await prisma.designAsset.findUnique({ where });
  if (!row || normalizeAssetType(row.type) !== type) throw new Error(`Asset not found: ${type}/${assetId}`);
  return JSON.parse(row.payload) as Asset;
}

export async function listPersistedCollectionAsMarkdown(assetType: string, applicationServiceId: string): Promise<string> {
  const type = normalizeAssetType(assetType);
  const assets = await listAssetsForType(type, applicationServiceId);
  return [`# ${assetLabel(type)} Catalog`, "", ...assets.map((asset) => `- ${assetName(asset)} (${type}/${asset.id})`)].join("\n");
}

export async function renderPersistedAssetAsMarkdown(assetType: string, assetId: string, applicationServiceId: string, locale: AssetLocale = "en"): Promise<string> {
  const type = normalizeAssetType(assetType);
  const canonicalAsset = await getPersistedAsset(type, assetId, applicationServiceId);
  const asset = localizeAsset(type, canonicalAsset, locale);
  return [
    `# ${assetName(asset)}`,
    "",
    `- ID: ${asset.id}`,
    `- Type: ${assetLabel(type)}`,
    "domainId" in asset && asset.domainId ? `- Domain: ${asset.domainId}` : undefined,
    "",
    "## Agent Summary",
    assetSummary(asset),
    "",
    "## Source JSON",
    "```json",
    JSON.stringify(canonicalAsset, null, 2),
    "```"
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

export async function searchPersistedDesignAssets(input: { applicationServiceId: string; query: string; assetTypes?: string[]; domainId?: string; limit?: number; locale?: AssetLocale }) {
  const terms = input.query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  const types = input.assetTypes?.length ? input.assetTypes.map(normalizeAssetType) : undefined;
  const locale = input.locale ?? "en";
  const candidates = types
    ? (await Promise.all(types.map((type) => listPersistedAssets(input.applicationServiceId, type)))).flat()
    : [
        ...(await listPersistedAssets(input.applicationServiceId)),
        ...(await listPersistedProposals(input.applicationServiceId)).map((asset) => ({ type: "proposal" as AssetType, asset })),
        ...(await listPersistedContextPacks(input.applicationServiceId)).map((asset) => ({ type: "contextPack" as AssetType, asset }))
      ];
  const scored = candidates
    .filter(({ asset }) => !input.domainId || !("domainId" in asset) || asset.domainId === input.domainId || asset.id === input.domainId)
    .map(({ type, asset }) => ({ type, asset, localized: localizePersistedAssetForRead(type, asset, locale), score: scoreAsset(asset, terms) }))
    .filter((item) => item.score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score || assetName(a.localized).localeCompare(assetName(b.localized)))
    .slice(0, Math.max(1, Math.min(input.limit ?? 10, 50)));

  return {
    results: scored.map(({ type, asset, localized, score }) => ({
      id: localized.id,
      type,
      name: assetName(localized),
      summary: assetSummary(localized),
      relevanceReason: score > 0 ? `Matched ${score} query term(s) in persisted ${assetLabel(type)} metadata.` : `Included from persisted ${assetLabel(type)} catalog.`
    }))
  };
}

export async function disconnectMcpPersistence() {
  persistenceSchemaPromise = undefined;
  await prisma.$disconnect();
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid MCP write payload: ${field} is required.`);
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function optionalDate(value: unknown): Date {
  return typeof value === "string" ? new Date(value) : new Date();
}

async function listAssetsForType(assetType: AssetType, applicationServiceId: string): Promise<Asset[]> {
  if (assetType === "proposal") return listPersistedProposals(applicationServiceId);
  if (assetType === "contextPack") return listPersistedContextPacks(applicationServiceId);
  return (await listPersistedAssets(applicationServiceId, assetType)).map(({ asset }) => asset);
}

function rowToContextPack(row: {
  id: string;
  name: string;
  proposalId: string;
  targetAgent: string;
  summary: string;
  includedAssets: string;
  constraints: string;
  instructions: string;
  generatedMarkdown: string;
  payload: string | null;
  applicationServiceId: string;
  scopePath: string;
  createdAt: Date;
}): ContextPack {
  const payloadPack = parseContextPackPayload(row.payload);
  if (payloadPack) {
    return payloadPack;
  }

  const legacyPack: ContextPack & { [legacyContextPackFallbackSymbol]?: true } = {
    id: row.id,
    name: row.name,
    proposalId: row.proposalId,
    targetAgent: row.targetAgent,
    summary: row.summary,
    includedAssets: JSON.parse(row.includedAssets),
    constraints: JSON.parse(row.constraints),
    instructions: JSON.parse(row.instructions),
    generatedMarkdown: row.generatedMarkdown,
    createdAt: row.createdAt.toISOString(),
    architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }
  };
  legacyPack[legacyContextPackFallbackSymbol] = true;
  return legacyPack;
}

function parseContextPackPayload(payload: string | null): ContextPack | null {
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    if (!isValidPersistedContextPackPayload(parsed)) {
      return null;
    }

    validateAssetLocalization("contextPack", parsed);
    return parsed;
  } catch {
    return null;
  }
}

function isValidPersistedContextPackPayload(value: unknown): value is ContextPack {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const pack = value as Record<string, unknown>;
  return (
    typeof pack.id === "string" &&
    typeof pack.name === "string" &&
    typeof pack.proposalId === "string" &&
    typeof pack.targetAgent === "string" &&
    typeof pack.summary === "string" &&
    Array.isArray(pack.includedAssets) &&
    pack.includedAssets.every(isValidAssetRef) &&
    Array.isArray(pack.constraints) &&
    pack.constraints.every((item) => typeof item === "string") &&
    Array.isArray(pack.instructions) &&
    pack.instructions.every((item) => typeof item === "string") &&
    typeof pack.generatedMarkdown === "string" &&
    typeof pack.createdAt === "string" &&
    !!pack.localizedContent &&
    typeof pack.localizedContent === "object" &&
    !Array.isArray(pack.localizedContent)
  );
}

function isValidAssetRef(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const ref = value as Record<string, unknown>;
  return typeof ref.type === "string" && typeof ref.id === "string" && typeof ref.label === "string";
}

function localizePersistedAssetForRead<T extends Asset>(assetType: AssetType, asset: T, locale: AssetLocale): T {
  if (assetType === "contextPack" && locale !== "en" && isLegacyContextPackFallback(asset) && !asset.localizedContent?.[locale]) {
    return asset;
  }

  return localizeAsset(assetType, asset, locale) as T;
}

function isLegacyContextPackFallback(asset: Asset): asset is ContextPack & { [legacyContextPackFallbackSymbol]?: true } {
  return assetTypeLooksLikeContextPack(asset) && Boolean((asset as ContextPack & { [legacyContextPackFallbackSymbol]?: true })[legacyContextPackFallbackSymbol]);
}

function assetTypeLooksLikeContextPack(asset: Asset): asset is ContextPack {
  return "proposalId" in asset && "targetAgent" in asset && "includedAssets" in asset && "generatedMarkdown" in asset;
}

function assetName(asset: Asset): string {
  return "title" in asset && asset.title ? asset.title : asset.name;
}

function assetSummary(asset: Asset): string {
  if ("summary" in asset) return asset.summary;
  return asset.description;
}

function scoreAsset(asset: Asset, terms: string[]): number {
  const text = JSON.stringify(asset).toLowerCase();
  return terms.reduce((score, term) => score + (text.includes(term) ? 1 : 0), 0);
}

function assetLinkId(input: Pick<AssetLinkInput, "sourceType" | "sourceId" | "targetType" | "targetId" | "relationType">): string {
  return `${input.sourceType}:${input.sourceId}:${input.relationType}:${input.targetType}:${input.targetId}`
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-");
}

function designAssetGraphIdempotencyKey(assetType: AssetType, canonicalAsset: Record<string, unknown>): string {
  const contentHash = createHash("sha256").update(stableJson(canonicalAsset)).digest("hex");
  return `design-asset:${assetType}:${String(canonicalAsset.id)}:${contentHash}`;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableJsonValue(value));
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableJsonValue(nested)]));
  }
  return value;
}

type LegacyAssetLinkRow = {
  id: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  description: string | null;
  applicationServiceId: string;
  scopePath: string;
  createdAt: Date;
};

export function relationshipService(transaction: Prisma.TransactionClient, scope: RelationshipScope) {
  return new RelationshipCommandService(
    new PrismaRelationshipRepository(transaction),
    createTrustedRelationshipExecutionContext({
      enterpriseId: scope.enterpriseId,
      scope: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath },
      actor: writableActor()
    })
  );
}

export function configuredRelationshipScope(scope: ArchitectureScopeRef): RelationshipScope {
  return { enterpriseId: process.env.SPECFORGE_ENTERPRISE_ID ?? "legacy-enterprise", applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

async function lockRelationshipScope(transaction: Prisma.TransactionClient, scope: RelationshipScope): Promise<void> {
  await new PrismaRelationshipRepository(transaction).lockScope(scope);
}

async function resolveLegacyRelationshipScope(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef, sourceReference: string): Promise<RelationshipScope> {
  const configuredScope = configuredRelationshipScope(scope);
  const repository = new PrismaRelationshipRepository(transaction);
  await repository.lockScope(configuredScope);
  const matches = await repository.findLegacyCurrentBySourceReference(scope.applicationServiceId, scope.scopePath, sourceReference);
  if (matches.length > 1) throw new Error("LEGACY_RELATIONSHIP_AMBIGUOUS");
  const resolvedScope = matches.length === 1
    ? { enterpriseId: matches[0]!.enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }
    : configuredScope;
  if (resolvedScope.enterpriseId !== configuredScope.enterpriseId) await repository.lockScope(resolvedScope);
  return resolvedScope;
}

function normalizeLegacyRelationshipCode(value: string): RelationshipCode {
  const code = value.trim().toUpperCase() as RelationshipCode;
  if (!relationshipOntology.has(code)) throw new Error(`LEGACY_RELATIONSHIP_CODE_UNSUPPORTED: ${value}`);
  return code;
}

function legacyRelationshipCommand(link: LegacyAssetLinkRow, action: "upsert" | "delete", relationType = normalizeLegacyRelationshipCode(link.relationType)): UpsertRelationshipCommand {
  const scope = { applicationServiceId: link.applicationServiceId, scopePath: link.scopePath };
  return {
    channel: "mcp",
    correlationId: `${action}:${link.id}`,
    idempotencyKey: legacyRelationshipIdempotencyKey(link, action, relationType),
    source: {
      identity: {
        ...scope,
        nodeType: normalizeAssetType(link.sourceType),
        logicalId: link.sourceId,
        rootAssetType: normalizeAssetType(link.sourceType),
        rootAssetId: link.sourceId
      }
    },
    target: {
      identity: {
        ...scope,
        nodeType: normalizeAssetType(link.targetType),
        logicalId: link.targetId,
        rootAssetType: normalizeAssetType(link.targetType),
        rootAssetId: link.targetId
      }
    },
    relationType,
    relationshipSource: "legacy-asset-link",
    sourceReference: `legacy-asset-link:${link.id}`,
    metadata: link.description ? { description: link.description } : {}
  };
}

function legacyRelationshipIdempotencyKey(link: LegacyAssetLinkRow, action: "upsert" | "delete", relationType: string): string {
  const payload = JSON.stringify({
    action,
    id: link.id,
    createdAt: link.createdAt.toISOString(),
    sourceType: link.sourceType,
    sourceId: link.sourceId,
    targetType: link.targetType,
    targetId: link.targetId,
    relationType,
    description: link.description
  });
  return `legacy-asset-link:${action}:${createHash("sha256").update(payload).digest("hex")}`;
}

async function synchronizeLegacyAssetLinkUpsert(
  transaction: Prisma.TransactionClient,
  link: LegacyAssetLinkRow,
  relationType: RelationshipCode,
  scope: RelationshipScope
) {
  await relationshipService(transaction, scope)
    .upsertLegacyRelationship(legacyRelationshipCommand(link, "upsert", relationType));
}

async function synchronizeLegacyAssetLinkDelete(transaction: Prisma.TransactionClient, link: LegacyAssetLinkRow, scope: RelationshipScope) {
  // Historical rows may carry relation codes that are no longer in the ontology.
  const normalized = link.relationType.trim().toUpperCase() as RelationshipCode;
  const relationType = relationshipOntology.has(normalized) ? normalized : link.relationType;
  const command = legacyRelationshipCommand(link, "delete", relationType as RelationshipCode) as DeleteLegacyRelationshipCommand;
  await relationshipService(transaction, scope)
    .deleteLegacyRelationship(command);
}
