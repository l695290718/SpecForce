-- Repair only AssetLink relationships that are absent from the scoped graph ledger.
-- Prisma runs each migration in a transaction; the temporary tables therefore
-- make the repair atomic without replaying the historical backfill migration.

CREATE TEMP TABLE "_SpecForgeMissingAssetLinks" ON COMMIT DROP AS
SELECT
  link."dbId" AS "linkDbId",
  link.id AS "linkId",
  link."sourceType",
  link."sourceId",
  link."targetType",
  link."targetId",
  link."relationType",
  link.description,
  link."applicationServiceId",
  link."scopePath",
  link."createdAt"
FROM "AssetLink" link
WHERE NOT EXISTS (
  SELECT 1
  FROM "RelationshipCurrent" relationship
  JOIN "AssetNode" source_node
    ON source_node."enterpriseId" = 'legacy-enterprise'
   AND source_node."applicationServiceId" = link."applicationServiceId"
   AND source_node."scopePath" = link."scopePath"
   AND source_node."nodeType" = link."sourceType"
   AND source_node."logicalId" = link."sourceId"
  JOIN "AssetNode" target_node
    ON target_node."enterpriseId" = 'legacy-enterprise'
   AND target_node."applicationServiceId" = link."applicationServiceId"
   AND target_node."scopePath" = link."scopePath"
   AND target_node."nodeType" = link."targetType"
   AND target_node."logicalId" = link."targetId"
  WHERE relationship."enterpriseId" = 'legacy-enterprise'
    AND relationship."applicationServiceId" = link."applicationServiceId"
    AND relationship."scopePath" = link."scopePath"
    AND relationship."sourceNodeId" = source_node."dbId"
    AND relationship."targetNodeId" = target_node."dbId"
    AND relationship."relationType" = link."relationType"
);

CREATE INDEX "_SpecForgeMissingAssetLinks_scope_idx"
  ON "_SpecForgeMissingAssetLinks" ("applicationServiceId", "scopePath", "linkDbId");

INSERT INTO "AssetNode" (
  "enterpriseId",
  "applicationServiceId",
  "scopePath",
  "nodeType",
  "logicalId",
  "rootAssetType",
  "rootAssetId",
  "nodePath",
  "displayName",
  metadata,
  version,
  "lifecycleStatus",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT
  'legacy-enterprise',
  missing."applicationServiceId",
  missing."scopePath",
  missing."sourceType",
  missing."sourceId",
  missing."sourceType",
  missing."sourceId",
  missing."sourceType" || '/' || missing."sourceId",
  missing."sourceId",
  jsonb_build_object(
    'provenance', 'brownfield-asset-link-baseline',
    'migrationId', '20260920000000_repair_missing_asset_link_relationships',
    'assetLinkId', missing."linkId"
  ),
  1,
  'ACTIVE',
  missing."createdAt",
  missing."createdAt"
FROM "_SpecForgeMissingAssetLinks" missing
ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId") DO NOTHING;

INSERT INTO "AssetNode" (
  "enterpriseId",
  "applicationServiceId",
  "scopePath",
  "nodeType",
  "logicalId",
  "rootAssetType",
  "rootAssetId",
  "nodePath",
  "displayName",
  metadata,
  version,
  "lifecycleStatus",
  "createdAt",
  "updatedAt"
)
SELECT DISTINCT
  'legacy-enterprise',
  missing."applicationServiceId",
  missing."scopePath",
  missing."targetType",
  missing."targetId",
  missing."targetType",
  missing."targetId",
  missing."targetType" || '/' || missing."targetId",
  missing."targetId",
  jsonb_build_object(
    'provenance', 'brownfield-asset-link-baseline',
    'migrationId', '20260920000000_repair_missing_asset_link_relationships',
    'assetLinkId', missing."linkId"
  ),
  1,
  'ACTIVE',
  missing."createdAt",
  missing."createdAt"
FROM "_SpecForgeMissingAssetLinks" missing
ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId") DO NOTHING;

CREATE TEMP TABLE "_SpecForgeRepairedRelationships" ON COMMIT DROP AS
SELECT
  missing."linkDbId",
  missing."linkId",
  missing."applicationServiceId",
  missing."scopePath",
  missing."sourceType",
  missing."sourceId",
  missing."targetType",
  missing."targetId",
  missing."relationType",
  missing.description,
  missing."createdAt",
  relationship."dbId" AS "relationshipDbId"
FROM "_SpecForgeMissingAssetLinks" missing
JOIN "AssetNode" source_node
  ON source_node."enterpriseId" = 'legacy-enterprise'
 AND source_node."applicationServiceId" = missing."applicationServiceId"
 AND source_node."scopePath" = missing."scopePath"
 AND source_node."nodeType" = missing."sourceType"
 AND source_node."logicalId" = missing."sourceId"
JOIN "AssetNode" target_node
  ON target_node."enterpriseId" = 'legacy-enterprise'
 AND target_node."applicationServiceId" = missing."applicationServiceId"
 AND target_node."scopePath" = missing."scopePath"
 AND target_node."nodeType" = missing."targetType"
 AND target_node."logicalId" = missing."targetId"
JOIN "RelationshipCurrent" relationship
  ON relationship."enterpriseId" = 'legacy-enterprise'
 AND relationship."applicationServiceId" = missing."applicationServiceId"
 AND relationship."scopePath" = missing."scopePath"
 AND relationship."sourceNodeId" = source_node."dbId"
 AND relationship."targetNodeId" = target_node."dbId"
 AND relationship."relationType" = missing."relationType"
 AND relationship.source = 'brownfield-asset-link-baseline'
 AND relationship."sourceReference" = 'asset-link:' || missing."linkDbId"::text;

INSERT INTO "RelationshipCurrent" (
  "enterpriseId",
  "applicationServiceId",
  "scopePath",
  "sourceNodeId",
  "targetNodeId",
  "relationType",
  strength,
  confidence,
  source,
  "sourceReference",
  "validFrom",
  version,
  "lifecycleStatus",
  metadata,
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-enterprise',
  repaired."applicationServiceId",
  repaired."scopePath",
  source_node."dbId",
  target_node."dbId",
  repaired."relationType",
  'medium',
  1,
  'brownfield-asset-link-baseline',
  'asset-link:' || repaired."linkDbId"::text,
  repaired."createdAt",
  1,
  'ACTIVE',
  jsonb_build_object(
    'provenance', 'brownfield-asset-link-baseline',
    'migrationId', '20260920000000_repair_missing_asset_link_relationships',
    'assetLinkId', repaired."linkId",
    'description', repaired.description
  ),
  repaired."createdAt",
  repaired."createdAt"
FROM "_SpecForgeMissingAssetLinks" repaired
JOIN "AssetNode" source_node
  ON source_node."enterpriseId" = 'legacy-enterprise'
 AND source_node."applicationServiceId" = repaired."applicationServiceId"
 AND source_node."scopePath" = repaired."scopePath"
 AND source_node."nodeType" = repaired."sourceType"
 AND source_node."logicalId" = repaired."sourceId"
JOIN "AssetNode" target_node
  ON target_node."enterpriseId" = 'legacy-enterprise'
 AND target_node."applicationServiceId" = repaired."applicationServiceId"
 AND target_node."scopePath" = repaired."scopePath"
 AND target_node."nodeType" = repaired."targetType"
 AND target_node."logicalId" = repaired."targetId"
ON CONFLICT (
  "enterpriseId",
  "applicationServiceId",
  "scopePath",
  "sourceNodeId",
  "targetNodeId",
  "relationType",
  source,
  "sourceReference"
) DO NOTHING;

TRUNCATE "_SpecForgeRepairedRelationships";

INSERT INTO "_SpecForgeRepairedRelationships" (
  "linkDbId",
  "linkId",
  "applicationServiceId",
  "scopePath",
  "sourceType",
  "sourceId",
  "targetType",
  "targetId",
  "relationType",
  description,
  "createdAt",
  "relationshipDbId"
)
SELECT
  missing."linkDbId",
  missing."linkId",
  missing."applicationServiceId",
  missing."scopePath",
  missing."sourceType",
  missing."sourceId",
  missing."targetType",
  missing."targetId",
  missing."relationType",
  missing.description,
  missing."createdAt",
  relationship."dbId"
FROM "_SpecForgeMissingAssetLinks" missing
JOIN "AssetNode" source_node
  ON source_node."enterpriseId" = 'legacy-enterprise'
 AND source_node."applicationServiceId" = missing."applicationServiceId"
 AND source_node."scopePath" = missing."scopePath"
 AND source_node."nodeType" = missing."sourceType"
 AND source_node."logicalId" = missing."sourceId"
JOIN "AssetNode" target_node
  ON target_node."enterpriseId" = 'legacy-enterprise'
 AND target_node."applicationServiceId" = missing."applicationServiceId"
 AND target_node."scopePath" = missing."scopePath"
 AND target_node."nodeType" = missing."targetType"
 AND target_node."logicalId" = missing."targetId"
JOIN "RelationshipCurrent" relationship
  ON relationship."enterpriseId" = 'legacy-enterprise'
 AND relationship."applicationServiceId" = missing."applicationServiceId"
 AND relationship."scopePath" = missing."scopePath"
 AND relationship."sourceNodeId" = source_node."dbId"
 AND relationship."targetNodeId" = target_node."dbId"
 AND relationship."relationType" = missing."relationType"
 AND relationship.source = 'brownfield-asset-link-baseline'
 AND relationship."sourceReference" = 'asset-link:' || missing."linkDbId"::text;

INSERT INTO "RelationshipEvent" (
  "enterpriseId",
  "applicationServiceId",
  "scopePath",
  "relationshipId",
  action,
  "newVersion",
  "graphVersion",
  "actorType",
  "actorId",
  channel,
  "correlationId",
  "idempotencyKey",
  source,
  snapshot,
  "createdAt"
)
SELECT
  'legacy-enterprise',
  repaired."applicationServiceId",
  repaired."scopePath",
  repaired."relationshipDbId",
  'UPSERT',
  1,
  1,
  'migration',
  '20260920000000_repair_missing_asset_link_relationships',
  'migration',
  'asset-link:' || repaired."linkDbId"::text,
  'brownfield-asset-link-event:' || repaired."linkDbId"::text,
  'brownfield-asset-link-baseline',
  jsonb_build_object(
    'migrationId', '20260920000000_repair_missing_asset_link_relationships',
    'assetLinkId', repaired."linkId",
    'relationshipId', repaired."relationshipDbId"
  ),
  repaired."createdAt"
FROM "_SpecForgeRepairedRelationships" repaired
ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey") DO NOTHING;

INSERT INTO "RelationshipOutbox" (
  "enterpriseId",
  "applicationServiceId",
  "scopePath",
  "relationshipEventId",
  "graphVersion",
  "eventType",
  payload,
  status,
  "idempotencyKey",
  "availableAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-enterprise',
  repaired."applicationServiceId",
  repaired."scopePath",
  event."dbId",
  1,
  'RELATIONSHIP_UPSERT',
  jsonb_build_object(
    'migrationId', '20260920000000_repair_missing_asset_link_relationships',
    'assetLinkId', repaired."linkId",
    'relationshipEventId', event."dbId"
  ),
  'PENDING',
  'brownfield-asset-link-outbox:' || repaired."linkDbId"::text,
  repaired."createdAt",
  repaired."createdAt",
  repaired."createdAt"
FROM "_SpecForgeRepairedRelationships" repaired
JOIN "RelationshipEvent" event
  ON event."enterpriseId" = 'legacy-enterprise'
 AND event."applicationServiceId" = repaired."applicationServiceId"
 AND event."scopePath" = repaired."scopePath"
 AND event."idempotencyKey" = 'brownfield-asset-link-event:' || repaired."linkDbId"::text
ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey") DO NOTHING;
