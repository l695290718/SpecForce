import type {
  ArchitectureUnitMappingRevisionInput,
  ArchitectureUnitMembershipRevisionInput,
  ArchitectureUnitRevisionInput
} from "@specforge/core";

export const V6_UNIT_IDENTITIES = {
  webConsole: "unit:sys:specforge-web-console",
  aiGeneration: "unit:sys:specforge-ai-generation-service",
  graphQuery: "unit:sys:specforge-asset-graph-query-service",
  auditObservability: "unit:sys:specforge-mcp-audit-observability-service"
} as const;

export const V6_CANDIDATE_IDS = [
  "api-specforge-ai-generation",
  "api-specforge-graph-query",
  "api-specforge-web-console",
  "obs-specforge-mcp-audit"
] as const;

export const V6_EVIDENCE = "evidence:designer-3a-semantic-unit-expansion-v6";
const businessUnit = "unit:biz:specforge-governed-design-facts";
const technologyUnit = "unit:tech:specforge-postgresql-authority";

type AssetType = "api" | "observability";

export interface Designer3aV5Snapshot {
  units: ArchitectureUnitRevisionInput[];
  memberships: ArchitectureUnitMembershipRevisionInput[];
  mappings: ArchitectureUnitMappingRevisionInput[];
}

export interface Designer3aCandidateEvidence {
  assetType: AssetType;
  assetId: string;
  relationshipIdentities: string[];
  relationshipCodes: string[];
  evidenceRefs: string[];
}

export interface Designer3aV6Snapshot extends Designer3aV5Snapshot {
  evidenceRefs: string[];
}

const definitions = [
  { assetType: "api" as const, assetId: "api-specforge-web-console", unitIdentity: V6_UNIT_IDENTITIES.webConsole, kind: "APPLICATION" as const, name: "SpecForge Web Console", description: "The human-facing console for browsing governed design facts and architecture projections.", zhName: "SpecForge Web 控制台", zhDescription: "用于浏览受治理设计事实和架构投影的人机界面控制台。", requiredCodes: ["CALLS"] },
  { assetType: "api" as const, assetId: "api-specforge-ai-generation", unitIdentity: V6_UNIT_IDENTITIES.aiGeneration, kind: "SERVICE" as const, name: "AI generation service", description: "The bounded service boundary for generating proposals, ADRs, rules, tests, and agent context.", zhName: "AI 生成服务", zhDescription: "用于生成提案、ADR、规则、测试建议和代理上下文的受控服务边界。", requiredCodes: ["READS", "WRITES"] },
  { assetType: "api" as const, assetId: "api-specforge-graph-query", unitIdentity: V6_UNIT_IDENTITIES.graphQuery, kind: "SERVICE" as const, name: "Asset graph query service", description: "The service boundary for bounded relationship and impact queries over derived architecture projections.", zhName: "资产图查询服务", zhDescription: "基于派生架构投影提供有界关系查询和影响分析的服务边界。", requiredCodes: ["READS"] },
  { assetType: "observability" as const, assetId: "obs-specforge-mcp-audit", unitIdentity: V6_UNIT_IDENTITIES.auditObservability, kind: "SERVICE" as const, name: "MCP audit observability service", description: "The service responsibility for observing MCP write, authorization, and governance audit signals.", zhName: "MCP 审计可观测服务", zhDescription: "负责观测 MCP 写入、授权和治理审计信号的服务职责。", requiredCodes: ["OBSERVES"] }
] as const;

export function buildDesigner3aV6Snapshot(input: { v5: Designer3aV5Snapshot; candidates: readonly Designer3aCandidateEvidence[] }): Designer3aV6Snapshot {
  assertV5(input.v5);
  const candidates = validateCandidates(input.candidates);
  const candidateById = new Map(candidates.map((candidate) => [candidate.assetId, candidate]));
  const carriedUnits = input.v5.units.map((unit) => ({ ...unit, id: nextRevisionId(unit.id, 6), revision: unit.revision + 1, evidenceRefs: unique([...unit.evidenceRefs, V6_EVIDENCE]) }));
  const carriedMemberships = input.v5.memberships.map((membership) => ({ ...membership, id: nextRevisionId(membership.id, 6), revision: membership.revision + 1, evidenceRefs: unique([...membership.evidenceRefs, V6_EVIDENCE]) }));
  const carriedMappings = input.v5.mappings.map((mapping) => ({ ...mapping, id: nextRevisionId(mapping.id, 6), revision: mapping.revision + 1, evidenceRefs: unique([...mapping.evidenceRefs, V6_EVIDENCE]) }));

  const targetMemberships = carriedMemberships.filter((membership) => membership.unitIdentity === technologyUnit && ["data-specforge-ai-generation", "data-specforge-asset-graph", "data-specforge-audit"].includes(membership.assetId ?? ""));
  if (targetMemberships.length !== 3) throw new Error("V6_REQUIRED_EVIDENCE_MISSING: target PostgreSQL memberships");

  const newUnits = definitions.map((definition) => ({
    id: `architecture-unit-revision:designer:v6:${definition.unitIdentity.split(":").slice(2).join("-")}`,
    unitIdentity: definition.unitIdentity,
    revision: 1,
    layer: "SYS" as const,
    kind: definition.kind,
    parentUnitIdentity: businessUnit,
    canonicalName: definition.name,
    canonicalDescription: definition.description,
    localizedContent: { zh: { name: definition.zhName, description: definition.zhDescription } },
    aliases: [definition.name],
    criticality: definition.unitIdentity === V6_UNIT_IDENTITIES.webConsole ? 0.8 : 0.85,
    evidenceRefs: unique([V6_EVIDENCE, definition.assetId, ...candidateById.get(definition.assetId)!.evidenceRefs])
  }));
  const newMemberships = definitions.map((definition) => {
    const candidate = candidateById.get(definition.assetId)!;
    return {
      id: `architecture-membership-revision:designer:v6:${definition.assetId}`,
      membershipIdentity: `membership:${definition.unitIdentity}:${definition.assetId}`,
      revision: 1,
      unitIdentity: definition.unitIdentity,
      assetType: definition.assetType,
      assetId: definition.assetId,
      semanticIdentity: `${definition.assetType}:${definition.assetId}`,
      confidence: 1,
      evidenceRefs: unique([V6_EVIDENCE, definition.assetId, ...candidate.evidenceRefs])
    };
  });
  const newMappings = [
    mappingFor(V6_UNIT_IDENTITIES.aiGeneration, "api-specforge-ai-generation", candidateById.get("api-specforge-ai-generation")!),
    mappingFor(V6_UNIT_IDENTITIES.graphQuery, "api-specforge-graph-query", candidateById.get("api-specforge-graph-query")!),
    mappingFor(V6_UNIT_IDENTITIES.auditObservability, "obs-specforge-mcp-audit", candidateById.get("obs-specforge-mcp-audit")!)
  ];
  const snapshot = {
    units: [...carriedUnits, ...newUnits],
    memberships: [...carriedMemberships, ...newMemberships],
    mappings: [...carriedMappings, ...newMappings],
    evidenceRefs: unique([V6_EVIDENCE, ...V6_CANDIDATE_IDS, ...candidates.flatMap((candidate) => candidate.evidenceRefs)])
  } satisfies Designer3aV6Snapshot;
  if (snapshot.units.length !== 8 || snapshot.memberships.length !== 42 || snapshot.mappings.length !== 6) throw new Error("V6_SNAPSHOT_COUNT_MISMATCH");
  return snapshot;
}

function mappingFor(unitIdentity: string, assetId: string, candidate: Designer3aCandidateEvidence): ArchitectureUnitMappingRevisionInput {
  return {
    id: `architecture-mapping-revision:designer:v6:${assetId}`,
    mappingIdentity: `mapping:${unitIdentity}->${technologyUnit}`,
    revision: 1,
    sourceUnitIdentity: unitIdentity,
    targetUnitIdentity: technologyUnit,
    mappingFamily: "SERVICE_TO_TECHNOLOGY",
    confidence: 0.95,
    relationshipIdentities: candidate.relationshipIdentities,
    evidenceRefs: unique([V6_EVIDENCE, assetId, ...candidate.evidenceRefs])
  };
}

function validateCandidates(candidates: readonly Designer3aCandidateEvidence[]): Designer3aCandidateEvidence[] {
  if (candidates.length !== V6_CANDIDATE_IDS.length || new Set(candidates.map((candidate) => candidate.assetId)).size !== V6_CANDIDATE_IDS.length) throw new Error("V6_REQUIRED_EVIDENCE_MISSING: exact candidate set");
  for (const candidate of candidates) {
    const definition = definitions.find((item) => item.assetId === candidate.assetId);
    if (!definition || !candidate.relationshipIdentities.length || candidate.relationshipIdentities.some((identity) => identity.includes("specforge-graph-verification-"))) throw new Error("V6_REQUIRED_EVIDENCE_MISSING: candidate relationship");
    const codes = new Set(candidate.relationshipCodes.map((code) => code.toUpperCase()));
    if (definition.requiredCodes.some((code) => !codes.has(code))) throw new Error(`V6_REQUIRED_EVIDENCE_MISSING: ${candidate.assetId}`);
    if (candidate.evidenceRefs.length === 0) throw new Error(`V6_REQUIRED_EVIDENCE_MISSING: ${candidate.assetId} evidence`);
  }
  return [...candidates];
}

function assertV5(snapshot: Designer3aV5Snapshot): void {
  if (snapshot.units.length !== 4 || snapshot.memberships.length !== 38 || snapshot.mappings.length !== 3) throw new Error("V5_SNAPSHOT_COUNT_MISMATCH");
  if (!snapshot.units.some((unit) => unit.unitIdentity === businessUnit) || !snapshot.units.some((unit) => unit.unitIdentity === technologyUnit)) throw new Error("V6_REQUIRED_EVIDENCE_MISSING: v5 parent or technology unit");
  if (snapshot.memberships.some((membership) => membership.assetId?.includes("graph-verification-"))) throw new Error("V6_FIXTURE_LEAK");
}

function nextRevisionId(id: string, revision: number): string {
  return /:v\d+$/u.test(id) ? id.replace(/:v\d+$/u, `:v${revision}`) : `${id}:v${revision}`;
}

function unique(values: string[]): string[] { return [...new Set(values.filter(Boolean))]; }
