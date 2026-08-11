CREATE TABLE "KnowledgeGraphAnalysis" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generationId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "projectionManifestId" TEXT NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceContentDigest" TEXT NOT NULL,
    "relationshipVersion" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "summaryEdges" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "partialReasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "clusterCount" INTEGER NOT NULL DEFAULT 0,
    "nodeMetricCount" INTEGER NOT NULL DEFAULT 0,
    "bridgeEdgeCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeGraphAnalysis_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "KnowledgeGraphAnalysis_scope_generation_manifest_version_key"
      UNIQUE ("applicationServiceId", "scopePath", "generationId", "projectionManifestId", "analysisVersion"),
    CONSTRAINT "KnowledgeGraphAnalysis_scope_dbId_key"
      UNIQUE ("applicationServiceId", "scopePath", "dbId")
);

CREATE TABLE "KnowledgeGraphCluster" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysisId" UUID NOT NULL,
    "clusterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "layer" TEXT,
    "memberCount" INTEGER NOT NULL,
    "degree" INTEGER NOT NULL,
    "criticality" DOUBLE PRECISION NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeGraphCluster_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "KnowledgeGraphCluster_analysis_cluster_key" UNIQUE ("analysisId", "clusterId"),
    CONSTRAINT "KnowledgeGraphCluster_analysis_scope_fkey"
      FOREIGN KEY ("applicationServiceId", "scopePath", "analysisId")
      REFERENCES "KnowledgeGraphAnalysis"("applicationServiceId", "scopePath", "dbId")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "KnowledgeGraphNodeMetric" (
    "dbId" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysisId" UUID NOT NULL,
    "assertionId" TEXT NOT NULL,
    "semanticIdentity" TEXT NOT NULL,
    "layer" TEXT NOT NULL,
    "acceptedAssetType" TEXT,
    "clusterId" TEXT,
    "degree" INTEGER NOT NULL,
    "criticality" DOUBLE PRECISION NOT NULL,
    "isBridge" BOOLEAN NOT NULL DEFAULT false,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "inboundImpactWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "outboundImpactWeight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "contentDigest" TEXT NOT NULL,
    "applicationServiceId" TEXT NOT NULL,
    "scopePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeGraphNodeMetric_pkey" PRIMARY KEY ("dbId"),
    CONSTRAINT "KnowledgeGraphNodeMetric_analysis_assertion_key" UNIQUE ("analysisId", "assertionId"),
    CONSTRAINT "KnowledgeGraphNodeMetric_analysis_scope_fkey"
      FOREIGN KEY ("applicationServiceId", "scopePath", "analysisId")
      REFERENCES "KnowledgeGraphAnalysis"("applicationServiceId", "scopePath", "dbId")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "KnowledgeGraphAnalysis_scope_manifest_status_idx"
  ON "KnowledgeGraphAnalysis" ("applicationServiceId", "scopePath", "baselineId", "projectionManifestId", "status", "publishedAt");
CREATE INDEX "KnowledgeGraphAnalysis_scope_generation_version_idx"
  ON "KnowledgeGraphAnalysis" ("applicationServiceId", "scopePath", "generationId", "analysisVersion", "updatedAt");
CREATE INDEX "KnowledgeGraphCluster_scope_analysis_layer_idx"
  ON "KnowledgeGraphCluster" ("applicationServiceId", "scopePath", "analysisId", "layer", "clusterId");
CREATE INDEX "KnowledgeGraphCluster_scope_analysis_rank_idx"
  ON "KnowledgeGraphCluster" ("applicationServiceId", "scopePath", "analysisId", "criticality", "clusterId");
CREATE INDEX "KnowledgeGraphNodeMetric_scope_cluster_member_idx"
  ON "KnowledgeGraphNodeMetric" ("applicationServiceId", "scopePath", "analysisId", "clusterId", "semanticIdentity", "assertionId");
CREATE INDEX "KnowledgeGraphNodeMetric_scope_filter_rank_idx"
  ON "KnowledgeGraphNodeMetric" ("applicationServiceId", "scopePath", "analysisId", "layer", "acceptedAssetType", "criticality");
CREATE INDEX "KnowledgeGraphNodeMetric_scope_inbound_impact_idx"
  ON "KnowledgeGraphNodeMetric" ("applicationServiceId", "scopePath", "analysisId", "inboundImpactWeight", "assertionId");
CREATE INDEX "KnowledgeGraphNodeMetric_scope_outbound_impact_idx"
  ON "KnowledgeGraphNodeMetric" ("applicationServiceId", "scopePath", "analysisId", "outboundImpactWeight", "assertionId");
