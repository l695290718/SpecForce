-- Add the enterprise relationship ledger without changing the legacy AssetLink read path.
DO $$
DECLARE
  legacy_backfill_batch_size CONSTANT INTEGER := 500;
  legacy_cursor UUID := NULL;
  legacy_batch_end UUID;
BEGIN
  CREATE TABLE IF NOT EXISTS "AssetNode" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "logicalId" TEXT NOT NULL,
    "rootAssetType" TEXT NOT NULL,
    "rootAssetId" TEXT NOT NULL,
    "parentNodeId" UUID,
    "nodePath" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    version BIGINT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetNode_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "AssetNode_enterprise_scope_dbId_key" UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "dbId"),
    CONSTRAINT "AssetNode_scope_identity_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId"),
    CONSTRAINT "AssetNode_parent_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "parentNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE
  );

  CREATE TABLE IF NOT EXISTS "RelationshipCurrent" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "sourceNodeId" UUID NOT NULL,
    "targetNodeId" UUID NOT NULL,
    "relationType" TEXT NOT NULL,
    strength TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    source TEXT NOT NULL,
    "sourceReference" TEXT NOT NULL DEFAULT '',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    version BIGINT NOT NULL,
    "lifecycleStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipCurrent_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "RelationshipCurrent_enterprise_scope_dbId_key" UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "dbId"),
    CONSTRAINT "RelationshipCurrent_source_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RelationshipCurrent_target_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "targetNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RelationshipCurrent_enterprise_scope_identity_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", source, "sourceReference")
  );

  CREATE TABLE IF NOT EXISTS "RelationshipEvent" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "relationshipId" UUID NOT NULL,
    action TEXT NOT NULL,
    "priorVersion" BIGINT,
    "newVersion" BIGINT NOT NULL,
    "graphVersion" BIGINT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    channel TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    source TEXT NOT NULL,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipEvent_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "RelationshipEvent_enterprise_scope_dbId_key" UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "dbId"),
    CONSTRAINT "RelationshipEvent_relationship_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "relationshipId")
      REFERENCES "RelationshipCurrent"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RelationshipEvent_enterprise_scope_idempotency_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey")
  );

  CREATE TABLE IF NOT EXISTS "RelationshipOutbox" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "relationshipEventId" UUID NOT NULL,
    "graphVersion" BIGINT NOT NULL,
    "eventType" TEXT NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RelationshipOutbox_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "RelationshipOutbox_event_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "relationshipEventId")
      REFERENCES "RelationshipEvent"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RelationshipOutbox_enterprise_scope_event_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "relationshipEventId"),
    CONSTRAINT "RelationshipOutbox_enterprise_scope_idempotency_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey")
  );

  CREATE TABLE IF NOT EXISTS "ProjectionCheckpoint" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "partitionId" TEXT NOT NULL,
    "lastEventId" UUID,
    "projectionVersion" BIGINT NOT NULL,
    "projectedAt" TIMESTAMP(3),
    status TEXT NOT NULL,
    error TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectionCheckpoint_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "ProjectionCheckpoint_last_event_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "lastEventId")
      REFERENCES "RelationshipEvent"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectionCheckpoint_enterprise_scope_partition_key"
      UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "partitionId")
  );

  CREATE TABLE IF NOT EXISTS "ImpactAnalysisRun" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    status TEXT NOT NULL,
    "stopReason" TEXT,
    "assetVersion" BIGINT NOT NULL,
    "relationshipVersion" BIGINT NOT NULL,
    "ontologyVersion" TEXT NOT NULL,
    "requiredGraphVersion" BIGINT NOT NULL,
    "actualGraphCheckpoint" BIGINT,
    "authorizationSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
    budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    "unexploredFrontierCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpactAnalysisRun_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "ImpactAnalysisRun_enterprise_scope_dbId_key" UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "dbId")
  );

  CREATE TABLE IF NOT EXISTS "ImpactResultNode" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "impactAnalysisRunId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "impactLevel" TEXT NOT NULL,
    certainty TEXT NOT NULL,
    depth INTEGER NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    "primaryPath" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "alternativePaths" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "matchedRules" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "recommendedActions" JSONB NOT NULL DEFAULT '[]'::jsonb,
    owner TEXT,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpactResultNode_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "ImpactResultNode_enterprise_scope_dbId_key" UNIQUE ("enterpriseId", "applicationServiceId", "scopePath", "dbId"),
    CONSTRAINT "ImpactResultNode_run_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "impactAnalysisRunId")
      REFERENCES "ImpactAnalysisRun"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImpactResultNode_node_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "nodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImpactResultNode_impactAnalysisRunId_nodeId_key" UNIQUE ("impactAnalysisRunId", "nodeId")
  );

  CREATE TABLE IF NOT EXISTS "ImpactResultPath" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "enterpriseId" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "impactResultNodeId" UUID NOT NULL,
    "startNodeId" UUID NOT NULL,
    "endNodeId" UUID NOT NULL,
    rank INTEGER NOT NULL,
    certainty TEXT NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    path JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ImpactResultPath_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "ImpactResultPath_result_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "impactResultNodeId")
      REFERENCES "ImpactResultNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImpactResultPath_start_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "startNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImpactResultPath_end_scope_fkey" FOREIGN KEY ("enterpriseId", "applicationServiceId", "scopePath", "endNodeId")
      REFERENCES "AssetNode"("enterpriseId", "applicationServiceId", "scopePath", "dbId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImpactResultPath_impactResultNodeId_rank_key" UNIQUE ("impactResultNodeId", rank)
  );

  CREATE INDEX IF NOT EXISTS "AssetNode_scope_root_idx" ON "AssetNode" ("enterpriseId", "applicationServiceId", "scopePath", "rootAssetType", "rootAssetId");
  CREATE INDEX IF NOT EXISTS "AssetNode_scope_parent_idx" ON "AssetNode" ("enterpriseId", "applicationServiceId", "scopePath", "parentNodeId");
  CREATE INDEX IF NOT EXISTS "RelationshipCurrent_scope_source_idx" ON "RelationshipCurrent" ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "relationType");
  CREATE INDEX IF NOT EXISTS "RelationshipCurrent_scope_target_idx" ON "RelationshipCurrent" ("enterpriseId", "applicationServiceId", "scopePath", "targetNodeId", "relationType");
  CREATE INDEX IF NOT EXISTS "RelationshipEvent_scope_relationship_idx" ON "RelationshipEvent" ("enterpriseId", "applicationServiceId", "scopePath", "relationshipId", "createdAt");
  CREATE INDEX IF NOT EXISTS "RelationshipOutbox_scope_pending_idx" ON "RelationshipOutbox" ("enterpriseId", "applicationServiceId", "scopePath", status, "availableAt");
  CREATE INDEX IF NOT EXISTS "ProjectionCheckpoint_scope_version_idx" ON "ProjectionCheckpoint" ("enterpriseId", "applicationServiceId", "scopePath", "projectionVersion");
  CREATE INDEX IF NOT EXISTS "ImpactAnalysisRun_scope_status_idx" ON "ImpactAnalysisRun" ("enterpriseId", "applicationServiceId", "scopePath", status, "createdAt");
  CREATE INDEX IF NOT EXISTS "ImpactAnalysisRun_scope_proposal_idx" ON "ImpactAnalysisRun" ("enterpriseId", "applicationServiceId", "scopePath", "proposalId");
  CREATE INDEX IF NOT EXISTS "ImpactResultNode_scope_run_idx" ON "ImpactResultNode" ("enterpriseId", "applicationServiceId", "scopePath", "impactAnalysisRunId");
  CREATE INDEX IF NOT EXISTS "ImpactResultPath_scope_result_idx" ON "ImpactResultPath" ("enterpriseId", "applicationServiceId", "scopePath", "impactResultNodeId");

  LOOP
    SELECT batch."dbId" INTO legacy_batch_end
    FROM (
      SELECT link."dbId"
      FROM "AssetLink" link
      WHERE legacy_cursor IS NULL OR link."dbId" > legacy_cursor
      ORDER BY link."dbId"
      LIMIT legacy_backfill_batch_size
    ) batch
    ORDER BY batch."dbId" DESC
    LIMIT 1;

    EXIT WHEN legacy_batch_end IS NULL;

    INSERT INTO "AssetNode" (
      "enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId", "rootAssetType", "rootAssetId",
      "nodePath", "displayName", metadata, version, "lifecycleStatus", "createdAt", "updatedAt"
    )
    SELECT
      'legacy-enterprise',
      COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service'),
      COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links'),
      link."sourceType", link."sourceId", link."sourceType", link."sourceId",
      link."sourceType" || '/' || link."sourceId", link."sourceId",
      jsonb_build_object('provenance', 'legacy-asset-link', 'legacyAssetLinkId', link.id),
      1, 'ACTIVE', link."createdAt", link."createdAt"
    FROM "AssetLink" link
    WHERE (legacy_cursor IS NULL OR link."dbId" > legacy_cursor) AND link."dbId" <= legacy_batch_end
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId") DO NOTHING;

    INSERT INTO "AssetNode" (
      "enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId", "rootAssetType", "rootAssetId",
      "nodePath", "displayName", metadata, version, "lifecycleStatus", "createdAt", "updatedAt"
    )
    SELECT
      'legacy-enterprise',
      COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service'),
      COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links'),
      link."targetType", link."targetId", link."targetType", link."targetId",
      link."targetType" || '/' || link."targetId", link."targetId",
      jsonb_build_object('provenance', 'legacy-asset-link', 'legacyAssetLinkId', link.id),
      1, 'ACTIVE', link."createdAt", link."createdAt"
    FROM "AssetLink" link
    WHERE (legacy_cursor IS NULL OR link."dbId" > legacy_cursor) AND link."dbId" <= legacy_batch_end
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "nodeType", "logicalId") DO NOTHING;

    INSERT INTO "RelationshipCurrent" (
      "enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", strength,
      confidence, source, "sourceReference", "validFrom", version, metadata, "createdAt", "updatedAt"
    )
    SELECT
      'legacy-enterprise',
      COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service'),
      COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links'),
      source_node."dbId", target_node."dbId", link."relationType", 'medium', 1,
      'legacy-asset-link', 'legacy-asset-link:' || link.id, link."createdAt", 1,
      jsonb_build_object('provenance', 'legacy-asset-link', 'legacyAssetLinkId', link.id, 'description', link.description),
      link."createdAt", link."createdAt"
    FROM "AssetLink" link
    JOIN "AssetNode" source_node ON source_node."enterpriseId" = 'legacy-enterprise'
      AND source_node."applicationServiceId" = COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service')
      AND source_node."scopePath" = COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links')
      AND source_node."nodeType" = link."sourceType" AND source_node."logicalId" = link."sourceId"
    JOIN "AssetNode" target_node ON target_node."enterpriseId" = 'legacy-enterprise'
      AND target_node."applicationServiceId" = COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service')
      AND target_node."scopePath" = COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links')
      AND target_node."nodeType" = link."targetType" AND target_node."logicalId" = link."targetId"
    WHERE (legacy_cursor IS NULL OR link."dbId" > legacy_cursor) AND link."dbId" <= legacy_batch_end
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "sourceNodeId", "targetNodeId", "relationType", source, "sourceReference") DO NOTHING;

    INSERT INTO "RelationshipEvent" (
      "enterpriseId", "applicationServiceId", "scopePath", "relationshipId", action, "newVersion", "graphVersion",
      "actorType", "actorId", channel, "correlationId", "idempotencyKey", source, snapshot, "createdAt"
    )
    SELECT
      relationship."enterpriseId", relationship."applicationServiceId", relationship."scopePath", relationship."dbId",
      'UPSERT', relationship.version, relationship.version,
      'migration', 'enterprise-relationship-graph', 'migration', relationship."sourceReference",
      'legacy-event:' || relationship."sourceReference", 'legacy-asset-link',
      jsonb_build_object('provenance', 'legacy-asset-link', 'relationshipId', relationship."dbId"), relationship."createdAt"
    FROM "RelationshipCurrent" relationship
    JOIN "AssetLink" link ON relationship."enterpriseId" = 'legacy-enterprise'
      AND relationship."applicationServiceId" = COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service')
      AND relationship."scopePath" = COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links')
      AND relationship."sourceReference" = 'legacy-asset-link:' || link.id
    WHERE (legacy_cursor IS NULL OR link."dbId" > legacy_cursor) AND link."dbId" <= legacy_batch_end
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey") DO NOTHING;

    INSERT INTO "RelationshipOutbox" (
      "enterpriseId", "applicationServiceId", "scopePath", "relationshipEventId", "graphVersion", "eventType", payload,
      status, "idempotencyKey", "availableAt", "createdAt", "updatedAt"
    )
    SELECT
      event."enterpriseId", event."applicationServiceId", event."scopePath", event."dbId", event."graphVersion", 'RELATIONSHIP_UPSERT',
      jsonb_build_object('provenance', 'legacy-asset-link', 'relationshipEventId', event."dbId"),
      'PENDING', 'legacy-outbox:' || event."idempotencyKey", event."createdAt", event."createdAt", event."createdAt"
    FROM "RelationshipEvent" event
    JOIN "AssetLink" link ON event."enterpriseId" = 'legacy-enterprise'
      AND event."applicationServiceId" = COALESCE(NULLIF(link."applicationServiceId", ''), 'legacy-application-service')
      AND event."scopePath" = COALESCE(NULLIF(link."scopePath", ''), 'legacy/asset-links')
      AND event."correlationId" = 'legacy-asset-link:' || link.id
    WHERE event.source = 'legacy-asset-link'
      AND (legacy_cursor IS NULL OR link."dbId" > legacy_cursor) AND link."dbId" <= legacy_batch_end
    ON CONFLICT ("enterpriseId", "applicationServiceId", "scopePath", "idempotencyKey") DO NOTHING;

    legacy_cursor := legacy_batch_end;
  END LOOP;
END $$;
