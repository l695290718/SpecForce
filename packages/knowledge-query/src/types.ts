import type {
  ArchitectureMapBudget,
  ArchitectureMapIdentity,
  ArchitectureScopeRef,
  ArchitectureUnitFilter,
  ArchitectureUnitMappingProjection,
  ArchitectureUnitMemberProjection,
  ArchitectureUnitProjection,
  ArchitectureUnitProjectionPage,
  KnowledgeProjectionEdge,
  KnowledgeProjectionNode,
  ProjectionManifestV2,
  PublishedBaselineDrift,
  ScopedPrincipal,
  ThreeAGraphAnalysisAvailability,
  ThreeAGraphFidelity,
  ThreeAGraphSource,
  ThreeAPartialReason as ArchitectureMapPartialReason
} from "@specforge/core";

export const defaultThreeABudget = { maxDepth: 2, maxNodes: 200, maxEdges: 400, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 } as const;
export const hardThreeABudget = { maxDepth: 5, maxNodes: 1_000, maxEdges: 2_000, maxPaths: 1_000, timeoutMs: 5_000, maxPayloadBytes: 2_097_152 } as const;
export type ThreeABudget = { maxDepth: number; maxNodes: number; maxEdges: number; maxPaths: number; timeoutMs: number; maxPayloadBytes: number };
export type ThreeAPartialReason = "MAX_DEPTH" | "MAX_NODES" | "MAX_EDGES" | "MAX_PATHS" | "TIMEOUT" | "MAX_PAYLOAD";
export type ArchitectureLayer = "BIZ" | "SYS" | "TECH";
export type TraceDirection = "upstream" | "downstream" | "both";

export interface QueryPrincipalInput { principal: ScopedPrincipal; architectureScope: ArchitectureScopeRef; }
export interface PublishedBaselineSummary extends ArchitectureScopeRef { id: string; streamId: string; changeSetId: string; status: "PUBLISHED" | "SUPERSEDED"; publishedAt: string; }
export interface QueryResultEnvelope extends ArchitectureScopeRef { baselineId: string; projectionManifestId: string; profileId: string; profileVersion: string; relationshipVersion: string; resultDigest: string; }
export interface SearchArchitectureFactsInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; query?: string; layer?: ArchitectureLayer; limit?: number; cursor?: string; }
export interface SearchArchitectureFactsResult extends QueryResultEnvelope { nodes: KnowledgeProjectionNode[]; nextCursor?: string; partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] }; }
export interface TraceArchitecturePathInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; startAssertionId: string; direction?: TraceDirection; relationTypes?: string[]; layers?: ArchitectureLayer[]; budget?: Partial<ThreeABudget>; continuation?: string; }
export interface AdjacentEdgeQuery { frontierAssertionIds: string[]; direction: TraceDirection; relationTypes?: string[]; limit: number; }
export interface ArchitecturePath { assertionIds: string[]; relationshipIdentities: string[]; }
export interface TraceArchitecturePathResult extends QueryResultEnvelope { nodes: KnowledgeProjectionNode[]; edges: KnowledgeProjectionEdge[]; paths: ArchitecturePath[]; continuation?: string; partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] }; }

export type GraphSummaryKind = "cluster" | "fact";
export type ImpactBand = "DIRECT" | "LIKELY" | "EXTENDED" | "UNRESOLVED";

export interface GraphSummaryNode extends ArchitectureScopeRef {
  id: string;
  kind: GraphSummaryKind;
  label: string;
  layer?: ArchitectureLayer;
  clusterId?: string;
  memberCount: number;
  degree: number;
  criticality: number;
  positionSeed: { x: number; y: number };
  assertionId?: string;
}

export interface GraphSummaryEdge extends ArchitectureScopeRef {
  id: string;
  sourceId: string;
  targetId: string;
  relationCode: string;
  confidence: number;
  bridge: boolean;
}

export interface GraphAnalysisBudget {
  maxNodes: number;
  maxEdges: number;
  maxPaths: number;
  timeoutMs: number;
  maxPayloadBytes: number;
}

export interface OverviewArchitectureInput extends QueryPrincipalInput {
  baselineId: string;
  projectionManifestId: string;
  layers?: ArchitectureLayer[];
  assetTypes?: string[];
  relationTypes?: string[];
  continuation?: string;
  budget?: Partial<GraphAnalysisBudget>;
}

export interface OverviewArchitectureResult extends QueryResultEnvelope {
  nodes: GraphSummaryNode[];
  edges: GraphSummaryEdge[];
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export interface ImpactScoreFactors {
  relationWeight: number;
  confidence: number;
  criticalityWeight: number;
  depthDecay: number;
}

export interface ImpactArchitectureInput extends QueryPrincipalInput {
  baselineId: string;
  projectionManifestId: string;
  focusAssertionId: string;
  direction: TraceDirection;
  layers?: ArchitectureLayer[];
  relationTypes?: string[];
  policyVersion?: string;
  continuation?: string;
  budget?: Partial<GraphAnalysisBudget>;
}

export interface ImpactArchitectureItem extends KnowledgeProjectionNode {
  depth: number;
  band: ImpactBand;
  score: number;
  factors: ImpactScoreFactors;
}

export interface ImpactArchitectureResult extends QueryResultEnvelope {
  focusAssertionId: string;
  policyVersion: string;
  items: ImpactArchitectureItem[];
  paths: ArchitecturePath[];
  cutPointAssertionIds: string[];
  countsByBand: Record<ImpactBand, number>;
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] };
}

export interface ArchitectureGraphQueryProvider {
  overview(input: OverviewArchitectureInput): Promise<OverviewArchitectureResult>;
  neighborhood(input: TraceArchitecturePathInput): Promise<TraceArchitecturePathResult>;
  impact(input: ImpactArchitectureInput): Promise<ImpactArchitectureResult>;
}

export interface ArchitectureMapQueryInput extends QueryPrincipalInput {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  filter: ArchitectureUnitFilter;
  budget?: Partial<ArchitectureMapBudget>;
  continuation?: string;
}

export interface ArchitectureMapQueryResult extends QueryResultEnvelope {
  generationId: string;
  availability: "READY" | "NO_GOVERNED_ARCHITECTURE_UNITS";
  units: ArchitectureUnitProjection[];
  mappings: ArchitectureUnitMappingProjection[];
  totalByLayer: Record<ArchitectureLayer, number>;
  returnedByLayer: Record<ArchitectureLayer, number>;
  unclassifiedCount: number;
  mappingCompleteness: number;
  evidenceCoverage: number;
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ArchitectureMapPartialReason[] };
}

export interface UnitGraphQueryInput extends QueryPrincipalInput {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  filter?: ArchitectureUnitFilter;
  budget?: Partial<ArchitectureMapBudget>;
  continuation?: string;
}

export interface UnitGraphQueryResult extends QueryResultEnvelope {
  generationId: string;
  availability: "READY" | "NO_GOVERNED_ARCHITECTURE_UNITS";
  source: ThreeAGraphSource;
  fidelity: ThreeAGraphFidelity;
  analysisAvailability: ThreeAGraphAnalysisAvailability;
  nodes: GraphSummaryNode[];
  edges: GraphSummaryEdge[];
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ArchitectureMapPartialReason[] };
}

export interface ArchitectureUnitNeighborhoodInput extends QueryPrincipalInput {
  generationId: string;
  baselineId: string;
  projectionManifestId: string;
  unitIdentity: string;
  direction: TraceDirection;
  depth: number;
  memberAssetTypes?: string[];
  mappingFamilies?: string[];
  continuation?: string;
  budget?: Partial<ArchitectureMapBudget>;
}

export interface ArchitectureUnitNeighborhoodResult extends QueryResultEnvelope {
  generationId: string;
  unit: ArchitectureUnitProjection;
  adjacentUnits: ArchitectureUnitProjection[];
  members: ArchitectureUnitMemberProjection[];
  mappings: ArchitectureUnitMappingProjection[];
  sameLayerDependencies: KnowledgeProjectionEdge[];
  evidenceRefs: string[];
  continuation?: string;
  partial?: { code: "RESULT_PARTIAL"; reasons: ArchitectureMapPartialReason[] };
}

export interface ArchitectureMapQueryProvider {
  architectureMap(input: ArchitectureMapQueryInput): Promise<ArchitectureMapQueryResult>;
  unitGraph(input: UnitGraphQueryInput): Promise<UnitGraphQueryResult>;
  architectureUnitNeighborhood(input: ArchitectureUnitNeighborhoodInput): Promise<ArchitectureUnitNeighborhoodResult>;
}

export type ArchitectureUnitPageCursor = Record<ArchitectureLayer, number>;

export interface ArchitectureUnitQueryPage {
  units: ArchitectureUnitProjection[];
  totalByLayer: Record<ArchitectureLayer, number>;
  unclassifiedCount: number;
  nextCursor?: ArchitectureUnitPageCursor;
}

export interface ArchitectureMapQueryRepository {
  listArchitectureUnits(
    identity: ArchitectureMapIdentity,
    filter: ArchitectureUnitFilter,
    budget: ArchitectureMapBudget,
    cursor: ArchitectureUnitPageCursor
  ): Promise<ArchitectureUnitQueryPage>;
  getArchitectureUnitsByIdentity(identity: ArchitectureMapIdentity, unitIdentities: string[]): Promise<ArchitectureUnitProjection[]>;
  listArchitectureUnitMembers(
    identity: ArchitectureMapIdentity,
    unitIdentity: string,
    limit: number,
    assetTypes?: string[],
    offset?: number
  ): Promise<{ members: ArchitectureUnitMemberProjection[]; hasMore: boolean }>;
  listArchitectureUnitMappings(
    identity: ArchitectureMapIdentity,
    unitIdentities: string[],
    limit: number,
    mappingFamilies?: string[],
    offset?: number
  ): Promise<{ mappings: ArchitectureUnitMappingProjection[]; hasMore: boolean }>;
  listArchitectureUnitNeighborhoodMappings(
    identity: ArchitectureMapIdentity,
    frontierUnitIdentities: string[],
    direction: TraceDirection,
    limit: number,
    mappingFamilies?: string[]
  ): Promise<{ mappings: ArchitectureUnitMappingProjection[]; hasMore: boolean }>;
  listSameLayerDependencies(
    identity: ArchitectureMapIdentity,
    assertionIds: string[],
    limit: number
  ): Promise<{ edges: KnowledgeProjectionEdge[]; hasMore: boolean }>;
}
export interface ArchitectureFactDetailInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; assertionId: string; }
export interface ArchitectureFactDetail extends QueryResultEnvelope { node: KnowledgeProjectionNode; canonicalEnglish?: Record<string, unknown>; localizedChinese?: Record<string, unknown>; factType?: string; aspect?: string; confidence?: number; status?: string; evidenceRefs: string[]; sourceObservationIds: string[]; unresolvedQuestions: string[]; counterEvidence: string[]; incoming: KnowledgeProjectionEdge[]; outgoing: KnowledgeProjectionEdge[]; warnings: string[]; }
export interface ArchitectureAlignmentInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; limit?: number; }
export interface ArchitectureAlignmentResult extends QueryResultEnvelope { edges: KnowledgeProjectionEdge[]; warnings: string[]; }
export interface ComparePublishedBaselinesInput extends QueryPrincipalInput { baseBaselineId: string; targetBaselineId: string; baseProjectionManifestId: string; targetProjectionManifestId: string; }
export interface BaselineQueryInput extends QueryPrincipalInput { baselineId: string; }
export interface ScopedQueryInput extends QueryPrincipalInput {}

export interface ArchitectureFactSource { node: KnowledgeProjectionNode; factType?: string; aspect?: string; confidence?: number; status?: string; value?: Record<string, unknown>; evidenceRefs: string[]; sourceObservationIds: string[]; unresolvedQuestions: string[]; counterEvidence: string[]; }

export interface ThreeAQueryRepository {
  listOfficialBaselines(scope: ArchitectureScopeRef): Promise<PublishedBaselineSummary[]>;
  listPublishedManifests(scope: ArchitectureScopeRef, baselineId: string): Promise<ProjectionManifestV2[]>;
  searchNodes(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: { query?: string; layer?: ArchitectureLayer; afterSortKey?: string; limit: number }): Promise<{ nodes: KnowledgeProjectionNode[]; hasMore: boolean }>;
  getFact(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionId: string): Promise<ArchitectureFactSource | undefined>;
  getFactsByIds(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionIds: string[]): Promise<ArchitectureFactSource[]>;
  listAdjacentEdges(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: AdjacentEdgeQuery): Promise<{ edges: KnowledgeProjectionEdge[]; hasMore: boolean }>;
  listEdges(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input?: { assertionId?: string; limit?: number }): Promise<KnowledgeProjectionEdge[]>;
}

export interface ContinuationState { browseSessionId: string; sequence: number; tenantId: string; subject: string; architectureScope: ArchitectureScopeRef; baselineId: string; projectionManifestId: string; queryFingerprint: string; frontier: string[]; visitedIds: string[]; stateDigest: string; expiresAt: string; }
export interface TraceContinuationStore { create(state: ContinuationState): Promise<void>; consume(input: Pick<ContinuationState, "browseSessionId" | "sequence" | "tenantId" | "subject" | "architectureScope" | "baselineId" | "projectionManifestId" | "queryFingerprint">): Promise<ContinuationState | undefined>; }

export interface ThreeAProjectionQueryService extends ArchitectureMapQueryProvider {
  listPublishedBaselines(input: ScopedQueryInput): Promise<PublishedBaselineSummary[]>;
  listProjectionManifests(input: BaselineQueryInput): Promise<ProjectionManifestV2[]>;
  searchArchitectureFacts(input: SearchArchitectureFactsInput): Promise<SearchArchitectureFactsResult>;
  traceArchitecturePath(input: TraceArchitecturePathInput): Promise<TraceArchitecturePathResult>;
  getArchitectureFactDetail(input: ArchitectureFactDetailInput): Promise<ArchitectureFactDetail>;
  getArchitectureAlignment(input: ArchitectureAlignmentInput): Promise<ArchitectureAlignmentResult>;
  comparePublishedBaselines(input: ComparePublishedBaselinesInput): Promise<PublishedBaselineDrift>;
}
