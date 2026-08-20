import { PrismaClient } from "@prisma/client";

type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
type Asset3AMappingCoverageSource = {
  applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; manifestId: string; assetType: string; assetId: string;
  role: "MEMBERSHIP" | "TRACEABILITY" | "EXEMPTION"; status: "COVERED" | "BLOCKED" | "NOT_EVALUATED"; terminalMemberId?: string;
  pathEvidence: Array<{ relationshipIdentity: string; sourceSemanticIdentity: string; targetSemanticIdentity: string; relationCode: string }>;
  reasonCode?: string; diagnosticRef?: string; sourceDigest?: string; rowDigest: string;
};
type ArchitectureUnitProjection = {
  applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string; unitIdentity: string;
  layer: ArchitectureLayer; kind: string; parentUnitIdentity?: string; canonicalName: string; localizedName?: string; aliases: string[];
  memberCount: number; criticality: number; completeness: number; evidenceCount: number; unclassifiedMemberCount: number; contentDigest: string;
};
type ArchitectureUnitMemberProjection = { applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string; unitIdentity: string; assertionId: string; assetType?: string; semanticIdentity: string; contentDigest: string };
type ArchitectureUnitMappingProjection = { applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string; mappingIdentity: string; sourceUnitIdentity: string; targetUnitIdentity: string; sourceLayer: ArchitectureLayer; targetLayer: ArchitectureLayer; mappingFamily: string; relationshipCount: number; evidenceCount: number; confidence: number; contentDigest: string };
type SemanticAssetSource = { applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string; assetType: string; assetId: string; logicalId: string; contentDigest: string };
type SemanticAssertionSource = { applicationServiceId: string; scopePath: string; generationId: string; baselineId: string; projectionManifestId: string; assertionId: string; semanticIdentity: string; factType: string; layer: ArchitectureLayer; confidence: number; status: "ACCEPTED"; contentDigest: string };
type SemanticAssetRelationshipSource = { relationshipIdentity: string; sourceAssetType: string; sourceAssetId: string; targetAssetType: string; targetAssetId: string; relationCode: string; confidence: number; relationshipVersion: string; projectionOrdinal: bigint; contentDigest: string };
type SemanticAssertionRelationshipSource = { relationshipIdentity: string; sourceAssertionId: string; targetAssertionId: string; relationCode: string; confidence: number; relationshipVersion?: string; projectionOrdinal: bigint; contentDigest: string };
type SemanticArchitectureRelationshipSource = { relationshipIdentity: string; sourceUnitIdentity: string; targetUnitIdentity: string; relationCode: string; confidence: number; relationshipVersion?: string; projectionOrdinal: bigint; contentDigest: string };

export interface SemanticGenerationScope {
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
  baselineId: string;
  generationId: string;
  manifestId: string;
}

export interface SemanticSourceBinding {
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
  semanticSchemaVersion: "nebula.3a.semantic.v1";
}

export interface SemanticPage<T> {
  items: readonly T[];
  nextCursor: string | null;
  source: { applicationServiceId: string; scopePath: string; baselineId: string; generationId: string; manifestId: string };
}

type PrismaRepository = PrismaClient;
type FindManyDelegate = { findMany(args?: any): Promise<readonly Record<string, any>[]> };
type SourceBindingReader = (scope: SemanticGenerationScope) => Promise<SemanticSourceBinding>;

export class PrismaSemanticProjectionSource {
  constructor(private readonly prisma: PrismaRepository, private readonly sourceBindingReader?: SourceBindingReader) {}

  async readSourceBinding(scope: SemanticGenerationScope): Promise<SemanticSourceBinding> {
    if (this.sourceBindingReader) return this.sourceBindingReader(scope);
    assertScope(scope);
    const nebulaManifest = await this.prisma.nebulaProjectionManifest.findFirst({
      where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id: scope.manifestId, status: { in: ["BUILDING", "VALIDATED", "ACTIVE"] } }
    });
    if (!nebulaManifest) throw new Error("SEMANTIC_SOURCE_MANIFEST_NOT_FOUND");
    const sourceProjectionManifestId = nebulaManifest.sourceProjectionManifestId;
    const sourceCoverageManifestId = nebulaManifest.sourceCoverageManifestId;
    if (!sourceProjectionManifestId || !sourceCoverageManifestId) throw new Error("SEMANTIC_SOURCE_MANIFEST_MISMATCH");
    const projection = await this.prisma.projectionManifest.findFirst({
      where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id: sourceProjectionManifestId, baselineId: scope.baselineId, generationId: scope.generationId }
    });
    const coverage = await this.prisma.architectureCoverageManifest.findFirst({
      where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, id: sourceCoverageManifestId, baselineId: scope.baselineId, publicationState: "CURRENT" }
    });
    if (!projection || !coverage) throw new Error("SEMANTIC_SOURCE_MANIFEST_NOT_FOUND");
    if (projection.applicationServiceId !== scope.applicationServiceId || projection.scopePath !== scope.scopePath || coverage.applicationServiceId !== scope.applicationServiceId || coverage.scopePath !== scope.scopePath) {
      throw new Error("SEMANTIC_SOURCE_MANIFEST_MISMATCH");
    }
    return {
      sourceProjectionManifestId: projection.id,
      sourceCoverageManifestId: coverage.id,
      knowledgeGenerationId: projection.generationId ?? "",
      coverageGenerationId: coverage.generationId,
      relationshipVersion: projection.relationshipVersion,
      catalogVersion: String(coverage.catalogVersion),
      catalogDigest: coverage.catalogDigest,
      semanticSchemaVersion: "nebula.3a.semantic.v1"
    };
  }

  async readAssets(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssetSource>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.assetNode, this.assetWhere(scope, source, cursor), cursor, limit, (row) => ({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      generationId: scope.generationId,
      baselineId: scope.baselineId,
      projectionManifestId: source.sourceProjectionManifestId,
      assetType: String(row.nodeType),
      assetId: String(row.logicalId),
      logicalId: String(row.logicalId),
      contentDigest: String(row.dbId)
    }));
  }

  async readAssertions(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssertionSource>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.knowledgeAssertion, { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, status: "ACCEPTED", ...(cursor ? { dbId: { gt: cursor } } : {}) }, cursor, limit, (row) => ({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      generationId: source.knowledgeGenerationId,
      baselineId: scope.baselineId,
      projectionManifestId: source.sourceProjectionManifestId,
      assertionId: String(row.id),
      semanticIdentity: String(row.semanticIdentity),
      factType: String(row.factType),
      layer: String(row.layer) as SemanticAssertionSource["layer"],
      confidence: Number(row.confidence),
      status: "ACCEPTED" as const,
      contentDigest: String(row.dbId)
    }));
  }

  async readUnits(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<ArchitectureUnitProjection>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.architectureUnitProjection, projectionWhere(scope, source, cursor), cursor, limit, (row) => ({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      generationId: scope.generationId,
      baselineId: scope.baselineId,
      projectionManifestId: source.sourceProjectionManifestId,
      unitIdentity: String(row.unitIdentity),
      layer: String(row.layer) as ArchitectureUnitProjection["layer"],
      kind: String(row.kind) as ArchitectureUnitProjection["kind"],
      ...(typeof row.parentUnitIdentity === "string" ? { parentUnitIdentity: row.parentUnitIdentity } : {}),
      canonicalName: String(row.canonicalName),
      ...(typeof row.localizedName === "string" ? { localizedName: row.localizedName } : {}),
      aliases: jsonStringArray(row.aliases),
      memberCount: Number(row.memberCount),
      criticality: Number(row.criticality),
      completeness: Number(row.completeness),
      evidenceCount: Number(row.evidenceCount),
      unclassifiedMemberCount: Number(row.unclassifiedMemberCount),
      contentDigest: String(row.contentDigest)
    }));
  }

  async readMembers(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<ArchitectureUnitMemberProjection>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.architectureUnitMemberProjection, projectionWhere(scope, source, cursor), cursor, limit, (row) => ({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      generationId: scope.generationId,
      baselineId: scope.baselineId,
      projectionManifestId: source.sourceProjectionManifestId,
      unitIdentity: String(row.unitIdentity),
      assertionId: String(row.assertionId),
      ...(typeof row.assetType === "string" ? { assetType: row.assetType } : {}),
      semanticIdentity: String(row.semanticIdentity),
      contentDigest: String(row.contentDigest)
    }));
  }

  async readUnitMappings(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<ArchitectureUnitMappingProjection>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.architectureUnitMappingProjection, projectionWhere(scope, source, cursor), cursor, limit, (row) => ({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      generationId: scope.generationId,
      baselineId: scope.baselineId,
      projectionManifestId: source.sourceProjectionManifestId,
      mappingIdentity: String(row.mappingIdentity),
      sourceUnitIdentity: String(row.sourceUnitIdentity),
      targetUnitIdentity: String(row.targetUnitIdentity),
      sourceLayer: String(row.sourceLayer) as ArchitectureUnitMappingProjection["sourceLayer"],
      targetLayer: String(row.targetLayer) as ArchitectureUnitMappingProjection["targetLayer"],
      mappingFamily: String(row.mappingFamily),
      relationshipCount: Number(row.relationshipCount),
      evidenceCount: Number(row.evidenceCount),
      confidence: Number(row.confidence),
      contentDigest: String(row.contentDigest)
    }));
  }

  async readAssetCoverage(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<Asset3AMappingCoverageSource>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.architectureAssetCoverageProjection, { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, generationId: source.coverageGenerationId, baselineId: scope.baselineId, manifestId: source.sourceCoverageManifestId, ...(cursor ? { dbId: { gt: cursor } } : {}) }, cursor, limit, (row) => ({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      generationId: source.coverageGenerationId,
      baselineId: scope.baselineId,
      manifestId: source.sourceCoverageManifestId,
      assetType: String(row.assetType),
      assetId: String(row.assetId),
      role: String(row.role) as Asset3AMappingCoverageSource["role"],
      status: String(row.status) as Asset3AMappingCoverageSource["status"],
      ...(typeof row.terminalMemberId === "string" ? { terminalMemberId: row.terminalMemberId } : {}),
      pathEvidence: jsonPathEvidence(row.pathEvidence),
      ...(typeof row.reasonCode === "string" ? { reasonCode: row.reasonCode } : {}),
      ...(typeof row.diagnosticRef === "string" ? { diagnosticRef: row.diagnosticRef } : {}),
      ...(typeof row.sourceDigest === "string" ? { sourceDigest: row.sourceDigest } : {}),
      rowDigest: String(row.rowDigest)
    }));
  }

  async readAssetRelationships(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssetRelationshipSource>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.relationshipCurrent, { enterpriseId: scope.enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, lifecycleStatus: "ACTIVE", ...(cursor ? { dbId: { gt: cursor } } : {}) }, cursor, limit, (row) => {
      const sourceNode = row.sourceNode as Record<string, unknown>;
      const targetNode = row.targetNode as Record<string, unknown>;
      return {
        relationshipIdentity: String(row.dbId),
        sourceAssetType: String(sourceNode.rootAssetType),
        sourceAssetId: String(sourceNode.rootAssetId),
        targetAssetType: String(targetNode.rootAssetType),
        targetAssetId: String(targetNode.rootAssetId),
        relationCode: String(row.relationType),
        confidence: Number(row.confidence),
        relationshipVersion: String(row.version),
        projectionOrdinal: BigInt(row.version as string | number | bigint),
        contentDigest: String(row.dbId)
      };
    }, { include: { sourceNode: true, targetNode: true }, source });
  }

  async readAssertionRelationships(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<SemanticAssertionRelationshipSource>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.knowledgeProjectionEdge, { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, generationId: source.knowledgeGenerationId, baselineId: scope.baselineId, ...(cursor ? { dbId: { gt: cursor } } : {}) }, cursor, limit, (row) => ({
      relationshipIdentity: String(row.relationshipIdentity),
      sourceAssertionId: String(row.sourceAssertionId),
      targetAssertionId: String(row.targetAssertionId),
      relationCode: String(row.relationCode),
      confidence: Number(row.confidence),
      relationshipVersion: String(row.relationshipVersion),
      projectionOrdinal: BigInt(row.dbId as string),
      contentDigest: String(row.contentDigest)
    }));
  }

  async readArchitectureRelationships(scope: SemanticGenerationScope, cursor: string | null, limit: number): Promise<SemanticPage<SemanticArchitectureRelationshipSource>> {
    const source = await this.validatedSource(scope);
    return this.page(this.prisma.architectureUnitMappingProjection, projectionWhere(scope, source, cursor), cursor, limit, (row) => ({
      relationshipIdentity: String(row.mappingIdentity),
      sourceUnitIdentity: String(row.sourceUnitIdentity),
      targetUnitIdentity: String(row.targetUnitIdentity),
      relationCode: String(row.mappingFamily),
      confidence: Number(row.confidence),
      projectionOrdinal: 1n,
      contentDigest: String(row.contentDigest)
    }));
  }

  private async validatedSource(scope: SemanticGenerationScope): Promise<SemanticSourceBinding> {
    const source = await this.readSourceBinding(scope);
    if (source.sourceProjectionManifestId === scope.manifestId || source.knowledgeGenerationId !== scope.generationId || source.semanticSchemaVersion !== "nebula.3a.semantic.v1") throw new Error("SEMANTIC_SOURCE_MANIFEST_MISMATCH");
    return source;
  }

  private async page<T>(delegate: FindManyDelegate, where: Record<string, unknown>, cursor: string | null, limit: number, map: (row: Record<string, unknown>) => T, extra: Record<string, unknown> = {}): Promise<SemanticPage<T>> {
    assertLimit(limit);
    const rows = await delegate.findMany({ where, orderBy: { dbId: "asc" }, take: limit + 1, ...extra });
    const pageRows = rows.slice(0, limit);
    return {
      items: pageRows.map(map),
      nextCursor: rows.length > limit ? String(pageRows.at(-1)?.dbId ?? "") : null,
      source: { applicationServiceId: String(where.applicationServiceId), scopePath: String(where.scopePath), baselineId: String(where.baselineId ?? ""), generationId: String(where.generationId ?? ""), manifestId: String(where.projectionManifestId ?? "") }
    };
  }

  private assetWhere(scope: SemanticGenerationScope, source: SemanticSourceBinding, cursor: string | null): Record<string, unknown> {
    return { enterpriseId: scope.enterpriseId, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, lifecycleStatus: "ACTIVE", ...(cursor ? { dbId: { gt: cursor } } : {}), sourceProjectionManifestId: source.sourceProjectionManifestId };
  }
}

function projectionWhere(scope: SemanticGenerationScope, source: SemanticSourceBinding, cursor: string | null): Record<string, unknown> {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, generationId: scope.generationId, baselineId: scope.baselineId, projectionManifestId: source.sourceProjectionManifestId, ...(cursor ? { dbId: { gt: cursor } } : {}) };
}

function assertScope(scope: SemanticGenerationScope): void {
  if (!scope.applicationServiceId || !scope.scopePath || !scope.baselineId || !scope.generationId || !scope.manifestId) throw new Error("SEMANTIC_SCOPE_REQUIRED");
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit <= 0 || limit > 10_000) throw new Error("SEMANTIC_PAGE_LIMIT_INVALID");
}

function jsonStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function jsonPathEvidence(value: unknown): Asset3AMappingCoverageSource["pathEvidence"] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item)).map((item) => ({
    relationshipIdentity: String(item.relationshipIdentity ?? ""),
    sourceSemanticIdentity: String(item.sourceSemanticIdentity ?? ""),
    targetSemanticIdentity: String(item.targetSemanticIdentity ?? ""),
    relationCode: String(item.relationCode ?? "")
  }));
}
