import { DEFAULT_ARCHITECTURE_MAP_BUDGET, materializeAsset3AMappings, validateArchitectureMapBudget, type ArchitectureLayer, type ArchitectureMapBudget, type ArchitectureScopeRef, type ArchitectureUnitFilter, type ArchitectureUnitKind, type Asset3AMappingProjection } from "@specforge/core";
import { prisma, readableScope } from "../persistence";

export interface Search3aArchitectureMapInput {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  projectionManifestId: string;
  filters?: ArchitectureUnitFilter;
  budget?: Partial<ArchitectureMapBudget>;
}

export interface ArchitectureMapSearchResult {
  status: "READY" | "EMPTY" | "PARTIAL";
  identity: ArchitectureScopeRef & { generationId: string; baselineId: string; projectionManifestId: string };
  units: ArchitectureUnitRecord[];
  realizations: ArchitectureMappingRecord[];
  /** @deprecated Use realizations. */
  mappings: ArchitectureMappingRecord[];
  totalByLayer: Record<ArchitectureLayer, number>;
  returnedByLayer: Record<ArchitectureLayer, number>;
  unclassifiedCount: number;
  partial?: { code: "RESULT_PARTIAL"; reasons: string[] };
}

export interface Search3aAssetMappingsInput {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  projectionManifestId: string;
  filters?: { assetType?: string; assetId?: string; layer?: ArchitectureLayer; unitIdentity?: string; mappingMode?: Asset3AMappingProjection["mappingMode"]; query?: string };
  limit?: number;
  cursor?: string;
}

export interface Get3aAssetMappingInput {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  projectionManifestId: string;
  assetType: string;
  assetId: string;
}

export interface Asset3AMappingSearchResult extends ArchitectureScopeRef {
  status: "READY" | "EMPTY" | "PARTIAL";
  identity: ArchitectureScopeRef & { generationId: string; baselineId: string; projectionManifestId: string };
  total: number;
  rows: Asset3AMappingProjection[];
  nextCursor?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: string[] };
}

export interface ArchitectureUnitRecord {
  applicationServiceId: string;
  scopePath: string;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  unitIdentity: string;
  layer: ArchitectureLayer;
  kind: ArchitectureUnitKind;
  parentUnitIdentity?: string;
  canonicalName: string;
  localizedName?: string;
  aliases: string[];
  memberCount: number;
  criticality: number;
  completeness: number;
  evidenceCount: number;
  unclassifiedMemberCount: number;
  contentDigest: string;
}

export interface ArchitectureMappingRecord {
  applicationServiceId: string;
  scopePath: string;
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  mappingIdentity: string;
  sourceUnitIdentity: string;
  targetUnitIdentity: string;
  sourceLayer: ArchitectureLayer;
  targetLayer: ArchitectureLayer;
  mappingFamily: string;
  relationshipCount: number;
  evidenceCount: number;
  confidence: number;
  contentDigest: string;
}

export interface ArchitectureUnitNeighborhoodInput {
  identity: { architectureScope: ArchitectureScopeRef; generationId: string; baselineId: string; projectionManifestId: string };
  unitIdentity: string;
  direction: "upstream" | "downstream" | "both";
  depth: number;
  memberAssetTypes?: string[];
  mappingFamilies?: string[];
  budget?: Partial<ArchitectureMapBudget>;
}

export interface ArchitectureUnitMemberRecord extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  unitIdentity: string;
  assertionId: string;
  assetType?: string;
  semanticIdentity: string;
  contentDigest: string;
}

export interface ArchitectureDependencyRecord extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  relationshipIdentity: string;
  relationshipAssertionId?: string;
  relationshipEventId?: string;
  sourceAssertionId: string;
  targetAssertionId: string;
  sourceSemanticIdentity: string;
  targetSemanticIdentity: string;
  relationCode: string;
  confidence: number;
  relationshipVersion: string;
  contentDigest: string;
}

export interface ArchitectureUnitNeighborhoodResult {
  status: "READY" | "EMPTY" | "PARTIAL";
  identity: ArchitectureScopeRef & { generationId: string; baselineId: string; projectionManifestId: string };
  unit: ArchitectureUnitRecord;
  adjacentUnits: ArchitectureUnitRecord[];
  members: ArchitectureUnitMemberRecord[];
  mappings: ArchitectureMappingRecord[];
  sameLayerDependencies: ArchitectureDependencyRecord[];
  evidence: {
    unitEvidenceCount: number;
    mappingEvidenceCount: number;
    memberDigests: string[];
    mappingDigests: string[];
    dependencyDigests: string[];
  };
  partial?: { code: "RESULT_PARTIAL"; reasons: string[] };
}

type ManifestRow = { id: string; baselineId: string; generationId: string | null; publishedAt: Date | null };

type ArchitectureMapReadClient = {
  projectionManifest: { findFirst(args: { where: Record<string, unknown>; select: Record<string, boolean> }): Promise<ManifestRow | null> };
  architectureUnitProjection: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findFirst(args: { where: Record<string, unknown>; orderBy?: unknown }): Promise<unknown | null>;
    findMany(args: { where: Record<string, unknown>; orderBy: unknown; take: number }): Promise<unknown[]>;
  };
  architectureUnitMemberProjection: {
    findMany(args: { where: Record<string, unknown>; orderBy: unknown; take: number }): Promise<unknown[]>;
  };
  architectureUnitMappingProjection: {
    findMany(args: { where: Record<string, unknown>; orderBy?: unknown; select?: Record<string, boolean>; take?: number }): Promise<unknown[]>;
  };
  architectureAssetCoverageProjection: {
    findMany(args: { where: Record<string, unknown>; orderBy: unknown; take: number }): Promise<unknown[]>;
  };
  architectureCoverageManifest: {
    findFirst(args: { where: Record<string, unknown>; orderBy?: unknown }): Promise<{ generationId: string; id: string } | null>;
  };
  knowledgeProjectionEdge: {
    findMany(args: { where: Record<string, unknown>; orderBy: unknown; take: number }): Promise<unknown[]>;
  };
};

export async function search3aAssetMappings(input: Search3aAssetMappingsInput): Promise<Asset3AMappingSearchResult> {
  const scope = readableScope(input.architectureScope.applicationServiceId);
  assertExactScope(scope, input.architectureScope);
  assertRequiredText(input.baselineId, "ASSET_3A_MAPPING_BASELINE_REQUIRED");
  assertRequiredText(input.projectionManifestId, "ASSET_3A_MAPPING_MANIFEST_REQUIRED");
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error("ASSET_3A_MAPPING_LIMIT_INVALID");
  const client = prisma as unknown as ArchitectureMapReadClient;
  const manifest = await client.projectionManifest.findFirst({ where: { ...scope, id: input.projectionManifestId, baselineId: input.baselineId, publishedAt: { not: null } }, select: { id: true, baselineId: true, generationId: true, publishedAt: true } });
  if (!manifest?.generationId) throw new Error("ASSET_3A_MAPPING_PROJECTION_NOT_FOUND");
  const identity = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id };
  const coverageManifest = await client.architectureCoverageManifest.findFirst({ where: { ...scope, baselineId: identity.baselineId, publicationState: "PUBLISHED" }, orderBy: [{ publishedAt: "desc" }, { id: "asc" }] });
  if (!coverageManifest) throw new Error("ASSET_3A_MAPPING_COVERAGE_NOT_FOUND");
  const coverageRows = await client.architectureAssetCoverageProjection.findMany({ where: { ...scope, generationId: coverageManifest.generationId, baselineId: identity.baselineId }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }], take: 1001 });
  if (coverageRows.length > 1000) throw new Error("ASSET_3A_MAPPING_SOURCE_TOO_LARGE");
  const memberRows = await client.architectureUnitMemberProjection.findMany({ where: identity, orderBy: [{ semanticIdentity: "asc" }, { assertionId: "asc" }], take: 10001 });
  const unitRows = await client.architectureUnitProjection.findMany({ where: identity, orderBy: [{ unitIdentity: "asc" }], take: 1001 });
  const rows = materializeAsset3AMappings({ ...identity, coverageGenerationId: coverageManifest.generationId, coverage: coverageRows.map(toCoverageSource), members: memberRows.map(toMember), units: unitRows.map(toUnit) }).filter((row) => {
    const filters = input.filters ?? {};
    return (!filters.assetType || row.assetType === filters.assetType)
      && (!filters.assetId || row.assetId === filters.assetId)
      && (!filters.layer || row.targetLayer === filters.layer)
      && (!filters.unitIdentity || row.targetUnitIdentity === filters.unitIdentity)
      && (!filters.mappingMode || row.mappingMode === filters.mappingMode)
      && (!filters.query || `${row.assetId} ${row.semanticIdentity} ${row.targetUnitIdentity ?? ""}`.toLowerCase().includes(filters.query.toLowerCase()));
  });
  const after = input.cursor ? decodeAssetMappingCursor(input.cursor) : undefined;
  const filtered = after ? rows.filter((row) => `${row.assetType}:${row.assetId}` > after) : rows;
  const selected = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;
  return { ...scope, status: selected.length ? (hasMore ? "PARTIAL" : "READY") : "EMPTY", identity, total: rows.length, rows: selected, ...(hasMore && selected.at(-1) ? { nextCursor: encodeAssetMappingCursor(selected.at(-1)!) } : {}), ...(hasMore ? { partial: { code: "RESULT_PARTIAL", reasons: ["CONTINUATION_REQUIRED"] } } : {}) };
}

export async function get3aAssetMapping(input: Get3aAssetMappingInput): Promise<Asset3AMappingProjection> {
  assertRequiredText(input.assetType, "ASSET_3A_MAPPING_ASSET_TYPE_REQUIRED");
  assertRequiredText(input.assetId, "ASSET_3A_MAPPING_ASSET_ID_REQUIRED");
  const result = await search3aAssetMappings({
    architectureScope: input.architectureScope,
    baselineId: input.baselineId,
    projectionManifestId: input.projectionManifestId,
    filters: { assetType: input.assetType, assetId: input.assetId },
    limit: 1
  });
  const row = result.rows[0];
  if (!row || row.assetType !== input.assetType || row.assetId !== input.assetId) throw new Error("ASSET_3A_MAPPING_NOT_FOUND");
  return row;
}

export async function search3aArchitectureRealizations(input: Search3aArchitectureMapInput): Promise<ArchitectureMapSearchResult> {
  return search3aArchitectureMap(input);
}

export async function search3aArchitectureMap(input: Search3aArchitectureMapInput): Promise<ArchitectureMapSearchResult> {
  const scope = readableScope(input.architectureScope.applicationServiceId);
  assertExactScope(scope, input.architectureScope);
  assertRequiredText(input.baselineId, "ARCHITECTURE_MAP_BASELINE_REQUIRED");
  assertRequiredText(input.projectionManifestId, "ARCHITECTURE_MAP_PROJECTION_MANIFEST_REQUIRED");

  const budget = normalizeBudget(input.budget);
  const filters = normalizeFilters(input.filters);
  const client = prisma as unknown as ArchitectureMapReadClient;
  const manifest = await client.projectionManifest.findFirst({
    where: {
      ...scope,
      id: input.projectionManifestId,
      baselineId: input.baselineId,
      publishedAt: { not: null }
    },
    select: { id: true, baselineId: true, generationId: true, publishedAt: true }
  });
  if (!manifest?.generationId) throw new Error("ARCHITECTURE_MAP_PROJECTION_NOT_FOUND");

  const identity = {
    ...scope,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    projectionManifestId: manifest.id
  };
  const mappingUnitIds = await loadMappingUnitIds(client, identity, filters.mappingFamilies, budget.maxMappings + 1);
  const baseWhere = unitWhere(identity, filters, mappingUnitIds);
  const layers: ArchitectureLayer[] = filters.layers?.length ? filters.layers : ["BIZ", "SYS", "TECH"];
  const totalByLayer = Object.fromEntries(await Promise.all(
    (["BIZ", "SYS", "TECH"] as const).map(async (layer) => [layer, await client.architectureUnitProjection.count({ where: { ...baseWhere, layer } })] as const)
  )) as Record<ArchitectureLayer, number>;
  const rowsByLayer = await Promise.all(layers.map(async (layer) => client.architectureUnitProjection.findMany({
    where: { ...baseWhere, layer },
    orderBy: [{ parentUnitIdentity: "asc" }, { criticality: "desc" }, { canonicalName: "asc" }, { unitIdentity: "asc" }],
    take: budget.maxUnitsPerLayer + 1
  })));
  const unitRows = rowsByLayer.flatMap((rows) => rows.slice(0, budget.maxUnitsPerLayer).map(toUnit));
  const units = unitRows.sort(compareUnits);
  const returnedByLayer = { BIZ: 0, SYS: 0, TECH: 0 } as Record<ArchitectureLayer, number>;
  for (const unit of units) returnedByLayer[unit.layer] += 1;

  const mappingRows = await client.architectureUnitMappingProjection.findMany({
    where: {
      ...identity,
      ...(filters.mappingFamilies?.length ? { mappingFamily: { in: filters.mappingFamilies } } : {}),
      sourceUnitIdentity: { in: units.map((unit) => unit.unitIdentity) },
      targetUnitIdentity: { in: units.map((unit) => unit.unitIdentity) }
    },
    orderBy: [{ sourceUnitIdentity: "asc" }, { targetUnitIdentity: "asc" }, { mappingFamily: "asc" }, { mappingIdentity: "asc" }],
    take: budget.maxMappings + 1
  });
  const mappings = mappingRows.slice(0, budget.maxMappings).map(toMapping);
  const reasons = [
    ...(rowsByLayer.some((rows) => rows.length > budget.maxUnitsPerLayer) ? ["UNIT_BUDGET_EXCEEDED", "CONTINUATION_REQUIRED"] : []),
    ...(mappingRows.length > budget.maxMappings ? ["MAPPING_BUDGET_EXCEEDED", "CONTINUATION_REQUIRED"] : [])
  ];
  const unclassifiedCount = await client.architectureUnitProjection.count({ where: { ...identity, unclassifiedMemberCount: { gt: 0 } } });
  const result: ArchitectureMapSearchResult = {
    status: reasons.length ? "PARTIAL" : units.length || mappings.length ? "READY" : "EMPTY",
    identity,
    units,
    realizations: mappings,
    mappings,
    totalByLayer,
    returnedByLayer,
    unclassifiedCount,
    ...(reasons.length ? { partial: { code: "RESULT_PARTIAL", reasons } } : {})
  };
  while (Buffer.byteLength(JSON.stringify(result), "utf8") > budget.maxPayloadBytes && (result.mappings.length > 0 || result.units.length > 0)) {
    if (result.mappings.length > 0) result.mappings.pop();
    else result.units.pop();
    result.returnedByLayer = { BIZ: 0, SYS: 0, TECH: 0 };
    for (const unit of result.units) result.returnedByLayer[unit.layer] += 1;
  }
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > budget.maxPayloadBytes) {
    result.status = "PARTIAL";
    result.partial = { code: "RESULT_PARTIAL", reasons: [...(result.partial?.reasons ?? []), "PAYLOAD_BUDGET_EXCEEDED"] };
  } else if (result.units.length < unitRows.length || result.mappings.length < mappingRows.length) {
    result.status = "PARTIAL";
    result.partial = { code: "RESULT_PARTIAL", reasons: [...(result.partial?.reasons ?? []), "PAYLOAD_BUDGET_EXCEEDED"] };
  }
  return result;
}

export async function get3aArchitectureUnitNeighborhood(input: ArchitectureUnitNeighborhoodInput): Promise<ArchitectureUnitNeighborhoodResult> {
  const scope = readableScope(input.identity.architectureScope.applicationServiceId);
  assertExactScope(scope, input.identity.architectureScope);
  assertExactIdentityText(input.identity.generationId, "ARCHITECTURE_MAP_GENERATION_REQUIRED");
  assertRequiredText(input.identity.baselineId, "ARCHITECTURE_MAP_BASELINE_REQUIRED");
  assertRequiredText(input.identity.projectionManifestId, "ARCHITECTURE_MAP_PROJECTION_MANIFEST_REQUIRED");
  assertUnitIdentity(input.unitIdentity);
  if (!["upstream", "downstream", "both"].includes(input.direction)) throw new Error("ARCHITECTURE_MAP_DIRECTION_INVALID");
  if (!Number.isInteger(input.depth) || input.depth < 1 || input.depth > 5) throw new Error("ARCHITECTURE_MAP_DEPTH_INVALID");

  const budget = normalizeBudget(input.budget);
  const identity = {
    ...scope,
    generationId: input.identity.generationId,
    baselineId: input.identity.baselineId,
    projectionManifestId: input.identity.projectionManifestId
  };
  const client = prisma as unknown as ArchitectureMapReadClient;
  const manifest = await client.projectionManifest.findFirst({
    where: { ...scope, generationId: identity.generationId, baselineId: identity.baselineId, id: identity.projectionManifestId, publishedAt: { not: null } },
    select: { id: true, baselineId: true, generationId: true, publishedAt: true }
  });
  if (!manifest?.generationId || manifest.generationId !== identity.generationId) throw new Error("ARCHITECTURE_MAP_GENERATION_MISMATCH");

  const unit = await client.architectureUnitProjection.findFirst({ where: { ...identity, unitIdentity: input.unitIdentity } });
  if (!unit) throw new Error("ARCHITECTURE_UNIT_NOT_FOUND");
  const selectedUnit = toUnit(unit);
  const memberRows = await client.architectureUnitMemberProjection.findMany({
    where: {
      ...identity,
      unitIdentity: input.unitIdentity,
      ...(input.memberAssetTypes?.length ? { assetType: { in: [...new Set(input.memberAssetTypes)] } } : {})
    },
    orderBy: [{ semanticIdentity: "asc" }, { assertionId: "asc" }],
    take: budget.maxMappings + 1
  });
  const members = memberRows.slice(0, budget.maxMappings).map(toMember);
  const memberAssertionIds = members.map((member) => member.assertionId);
  const { projectionManifestId: _projectionManifestId, ...edgeIdentity } = identity;
  const sameLayerRows = memberAssertionIds.length === 0 ? [] : await client.knowledgeProjectionEdge.findMany({
    where: {
      ...edgeIdentity,
      OR: [
        { sourceAssertionId: { in: memberAssertionIds }, targetAssertionId: { in: memberAssertionIds } }
      ]
    },
    orderBy: [{ sourceAssertionId: "asc" }, { targetAssertionId: "asc" }, { relationCode: "asc" }, { relationshipIdentity: "asc" }],
    take: budget.maxMappings + 1
  });
  const sameLayerDependencies = sameLayerRows.slice(0, budget.maxMappings).map(toDependency);

  const traversal = await loadNeighborhoodMappings(client, identity, input.unitIdentity, input.direction, input.depth, input.mappingFamilies, budget.maxMappings);
  const mappings = traversal.mappings;
  const adjacentIds = [...traversal.unitIds].filter((unitId) => unitId !== input.unitIdentity);
  const adjacentRows = adjacentIds.length === 0 ? [] : await client.architectureUnitProjection.findMany({
    where: { ...identity, unitIdentity: { in: adjacentIds } },
    orderBy: [{ parentUnitIdentity: "asc" }, { criticality: "desc" }, { canonicalName: "asc" }, { unitIdentity: "asc" }],
    take: budget.maxUnitsPerLayer * 3 + 1
  });
  const adjacentUnits = adjacentRows.slice(0, budget.maxUnitsPerLayer * 3).map(toUnit).sort(compareUnits);
  const reasons = [
    ...(memberRows.length > budget.maxMappings ? ["MEMBER_BUDGET_EXCEEDED"] : []),
    ...(sameLayerRows.length > budget.maxMappings ? ["DEPENDENCY_BUDGET_EXCEEDED"] : []),
    ...(traversal.partial ? ["MAPPING_BUDGET_EXCEEDED", "DEPTH_OR_MAPPING_BOUND_REACHED"] : []),
    ...(adjacentRows.length > budget.maxUnitsPerLayer * 3 ? ["UNIT_BUDGET_EXCEEDED"] : [])
  ];
  const result: ArchitectureUnitNeighborhoodResult = {
    status: reasons.length ? "PARTIAL" : members.length || mappings.length || sameLayerDependencies.length ? "READY" : "EMPTY",
    identity,
    unit: selectedUnit,
    adjacentUnits,
    members,
    mappings,
    sameLayerDependencies,
    evidence: {
      unitEvidenceCount: selectedUnit.evidenceCount,
      mappingEvidenceCount: mappings.reduce((sum, mapping) => sum + mapping.evidenceCount, 0),
      memberDigests: members.map((member) => member.contentDigest),
      mappingDigests: mappings.map((mapping) => mapping.contentDigest),
      dependencyDigests: sameLayerDependencies.map((dependency) => dependency.contentDigest)
    },
    ...(reasons.length ? { partial: { code: "RESULT_PARTIAL", reasons } } : {})
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > budget.maxPayloadBytes) {
    result.status = "PARTIAL";
    result.partial = { code: "RESULT_PARTIAL", reasons: [...(result.partial?.reasons ?? []), "PAYLOAD_BUDGET_EXCEEDED"] };
  }
  return result;
}

async function loadNeighborhoodMappings(
  client: ArchitectureMapReadClient,
  identity: ArchitectureUnitNeighborhoodResult["identity"],
  selectedUnitIdentity: string,
  direction: ArchitectureUnitNeighborhoodInput["direction"],
  depth: number,
  mappingFamilies: string[] | undefined,
  maxMappings: number
): Promise<{ mappings: ArchitectureMappingRecord[]; unitIds: Set<string>; partial: boolean }> {
  const mappings: ArchitectureMappingRecord[] = [];
  const unitIds = new Set([selectedUnitIdentity]);
  let frontier = new Set([selectedUnitIdentity]);
  let partial = false;
  for (let level = 0; level < depth && frontier.size > 0; level += 1) {
    const remaining = maxMappings - mappings.length;
    if (remaining <= 0) {
      partial = true;
      break;
    }
    const rows = await client.architectureUnitMappingProjection.findMany({
      where: {
        ...identity,
        ...(mappingFamilies?.length ? { mappingFamily: { in: [...new Set(mappingFamilies)] } } : {}),
        OR: [
          { sourceUnitIdentity: { in: [...frontier] } },
          { targetUnitIdentity: { in: [...frontier] } }
        ]
      },
      orderBy: [{ sourceUnitIdentity: "asc" }, { targetUnitIdentity: "asc" }, { mappingFamily: "asc" }, { mappingIdentity: "asc" }],
      take: remaining + 1
    });
    if (rows.length > remaining) partial = true;
    const nextFrontier = new Set<string>();
    for (const row of rows.slice(0, remaining).map(toMapping)) {
      const followsDirection = direction === "both"
        || direction === "downstream" && frontier.has(row.sourceUnitIdentity)
        || direction === "upstream" && frontier.has(row.targetUnitIdentity);
      if (!followsDirection || mappings.some((mapping) => mapping.mappingIdentity === row.mappingIdentity)) continue;
      mappings.push(row);
      const neighbor = frontier.has(row.sourceUnitIdentity) ? row.targetUnitIdentity : row.sourceUnitIdentity;
      if (!unitIds.has(neighbor)) {
        unitIds.add(neighbor);
        nextFrontier.add(neighbor);
      }
    }
    frontier = nextFrontier;
  }
  return { mappings: mappings.sort(compareMappings), unitIds, partial };
}

function normalizeBudget(budget: Partial<ArchitectureMapBudget> | undefined): ArchitectureMapBudget {
  const normalized = { ...DEFAULT_ARCHITECTURE_MAP_BUDGET, ...(budget ?? {}) };
  return validateArchitectureMapBudget(normalized);
}

function normalizeFilters(filters: ArchitectureUnitFilter | undefined): ArchitectureUnitFilter {
  if (!filters) return {};
  return {
    ...(filters.layers?.length ? { layers: [...new Set(filters.layers)] } : {}),
    ...(filters.kinds?.length ? { kinds: [...new Set(filters.kinds)] } : {}),
    ...(filters.mappingFamilies?.length ? { mappingFamilies: [...new Set(filters.mappingFamilies.filter(Boolean))] } : {}),
    ...(filters.minCriticality !== undefined ? { minCriticality: filters.minCriticality } : {}),
    ...(filters.minCompleteness !== undefined ? { minCompleteness: filters.minCompleteness } : {}),
    ...(filters.includeUnclassified !== undefined ? { includeUnclassified: filters.includeUnclassified } : {}),
    ...(filters.query?.trim() ? { query: filters.query.trim() } : {})
  };
}

function unitWhere(identity: ArchitectureMapSearchResult["identity"], filters: ArchitectureUnitFilter, mappingUnitIds: string[]): Record<string, unknown> {
  return {
    ...identity,
    ...(filters.kinds?.length ? { kind: { in: filters.kinds } } : {}),
    ...(filters.minCriticality !== undefined ? { criticality: { gte: filters.minCriticality } } : {}),
    ...(filters.minCompleteness !== undefined ? { completeness: { gte: filters.minCompleteness } } : {}),
    ...(filters.includeUnclassified === false ? { unclassifiedMemberCount: 0 } : {}),
    ...(mappingUnitIds.length || filters.mappingFamilies?.length ? { unitIdentity: { in: mappingUnitIds } } : {}),
    ...(filters.query ? { canonicalName: { contains: filters.query, mode: "insensitive" } } : {})
  };
}

async function loadMappingUnitIds(client: ArchitectureMapReadClient, identity: ArchitectureMapSearchResult["identity"], mappingFamilies: string[] | undefined, limit: number): Promise<string[]> {
  if (!mappingFamilies?.length) return [];
  const rows = await client.architectureUnitMappingProjection.findMany({
    where: { ...identity, mappingFamily: { in: mappingFamilies } },
    select: { sourceUnitIdentity: true, targetUnitIdentity: true },
    take: limit
  });
  return [...new Set(rows.flatMap((row) => [String((row as { sourceUnitIdentity: string }).sourceUnitIdentity), String((row as { targetUnitIdentity: string }).targetUnitIdentity)]))];
}

function toUnit(row: unknown): ArchitectureUnitRecord {
  const value = row as Record<string, unknown>;
  return {
    applicationServiceId: String(value.applicationServiceId),
    scopePath: String(value.scopePath),
    generationId: String(value.generationId),
    baselineId: String(value.baselineId),
    projectionManifestId: String(value.projectionManifestId),
    unitIdentity: String(value.unitIdentity),
    layer: value.layer as ArchitectureLayer,
    kind: value.kind as ArchitectureUnitKind,
    ...(typeof value.parentUnitIdentity === "string" ? { parentUnitIdentity: value.parentUnitIdentity } : {}),
    canonicalName: String(value.canonicalName),
    ...(typeof value.localizedName === "string" ? { localizedName: value.localizedName } : {}),
    aliases: Array.isArray(value.aliases) ? value.aliases.filter((item): item is string => typeof item === "string") : [],
    memberCount: Number(value.memberCount),
    criticality: Number(value.criticality),
    completeness: Number(value.completeness),
    evidenceCount: Number(value.evidenceCount),
    unclassifiedMemberCount: Number(value.unclassifiedMemberCount),
    contentDigest: String(value.contentDigest)
  };
}

function toMapping(row: unknown): ArchitectureMappingRecord {
  const value = row as Record<string, unknown>;
  return {
    applicationServiceId: String(value.applicationServiceId),
    scopePath: String(value.scopePath),
    generationId: String(value.generationId),
    baselineId: String(value.baselineId),
    projectionManifestId: String(value.projectionManifestId),
    mappingIdentity: String(value.mappingIdentity),
    sourceUnitIdentity: String(value.sourceUnitIdentity),
    targetUnitIdentity: String(value.targetUnitIdentity),
    sourceLayer: value.sourceLayer as ArchitectureLayer,
    targetLayer: value.targetLayer as ArchitectureLayer,
    mappingFamily: String(value.mappingFamily),
    relationshipCount: Number(value.relationshipCount),
    evidenceCount: Number(value.evidenceCount),
    confidence: Number(value.confidence),
    contentDigest: String(value.contentDigest)
  };
}

function toMember(row: unknown): ArchitectureUnitMemberRecord {
  const value = row as Record<string, unknown>;
  return {
    applicationServiceId: String(value.applicationServiceId),
    scopePath: String(value.scopePath),
    generationId: String(value.generationId),
    baselineId: String(value.baselineId),
    projectionManifestId: String(value.projectionManifestId),
    unitIdentity: String(value.unitIdentity),
    assertionId: String(value.assertionId),
    ...(typeof value.assetType === "string" ? { assetType: value.assetType } : {}),
    semanticIdentity: String(value.semanticIdentity),
    contentDigest: String(value.contentDigest)
  };
}

function toDependency(row: unknown): ArchitectureDependencyRecord {
  const value = row as Record<string, unknown>;
  return {
    applicationServiceId: String(value.applicationServiceId),
    scopePath: String(value.scopePath),
    generationId: String(value.generationId),
    baselineId: String(value.baselineId),
    relationshipIdentity: String(value.relationshipIdentity),
    ...(typeof value.relationshipAssertionId === "string" ? { relationshipAssertionId: value.relationshipAssertionId } : {}),
    ...(typeof value.relationshipEventId === "string" ? { relationshipEventId: value.relationshipEventId } : {}),
    sourceAssertionId: String(value.sourceAssertionId),
    targetAssertionId: String(value.targetAssertionId),
    sourceSemanticIdentity: String(value.sourceSemanticIdentity),
    targetSemanticIdentity: String(value.targetSemanticIdentity),
    relationCode: String(value.relationCode),
    confidence: Number(value.confidence),
    relationshipVersion: String(value.relationshipVersion),
    contentDigest: String(value.contentDigest)
  };
}

function toCoverageSource(row: unknown) {
  const value = row as Record<string, unknown>;
  return {
    applicationServiceId: String(value.applicationServiceId),
    scopePath: String(value.scopePath),
    generationId: String(value.generationId),
    baselineId: String(value.baselineId),
    manifestId: String(value.manifestId),
    assetType: String(value.assetType),
    assetId: String(value.assetId),
    role: value.role as "MEMBERSHIP" | "TRACEABILITY" | "EXEMPTION",
    status: value.status as "COVERED" | "BLOCKED" | "NOT_EVALUATED",
    ...(typeof value.terminalMemberId === "string" ? { terminalMemberId: value.terminalMemberId } : {}),
    pathEvidence: Array.isArray(value.pathEvidence) ? value.pathEvidence as never[] : [],
    ...(typeof value.reasonCode === "string" ? { reasonCode: value.reasonCode } : {}),
    ...(typeof value.diagnosticRef === "string" ? { diagnosticRef: value.diagnosticRef } : {}),
    ...(typeof value.sourceDigest === "string" ? { sourceDigest: value.sourceDigest } : {}),
    rowDigest: String(value.rowDigest)
  };
}

function encodeAssetMappingCursor(row: Pick<Asset3AMappingProjection, "assetType" | "assetId">): string { return Buffer.from(`${row.assetType}\u0000${row.assetId}`, "utf8").toString("base64url"); }
function decodeAssetMappingCursor(value: string): string { try { const decoded = Buffer.from(value, "base64url").toString("utf8"); if (!decoded.includes("\u0000")) throw new Error(); return decoded.replace("\u0000", ":"); } catch { throw new Error("ASSET_3A_MAPPING_CURSOR_INVALID"); } }

function compareUnits(left: ArchitectureUnitRecord, right: ArchitectureUnitRecord): number {
  return (left.parentUnitIdentity ?? "").localeCompare(right.parentUnitIdentity ?? "", "en")
    || right.criticality - left.criticality
    || left.canonicalName.localeCompare(right.canonicalName, "en")
    || left.unitIdentity.localeCompare(right.unitIdentity, "en");
}

function compareMappings(left: ArchitectureMappingRecord, right: ArchitectureMappingRecord): number {
  return left.sourceUnitIdentity.localeCompare(right.sourceUnitIdentity, "en")
    || left.targetUnitIdentity.localeCompare(right.targetUnitIdentity, "en")
    || left.mappingFamily.localeCompare(right.mappingFamily, "en")
    || left.mappingIdentity.localeCompare(right.mappingIdentity, "en");
}

function assertExactScope(expected: ArchitectureScopeRef, actual: ArchitectureScopeRef): void {
  if (expected.applicationServiceId !== actual.applicationServiceId || expected.scopePath !== actual.scopePath) throw new Error("ARCHITECTURE_SCOPE_MISMATCH");
}

function assertRequiredText(value: string, code: string): void {
  if (typeof value !== "string" || !value.trim()) throw new Error(code);
}

function assertExactIdentityText(value: string, code: string): void {
  assertRequiredText(value, code);
}

function assertUnitIdentity(value: string): void {
  assertRequiredText(value, "ARCHITECTURE_UNIT_IDENTITY_REQUIRED");
  if (!value.startsWith("unit:")) throw new Error("ARCHITECTURE_UNIT_IDENTITY_INVALID");
}
