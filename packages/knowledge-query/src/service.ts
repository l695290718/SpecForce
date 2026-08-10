import { authorizePrincipalScope, comparePublishedBaselines, contentDigest, isOfficialBaseline, type ArchitectureScopeRef, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionManifestV2, type PublishedBaselineDrift } from "@specforge/core";
import { ThreeAQueryError } from "./errors";
import { createTraversalCursor, signSearchCursor, verifySearchCursor, verifyTraversalCursor, type CursorKeyring } from "./cursor";
import { defaultThreeABudget, hardThreeABudget, type ArchitectureAlignmentInput, type ArchitectureAlignmentResult, type ArchitectureFactDetail, type ArchitectureFactDetailInput, type ArchitectureLayer, type BaselineQueryInput, type ComparePublishedBaselinesInput, type ContinuationState, type SearchArchitectureFactsInput, type SearchArchitectureFactsResult, type ThreeAProjectionQueryService, type TraceArchitecturePathInput, type TraceArchitecturePathResult, type TraceContinuationStore, type ScopedQueryInput, type QueryResultEnvelope, type ThreeABudget, type ThreeAPartialReason, type ThreeAQueryRepository, type TraceDirection } from "./types";

export function createThreeAProjectionQueryService(repository: ThreeAQueryRepository, continuationStore: TraceContinuationStore, keyring: CursorKeyring, now = () => new Date()): ThreeAProjectionQueryService {
  const authorize = (input: { principal: Parameters<typeof authorizePrincipalScope>[0]; architectureScope: ArchitectureScopeRef }): ArchitectureScopeRef => { try { return authorizePrincipalScope(input.principal, input.architectureScope, "read"); } catch { throw new ThreeAQueryError("SCOPE_ACCESS_DENIED"); } };
  const manifestFor = async (scope: ArchitectureScopeRef, baselineId: string, manifestId: string) => { const manifests = await repository.listPublishedManifests(scope, baselineId); const manifest = manifests.find((item) => item.id === manifestId && item.projectionSchemaVersion === "3a.v2"); if (!manifest) throw new ThreeAQueryError("PROJECTION_MANIFEST_REQUIRED"); return manifest; };
  const envelope = (scope: ArchitectureScopeRef, manifest: { baselineId: string; id: string; profileId: string; profileVersion: string; relationshipVersion: string }, value: unknown): QueryResultEnvelope => ({ ...scope, baselineId: manifest.baselineId, projectionManifestId: manifest.id, profileId: manifest.profileId, profileVersion: manifest.profileVersion, relationshipVersion: manifest.relationshipVersion, resultDigest: contentDigest(value) });
  return {
    async listPublishedBaselines(input: ScopedQueryInput) { const scope = authorize(input); return repository.listOfficialBaselines(scope); },
    async listProjectionManifests(input: BaselineQueryInput) { const scope = authorize(input); return repository.listPublishedManifests(scope, input.baselineId); },
    async searchArchitectureFacts(input: SearchArchitectureFactsInput): Promise<SearchArchitectureFactsResult> {
      const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const limit = bounded(input.limit ?? 50, 1, 200); const filterDigest = contentDigest({ query: input.query ?? "", layer: input.layer ?? null }); let afterSortKey: string | undefined;
      if (input.cursor) { const cursor = verifySearchCursor(input.cursor, keyring, { tenant: input.principal.tenantId, subject: input.principal.subject, scopeDigest: contentDigest(scope), baselineId: input.baselineId, projectionManifestId: manifest.id, filterDigest }, now()); afterSortKey = cursor.sortKey; }
      const result = await repository.searchNodes(scope, manifest, { query: input.query, layer: input.layer, afterSortKey, limit }); const next = result.hasMore && result.nodes.at(-1) ? signSearchCursor({ version: 1, keyId: keyring.activeKeyId, tenant: input.principal.tenantId, subject: input.principal.subject, scopeDigest: contentDigest(scope), baselineId: input.baselineId, projectionManifestId: manifest.id, filterDigest, sortKey: result.nodes.at(-1)!.sortKey, assertionId: result.nodes.at(-1)!.assertionId, expiresAt: new Date(now().getTime() + 15 * 60_000).toISOString() }, requireKey(keyring)) : undefined; return { ...envelope(scope, manifest, result.nodes), nodes: result.nodes, ...(next ? { nextCursor: next } : {}) };
    },
    async traceArchitecturePath(input: TraceArchitecturePathInput): Promise<TraceArchitecturePathResult> {
      const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const budget = normalizeBudget(input.budget); const filters = normalizedFilters(input); const queryFingerprint = contentDigest({ startAssertionId: input.startAssertionId, direction: input.direction ?? "both", relationTypes: filters.relationTypes, layers: filters.layers, budget }); let state: ContinuationState | undefined;
      if (input.continuation) { const cursor = verifyTraversalCursor(input.continuation, keyring, { tenant: input.principal.tenantId, subject: input.principal.subject, scopeDigest: contentDigest(scope), baselineId: input.baselineId, projectionManifestId: manifest.id, queryFingerprint }, now()); state = await continuationStore.consume({ browseSessionId: cursor.browseSessionId, sequence: cursor.sequence, tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: scope, baselineId: input.baselineId, projectionManifestId: manifest.id, queryFingerprint }); if (!state) throw new ThreeAQueryError("CURSOR_INVALID"); }
      const result = await walkFrontier(repository, scope, manifest, { frontier: state?.frontier ?? [input.startAssertionId], visitedIds: state?.visitedIds ?? [], direction: input.direction ?? "both", relationTypes: filters.relationTypes, layers: filters.layers, budget }); let continuation: string | undefined;
      if (result.frontier.length > 0) { const created = createTraversalCursor({ tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: scope, baselineId: input.baselineId, projectionManifestId: manifest.id, queryFingerprint, frontier: result.frontier, visitedIds: result.visitedIds, stateDigest: contentDigest(result), expiresAt: new Date(now().getTime() + 15 * 60_000).toISOString() }, keyring, (state?.sequence ?? -1) + 1); await continuationStore.create({ browseSessionId: created.browseSessionId, sequence: created.payload.sequence, tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: scope, baselineId: input.baselineId, projectionManifestId: manifest.id, queryFingerprint, frontier: result.frontier, visitedIds: result.visitedIds, stateDigest: contentDigest(result), expiresAt: created.payload.expiresAt }); continuation = created.token; }
      const envelopeValue = { nodes: result.nodes, edges: result.edges, paths: pathsForEdges(result.edges, budget.maxPaths) }; return { ...envelope(scope, manifest, envelopeValue), nodes: result.nodes, edges: result.edges, paths: envelopeValue.paths, ...(continuation ? { continuation } : {}), ...(result.reasons.length ? { partial: { code: "RESULT_PARTIAL", reasons: result.reasons } } : {}) };
    },
    async getArchitectureFactDetail(input: ArchitectureFactDetailInput): Promise<ArchitectureFactDetail> { const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const detail = await repository.getFact(scope, manifest, input.assertionId); if (!detail) throw new ThreeAQueryError("ARCHITECTURE_FACT_NOT_FOUND"); const edges = await repository.listEdges(scope, manifest, { assertionId: input.assertionId }); const incoming = edges.filter((edge) => edge.targetAssertionId === input.assertionId); const outgoing = edges.filter((edge) => edge.sourceAssertionId === input.assertionId); const value = detail.value ?? {}; const canonicalEnglish = record(value.canonicalContent) ?? record(value.summary); const localizedChinese = record(record(value.localizedContent)?.zh); const warnings = canonicalEnglish ? [] : ["CANONICAL_ENGLISH_MISSING"]; if (!localizedChinese) warnings.push("LOCALIZED_CHINESE_MISSING"); return { ...envelope(scope, manifest, { detail, incoming, outgoing }), node: detail.node, ...(canonicalEnglish ? { canonicalEnglish } : {}), ...(localizedChinese ? { localizedChinese } : {}), factType: detail.factType, aspect: detail.aspect, confidence: detail.confidence, status: detail.status, evidenceRefs: detail.evidenceRefs, sourceObservationIds: detail.sourceObservationIds, unresolvedQuestions: detail.unresolvedQuestions, counterEvidence: detail.counterEvidence, incoming, outgoing, warnings }; },
    async getArchitectureAlignment(input: ArchitectureAlignmentInput): Promise<ArchitectureAlignmentResult> { const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const edges = (await repository.listEdges(scope, manifest)).filter((edge) => edge.sourceSemanticIdentity !== edge.targetSemanticIdentity); return { ...envelope(scope, manifest, edges), edges, warnings: edges.length ? [] : ["ALIGNMENT_EMPTY"] }; },
    async comparePublishedBaselines(input: ComparePublishedBaselinesInput): Promise<PublishedBaselineDrift> { const scope = authorize(input); const baseManifest = await manifestFor(scope, input.baseBaselineId, input.baseProjectionManifestId); const targetManifest = await manifestFor(scope, input.targetBaselineId, input.targetProjectionManifestId); const baselines = await repository.listOfficialBaselines(scope); const baseBaseline = baselines.find((item) => item.id === input.baseBaselineId); const targetBaseline = baselines.find((item) => item.id === input.targetBaselineId); if (!baseBaseline || !targetBaseline || !isOfficialBaseline(baseBaseline) || !isOfficialBaseline(targetBaseline)) throw new ThreeAQueryError("BASELINE_NOT_FOUND"); const [baseEdges, targetEdges, baseNodes, targetNodes] = await Promise.all([repository.listEdges(scope, baseManifest), repository.listEdges(scope, targetManifest), loadNodes(repository, scope, baseManifest), loadNodes(repository, scope, targetManifest)]); return comparePublishedBaselines({ baseBaseline: { ...baseBaseline, architectureScope: scope }, targetBaseline: { ...targetBaseline, architectureScope: scope }, baseManifest, targetManifest, baseNodes, targetNodes, baseEdges, targetEdges }); }
  };
}

function loadNodes(repository: ThreeAQueryRepository, scope: ArchitectureScopeRef, manifest: Parameters<ThreeAQueryRepository["listEdges"]>[1]): Promise<KnowledgeProjectionNode[]> { return repository.searchNodes(scope, manifest, { limit: 1_000 }).then((result) => result.nodes); }
function normalizeBudget(input: Partial<ThreeABudget> | undefined): ThreeABudget { const result = { ...defaultThreeABudget, ...input }; for (const [key, value] of Object.entries(result)) { const hard = hardThreeABudget[key as keyof ThreeABudget]; if (!Number.isFinite(value) || value <= 0 || value > hard) throw new ThreeAQueryError("QUERY_BUDGET_INVALID"); } return result; }
function bounded(value: number, minimum: number, maximum: number): number { return Number.isInteger(value) && value >= minimum && value <= maximum ? value : minimum; }
function requireKey(keyring: CursorKeyring): Buffer { const key = keyring.keys[keyring.activeKeyId]; if (!key) throw new ThreeAQueryError("CURSOR_INVALID"); return key; }
function record(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
interface FrontierWalkInput { frontier: string[]; visitedIds: string[]; direction: TraceDirection; relationTypes: string[]; layers: ArchitectureLayer[]; budget: ThreeABudget; }
interface FrontierWalkResult { nodes: KnowledgeProjectionNode[]; edges: KnowledgeProjectionEdge[]; visitedIds: string[]; frontier: string[]; reasons: ThreeAPartialReason[]; }

function normalizedFilters(input: TraceArchitecturePathInput): { relationTypes: string[]; layers: ArchitectureLayer[] } {
  const relationTypes = [...new Set((input.relationTypes ?? []).map((item) => item.trim()).filter(Boolean))].sort();
  const layers = [...new Set(input.layers ?? [])].sort();
  if (relationTypes.length > 20 || relationTypes.some((item) => item.length > 64)) throw new ThreeAQueryError("QUERY_FILTER_INVALID" as never);
  return { relationTypes, layers };
}

async function walkFrontier(repository: ThreeAQueryRepository, scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, input: FrontierWalkInput): Promise<FrontierWalkResult> {
  const visited = new Set(input.visitedIds);
  let frontier = [...new Set(input.frontier)].sort();
  const acceptedNodes = new Map<string, KnowledgeProjectionNode>();
  const acceptedEdges = new Map<string, KnowledgeProjectionEdge>();
  const reasons = new Set<ThreeAPartialReason>();
  const started = Date.now();
  const seedFacts = await repository.getFactsByIds(scope, manifest, frontier);
  const seedIds = new Set(frontier);
  seedFacts.forEach((fact) => { if (seedIds.has(fact.node.assertionId)) acceptedNodes.set(fact.node.assertionId, fact.node); });

  for (let depth = 0; frontier.length && depth < input.budget.maxDepth; depth += 1) {
    if (Date.now() - started > input.budget.timeoutMs) { reasons.add("TIMEOUT"); break; }
    const remainingEdges = input.budget.maxEdges - acceptedEdges.size;
    if (remainingEdges <= 0) { reasons.add("MAX_EDGES"); break; }
    const page = await repository.listAdjacentEdges(scope, manifest, { frontierAssertionIds: frontier, direction: input.direction, ...(input.relationTypes.length ? { relationTypes: input.relationTypes } : {}), limit: remainingEdges });
    if (page.hasMore) reasons.add("MAX_EDGES");
    const frontierSet = new Set(frontier);
    const candidateIds = [...new Set(page.edges.flatMap((edge) => [edge.sourceAssertionId, edge.targetAssertionId]))];
    const facts = await repository.getFactsByIds(scope, manifest, candidateIds);
    const factById = new Map(facts.map((fact) => [fact.node.assertionId, fact]));
    const next = new Set<string>();

    for (const edge of page.edges) {
      if (!frontierSet.has(edge.sourceAssertionId) && !frontierSet.has(edge.targetAssertionId)) continue;
      if (input.relationTypes.length && !input.relationTypes.includes(edge.relationCode)) continue;
      const source = factById.get(edge.sourceAssertionId)?.node;
      const target = factById.get(edge.targetAssertionId)?.node;
      if (!source || !target) continue;
      const nextId = frontierSet.has(edge.sourceAssertionId) ? edge.targetAssertionId : edge.sourceAssertionId;
      const nextNode = nextId === source.assertionId ? source : target;
      if (input.layers.length && !input.layers.includes(nextNode.layer as ArchitectureLayer)) continue;
      acceptedNodes.set(source.assertionId, source);
      acceptedNodes.set(target.assertionId, target);
      acceptedEdges.set(edge.relationshipIdentity, edge);
      if (!visited.has(nextId)) next.add(nextId);
      if (acceptedNodes.size >= input.budget.maxNodes) { reasons.add("MAX_NODES"); break; }
    }

    frontier.forEach((id) => visited.add(id));
    frontier = [...next].sort();
    if (reasons.has("MAX_NODES") || reasons.has("MAX_EDGES")) break;
  }

  if (frontier.length) reasons.add("MAX_DEPTH");
  return { nodes: [...acceptedNodes.values()], edges: [...acceptedEdges.values()], visitedIds: [...visited].sort(), frontier, reasons: [...reasons] };
}

function pathsForEdges(edges: KnowledgeProjectionEdge[], maxPaths: number): Array<{ assertionIds: string[]; relationshipIdentities: string[] }> {
  return edges.slice(0, maxPaths).map((edge) => ({ assertionIds: [edge.sourceAssertionId, edge.targetAssertionId], relationshipIdentities: [edge.relationshipIdentity] }));
}
