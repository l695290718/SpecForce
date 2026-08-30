import { contentDigest } from "../federation/digest";
import type { ArchitectureScopeRef } from "../architecture/types";
import type { ArchitectureLayer } from "../knowledge/types";
import type { ArchitectureUnitMemberProjection, ArchitectureUnitProjection } from "./types";

export type Asset3AMappingMode = "DIRECT" | "TRACE" | "EXEMPT" | "BLOCKED";

export interface Asset3AMappingPathStep {
  relationshipIdentity: string;
  sourceSemanticIdentity: string;
  targetSemanticIdentity: string;
  relationCode: string;
}

export interface Asset3AMappingCoverageSource extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  manifestId: string;
  assetType: string;
  assetId: string;
  role: "MEMBERSHIP" | "TRACEABILITY" | "EXEMPTION";
  status: "COVERED" | "BLOCKED" | "NOT_EVALUATED";
  terminalMemberId?: string | null;
  pathEvidence: Asset3AMappingPathStep[];
  reasonCode?: string | null;
  diagnosticRef?: string | null;
  sourceDigest?: string | null;
  rowDigest: string;
}

export interface Asset3AMappingProjection extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  assetType: string;
  assetId: string;
  semanticIdentity: string;
  mappingMode: Asset3AMappingMode;
  targetUnitIdentity?: string;
  targetLayer?: ArchitectureLayer;
  targetUnitKind?: ArchitectureUnitProjection["kind"];
  directMembershipRevisionId?: string;
  terminalMemberId?: string;
  pathEvidence: Asset3AMappingPathStep[];
  confidence: number;
  evidenceRefs: string[];
  reasonCode?: string;
  diagnosticRef?: string;
  sourceDigest: string;
  contentDigest: string;
}

export interface Asset3AMappingMaterializationInput extends ArchitectureScopeRef {
  generationId: string;
  coverageGenerationId?: string;
  baselineId: string;
  projectionManifestId: string;
  coverage: readonly Asset3AMappingCoverageSource[];
  members: readonly ArchitectureUnitMemberProjection[];
  units: readonly ArchitectureUnitProjection[];
}

export function materializeAsset3AMappings(input: Asset3AMappingMaterializationInput): Asset3AMappingProjection[] {
  assertIdentity(input);
  const unitByIdentity = new Map(input.units.map((unit) => [unit.unitIdentity, unit]));
  const directByAsset = new Map<string, ArchitectureUnitMemberProjection[]>();
  for (const member of input.members) {
    assertIdentity(member, input);
    const assetType = member.assetType ?? inferAssetType(member.semanticIdentity);
    for (const key of assetLookupKeys(assetType, undefined, member.assertionId, member.semanticIdentity)) {
      const list = directByAsset.get(key) ?? [];
      list.push(member);
      directByAsset.set(key, list);
    }
  }
  const rows = input.coverage.map((row) => {
    const expectedCoverageGeneration = input.coverageGenerationId ?? input.generationId;
    if (
      row.applicationServiceId !== input.applicationServiceId ||
      row.scopePath !== input.scopePath ||
      row.generationId !== expectedCoverageGeneration ||
      row.baselineId !== input.baselineId
    )
      throw new Error("ASSET_3A_MAPPING_COVERAGE_IDENTITY_MISMATCH");
    return materializeRow(row, input, directByAsset, unitByIdentity);
  });
  const keys = new Set<string>();
  for (const row of rows) {
    const key = `${row.assetType}:${row.assetId}`;
    if (keys.has(key)) throw new Error("ASSET_3A_MAPPING_DUPLICATE");
    keys.add(key);
  }
  return rows.sort(compareMappings);
}

function materializeRow(
  row: Asset3AMappingCoverageSource,
  input: Asset3AMappingMaterializationInput,
  directByAsset: Map<string, ArchitectureUnitMemberProjection[]>,
  unitByIdentity: Map<string, ArchitectureUnitProjection>
): Asset3AMappingProjection {
  const members = assetLookupKeys(row.assetType, row.assetId).flatMap((key) => directByAsset.get(key) ?? []);
  const uniqueMembers = [...new Map(members.map((member) => [member.unitIdentity, member])).values()];
  if (uniqueMembers.length > 1)
    return buildRow(row, input, "BLOCKED", undefined, undefined, undefined, "MULTIPLE_DIRECT_TARGETS");
  const member = uniqueMembers[0];
  if (member) {
    const unit = unitByIdentity.get(member.unitIdentity);
    if (!unit) return buildRow(row, input, "BLOCKED", undefined, undefined, undefined, "DIRECT_TARGET_NOT_FOUND");
    return buildRow(row, input, "DIRECT", unit, member, member.assertionId);
  }
  if (row.status === "BLOCKED" || row.status === "NOT_EVALUATED")
    return buildRow(
      row,
      input,
      "BLOCKED",
      undefined,
      undefined,
      row.terminalMemberId ?? undefined,
      row.reasonCode ?? "COVERAGE_NOT_RESOLVED"
    );
  const terminal = row.terminalMemberId
    ? input.members.find(
        (item) =>
          item.assertionId === row.terminalMemberId ||
          item.semanticIdentity === row.terminalMemberId ||
          item.semanticIdentity.endsWith(`:${row.terminalMemberId}`)
      )
    : undefined;
  const unit = terminal ? unitByIdentity.get(terminal.unitIdentity) : undefined;
  if (row.role === "EXEMPTION")
    return buildRow(
      row,
      input,
      "EXEMPT",
      unit,
      terminal,
      row.terminalMemberId ?? undefined,
      row.reasonCode ?? "EXPLICIT_EXEMPTION"
    );
  if (!unit)
    return buildRow(
      row,
      input,
      "BLOCKED",
      undefined,
      undefined,
      row.terminalMemberId ?? undefined,
      "TRACE_TARGET_NOT_FOUND"
    );
  return buildRow(row, input, "TRACE", unit, terminal, row.terminalMemberId ?? undefined);
}

function buildRow(
  source: Asset3AMappingCoverageSource,
  input: Asset3AMappingMaterializationInput,
  mode: Asset3AMappingMode,
  unit?: ArchitectureUnitProjection,
  member?: ArchitectureUnitMemberProjection,
  terminalMemberId?: string,
  reasonCode?: string
): Asset3AMappingProjection {
  const semanticIdentity = `${source.assetType}:${source.assetId}`;
  const evidenceRefs = [
    ...new Set(
      [
        source.rowDigest,
        source.sourceDigest ?? "",
        ...source.pathEvidence.flatMap((step) => [
          step.relationshipIdentity,
          step.sourceSemanticIdentity,
          step.targetSemanticIdentity
        ])
      ].filter(Boolean)
    )
  ].sort();
  const result = {
    applicationServiceId: input.applicationServiceId,
    scopePath: input.scopePath,
    generationId: input.generationId,
    baselineId: input.baselineId,
    projectionManifestId: input.projectionManifestId,
    assetType: source.assetType,
    assetId: source.assetId,
    semanticIdentity,
    mappingMode: mode,
    ...(unit ? { targetUnitIdentity: unit.unitIdentity, targetLayer: unit.layer, targetUnitKind: unit.kind } : {}),
    ...(mode === "DIRECT" && member ? { directMembershipRevisionId: member.assertionId } : {}),
    ...(terminalMemberId ? { terminalMemberId } : {}),
    pathEvidence: source.pathEvidence,
    confidence: member ? 1 : source.status === "COVERED" ? 0.8 : 0,
    evidenceRefs,
    ...(reasonCode ? { reasonCode } : {}),
    ...(source.diagnosticRef ? { diagnosticRef: source.diagnosticRef } : {}),
    sourceDigest: source.rowDigest
  } satisfies Omit<Asset3AMappingProjection, "contentDigest">;
  return { ...result, contentDigest: contentDigest(result) };
}

function assertIdentity(
  value: ArchitectureScopeRef &
    Partial<Pick<Asset3AMappingProjection, "generationId" | "baselineId" | "projectionManifestId">>,
  expected?: Asset3AMappingMaterializationInput
): void {
  if (!value.applicationServiceId || !value.scopePath) throw new Error("ASSET_3A_MAPPING_SCOPE_REQUIRED");
  if (!expected) return;
  if (value.applicationServiceId !== expected.applicationServiceId || value.scopePath !== expected.scopePath)
    throw new Error("ASSET_3A_MAPPING_SCOPE_MISMATCH");
  if (value.generationId !== expected.generationId || value.baselineId !== expected.baselineId)
    throw new Error("ASSET_3A_MAPPING_GENERATION_MISMATCH");
  if ("projectionManifestId" in value && value.projectionManifestId !== expected.projectionManifestId)
    throw new Error("ASSET_3A_MAPPING_MANIFEST_MISMATCH");
}

function inferAssetType(semanticIdentity: string): string {
  return semanticIdentity.split(":", 1)[0] ?? "unknown";
}
const assetIdPrefixes: Record<string, string> = {
  adr: "adr",
  api: "api",
  businessRule: "rule",
  contextPack: "context-pack",
  dataModel: "data",
  domain: "domain",
  event: "event",
  proposal: "proposal",
  stateMachine: "sm"
};

function assetLookupKeys(
  assetType: string,
  assetId?: string,
  assertionId?: string,
  semanticIdentity?: string
): string[] {
  const suffixes = new Set<string>();
  if (assetId) suffixes.add(assetId);
  if (semanticIdentity)
    suffixes.add(
      semanticIdentity.startsWith(`${assetType}:`) ? semanticIdentity.slice(assetType.length + 1) : semanticIdentity
    );
  if (assertionId) {
    const assertionSuffix = assertionId.startsWith(`asset:${assetType}:`)
      ? assertionId.slice(`asset:${assetType}:`.length)
      : assertionId;
    suffixes.add(assertionSuffix);
  }
  const prefix = assetIdPrefixes[assetType];
  if (prefix) {
    for (const suffix of [...suffixes]) {
      if (suffix.startsWith(`${prefix}-`)) suffixes.add(suffix.slice(prefix.length + 1));
      else suffixes.add(`${prefix}-${suffix}`);
    }
  }
  return [...suffixes].map((suffix) => `${assetType}:${suffix}`);
}
function compareMappings(left: Asset3AMappingProjection, right: Asset3AMappingProjection): number {
  return left.assetType.localeCompare(right.assetType, "en") || left.assetId.localeCompare(right.assetId, "en");
}
