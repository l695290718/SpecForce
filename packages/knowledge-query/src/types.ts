import type { ArchitectureScopeRef, ScopedPrincipal } from "@specforge/core";
import type { KnowledgeProjectionEdge, KnowledgeProjectionNode, ProjectionManifestV2, PublishedBaselineDrift } from "@specforge/core";

export const defaultThreeABudget = { maxDepth: 2, maxNodes: 200, maxEdges: 400, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 } as const;
export const hardThreeABudget = { maxDepth: 5, maxNodes: 1_000, maxEdges: 2_000, maxPaths: 1_000, timeoutMs: 5_000, maxPayloadBytes: 2_097_152 } as const;
export type ThreeABudget = { maxDepth: number; maxNodes: number; maxEdges: number; maxPaths: number; timeoutMs: number; maxPayloadBytes: number };
export type ThreeAPartialReason = "MAX_DEPTH" | "MAX_NODES" | "MAX_EDGES" | "MAX_PATHS" | "TIMEOUT" | "MAX_PAYLOAD";

export interface QueryPrincipalInput { principal: ScopedPrincipal; architectureScope: ArchitectureScopeRef; }
export interface PublishedBaselineSummary extends ArchitectureScopeRef { id: string; streamId: string; changeSetId: string; status: "PUBLISHED" | "SUPERSEDED"; publishedAt: string; }
export interface QueryResultEnvelope extends ArchitectureScopeRef { baselineId: string; projectionManifestId: string; profileId: string; profileVersion: string; relationshipVersion: string; resultDigest: string; }
export interface SearchArchitectureFactsInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; query?: string; layer?: "BIZ" | "SYS" | "TECH"; limit?: number; cursor?: string; }
export interface SearchArchitectureFactsResult extends QueryResultEnvelope { nodes: KnowledgeProjectionNode[]; nextCursor?: string; partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] }; }
export interface TraceArchitecturePathInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; startAssertionId: string; direction?: "upstream" | "downstream" | "both"; budget?: Partial<ThreeABudget>; continuation?: string; }
export interface ArchitecturePath { assertionIds: string[]; relationshipIdentities: string[]; }
export interface TraceArchitecturePathResult extends QueryResultEnvelope { nodes: KnowledgeProjectionNode[]; edges: KnowledgeProjectionEdge[]; paths: ArchitecturePath[]; continuation?: string; partial?: { code: "RESULT_PARTIAL"; reasons: ThreeAPartialReason[] }; }
export interface ArchitectureFactDetailInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; assertionId: string; }
export interface ArchitectureFactDetail extends QueryResultEnvelope { node: KnowledgeProjectionNode; canonicalEnglish?: Record<string, unknown>; localizedChinese?: Record<string, unknown>; factType?: string; aspect?: string; confidence?: number; status?: string; evidenceRefs: string[]; sourceObservationIds: string[]; unresolvedQuestions: string[]; counterEvidence: string[]; incoming: KnowledgeProjectionEdge[]; outgoing: KnowledgeProjectionEdge[]; warnings: string[]; }
export interface ArchitectureAlignmentInput extends QueryPrincipalInput { baselineId: string; projectionManifestId: string; }
export interface ArchitectureAlignmentResult extends QueryResultEnvelope { edges: KnowledgeProjectionEdge[]; warnings: string[]; }
export interface ComparePublishedBaselinesInput extends QueryPrincipalInput { baseBaselineId: string; targetBaselineId: string; baseProjectionManifestId: string; targetProjectionManifestId: string; }
export interface BaselineQueryInput extends QueryPrincipalInput { baselineId: string; }
export interface ScopedQueryInput extends QueryPrincipalInput {}

export interface ArchitectureFactSource { node: KnowledgeProjectionNode; factType?: string; aspect?: string; confidence?: number; status?: string; value?: Record<string, unknown>; evidenceRefs: string[]; sourceObservationIds: string[]; unresolvedQuestions: string[]; counterEvidence: string[]; }

export interface ThreeAQueryRepository {
  listOfficialBaselines(scope: ArchitectureScopeRef): Promise<PublishedBaselineSummary[]>;
  listPublishedManifests(scope: ArchitectureScopeRef, baselineId: string): Promise<ProjectionManifestV2[]>;
  searchNodes(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: { query?: string; layer?: "BIZ" | "SYS" | "TECH"; afterSortKey?: string; limit: number }): Promise<{ nodes: KnowledgeProjectionNode[]; hasMore: boolean }>;
  getFact(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, assertionId: string): Promise<ArchitectureFactSource | undefined>;
  listEdges(scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input?: { assertionId?: string }): Promise<KnowledgeProjectionEdge[]>;
}

export interface ContinuationState { browseSessionId: string; sequence: number; tenantId: string; subject: string; architectureScope: ArchitectureScopeRef; baselineId: string; projectionManifestId: string; queryFingerprint: string; frontier: string[]; visitedIds: string[]; stateDigest: string; expiresAt: string; }
export interface TraceContinuationStore { create(state: ContinuationState): Promise<void>; consume(input: Pick<ContinuationState, "browseSessionId" | "sequence" | "tenantId" | "subject" | "architectureScope" | "baselineId" | "projectionManifestId" | "queryFingerprint">): Promise<ContinuationState | undefined>; }

export interface ThreeAProjectionQueryService {
  listPublishedBaselines(input: ScopedQueryInput): Promise<PublishedBaselineSummary[]>;
  listProjectionManifests(input: BaselineQueryInput): Promise<ProjectionManifestV2[]>;
  searchArchitectureFacts(input: SearchArchitectureFactsInput): Promise<SearchArchitectureFactsResult>;
  traceArchitecturePath(input: TraceArchitecturePathInput): Promise<TraceArchitecturePathResult>;
  getArchitectureFactDetail(input: ArchitectureFactDetailInput): Promise<ArchitectureFactDetail>;
  getArchitectureAlignment(input: ArchitectureAlignmentInput): Promise<ArchitectureAlignmentResult>;
  comparePublishedBaselines(input: ComparePublishedBaselinesInput): Promise<PublishedBaselineDrift>;
}
