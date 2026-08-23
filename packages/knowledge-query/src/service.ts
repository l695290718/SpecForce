import { authorizePrincipalScope, comparePublishedBaselines, contentDigest, DEFAULT_ARCHITECTURE_MAP_BUDGET, isOfficialBaseline, validateArchitectureMapBudget, type ArchitectureMapBudget, type ArchitectureScopeRef, type KnowledgeProjectionEdge, type KnowledgeProjectionNode, type ProjectionManifestV2, type PublishedBaselineDrift } from "@specforge/core";
import { ThreeAQueryError } from "./errors";
import { createTraversalCursor, signSearchCursor, verifySearchCursor, verifyTraversalCursor, type CursorKeyring } from "./cursor";
import { classifyImpactBand, defaultGraphAnalysisBudget, defaultImpactGraphAnalysisBudget, normalizeGraphAnalysisBudget, normalizeImpactPolicyVersion, scoreImpact, sortImpactItems } from "./graph-analysis";
import type { GraphAnalysisRepository } from "./graph-analysis-repository";
import { defaultThreeABudget, hardThreeABudget } from "./types";
import type { ArchitectureAlignmentInput, ArchitectureAlignmentResult, ArchitectureFactDetail, ArchitectureFactDetailInput, ArchitectureGraphQueryProvider, ArchitectureLayer, ArchitectureMapQueryInput, ArchitectureMapQueryRepository, ArchitectureMapQueryResult, ArchitectureUnitNeighborhoodInput, ArchitectureUnitNeighborhoodResult, BaselineQueryInput, ComparePublishedBaselinesInput, ContinuationState, GraphAnalysisBudget, GraphSummaryEdge, GraphSummaryNode, ImpactArchitectureInput, ImpactArchitectureItem, ImpactArchitectureResult, OverviewArchitectureInput, OverviewArchitectureResult, SearchArchitectureFactsInput, SearchArchitectureFactsResult, ThreeAProjectionQueryService, TraceArchitecturePathInput, TraceArchitecturePathResult, TraceContinuationStore, ScopedQueryInput, QueryResultEnvelope, ThreeABudget, ThreeAPartialReason, ThreeAQueryRepository, TraceDirection, ArchitectureUnitPageCursor, UnitGraphQueryInput, UnitGraphQueryResult } from "./types";

export function createThreeAProjectionQueryService(repository: ThreeAQueryRepository, continuationStore: TraceContinuationStore, keyring: CursorKeyring, now = () => new Date(), graphRepository?: GraphAnalysisRepository): ThreeAProjectionQueryService & ArchitectureGraphQueryProvider {
  const authorize = (input: { principal: Parameters<typeof authorizePrincipalScope>[0]; architectureScope: ArchitectureScopeRef }): ArchitectureScopeRef => { try { return authorizePrincipalScope(input.principal, input.architectureScope, "read"); } catch { throw new ThreeAQueryError("SCOPE_ACCESS_DENIED"); } };
  const manifestFor = async (scope: ArchitectureScopeRef, baselineId: string, manifestId: string) => { const manifests = await repository.listPublishedManifests(scope, baselineId); const manifest = manifests.find((item) => item.id === manifestId && item.projectionSchemaVersion === "3a.v2"); if (!manifest) throw new ThreeAQueryError("PROJECTION_MANIFEST_REQUIRED"); return manifest; };
  const envelope = (scope: ArchitectureScopeRef, manifest: { baselineId: string; id: string; profileId: string; profileVersion: string; relationshipVersion: string }, value: unknown): QueryResultEnvelope => ({ ...scope, baselineId: manifest.baselineId, projectionManifestId: manifest.id, profileId: manifest.profileId, profileVersion: manifest.profileVersion, relationshipVersion: manifest.relationshipVersion, resultDigest: contentDigest(value) });
  const requireGraphRepository = (): GraphAnalysisRepository => {
    if (!graphRepository) throw new Error("GRAPH_ANALYSIS_UNAVAILABLE");
    return graphRepository;
  };
  const consumeContinuation = async (input: { principal: Parameters<typeof authorizePrincipalScope>[0]; continuation?: string; architectureScope: ArchitectureScopeRef; baselineId: string; projectionManifestId: string; queryFingerprint: string }): Promise<ContinuationState | undefined> => {
    if (!input.continuation) return undefined;
    const cursor = verifyTraversalCursor(input.continuation, keyring, { tenant: input.principal.tenantId, subject: input.principal.subject, scopeDigest: contentDigest(input.architectureScope), baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint: input.queryFingerprint }, now());
    const state = await continuationStore.consume({ browseSessionId: cursor.browseSessionId, sequence: cursor.sequence, tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: input.architectureScope, baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint: input.queryFingerprint });
    if (!state || state.frontier.length > 1 || state.visitedIds.length) throw new ThreeAQueryError("CURSOR_INVALID");
    return state;
  };
  const createContinuation = async (input: { principal: Parameters<typeof authorizePrincipalScope>[0]; architectureScope: ArchitectureScopeRef; baselineId: string; projectionManifestId: string; queryFingerprint: string; after: string; sequence: number }): Promise<string> => {
    const created = createTraversalCursor({ tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: input.architectureScope, baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint: input.queryFingerprint, frontier: [input.after], visitedIds: [], stateDigest: contentDigest({ after: input.after, queryFingerprint: input.queryFingerprint }), expiresAt: new Date(now().getTime() + 15 * 60_000).toISOString() }, keyring, input.sequence);
    await continuationStore.create({ browseSessionId: created.browseSessionId, sequence: created.payload.sequence, tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: input.architectureScope, baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint: input.queryFingerprint, frontier: [input.after], visitedIds: [], stateDigest: contentDigest({ after: input.after, queryFingerprint: input.queryFingerprint }), expiresAt: created.payload.expiresAt });
    return created.token;
  };
  const service = {
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
    async getArchitectureAlignment(input: ArchitectureAlignmentInput): Promise<ArchitectureAlignmentResult> { const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const edges = (await (input.limit === undefined ? repository.listEdges(scope, manifest) : repository.listEdges(scope, manifest, { limit: bounded(input.limit, 1, 2_000) }))).filter((edge) => edge.sourceSemanticIdentity !== edge.targetSemanticIdentity); return { ...envelope(scope, manifest, edges), edges, warnings: edges.length ? [] : ["ALIGNMENT_EMPTY"] }; },
    async comparePublishedBaselines(input: ComparePublishedBaselinesInput): Promise<PublishedBaselineDrift> { const scope = authorize(input); const baseManifest = await manifestFor(scope, input.baseBaselineId, input.baseProjectionManifestId); const targetManifest = await manifestFor(scope, input.targetBaselineId, input.targetProjectionManifestId); const baselines = await repository.listOfficialBaselines(scope); const baseBaseline = baselines.find((item) => item.id === input.baseBaselineId); const targetBaseline = baselines.find((item) => item.id === input.targetBaselineId); if (!baseBaseline || !targetBaseline || !isOfficialBaseline(baseBaseline) || !isOfficialBaseline(targetBaseline)) throw new ThreeAQueryError("BASELINE_NOT_FOUND"); const [baseEdges, targetEdges, baseNodes, targetNodes] = await Promise.all([repository.listEdges(scope, baseManifest), repository.listEdges(scope, targetManifest), loadNodes(repository, scope, baseManifest), loadNodes(repository, scope, targetManifest)]); return comparePublishedBaselines({ baseBaseline: { ...baseBaseline, architectureScope: scope }, targetBaseline: { ...targetBaseline, architectureScope: scope }, baseManifest, targetManifest, baseNodes, targetNodes, baseEdges, targetEdges }); },
    async architectureMap(input: ArchitectureMapQueryInput): Promise<ArchitectureMapQueryResult> {
      const scope = authorize(input);
      const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId);
      const mapRepository = repository as ThreeAQueryRepository & Partial<ArchitectureMapQueryRepository>;
      if (!mapRepository.listArchitectureUnits || !mapRepository.listArchitectureUnitMappings) throw new ThreeAQueryError("ARCHITECTURE_MAP_UNAVAILABLE");
      if (input.generationId !== manifest.generationId) throw new ThreeAQueryError("ARCHITECTURE_MAP_QUERY_INVALID");
      const identity = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id };
      const budget = normalizeArchitectureMapBudget(input.budget);
      const filter = normalizeArchitectureUnitFilter(input.filter);
      const queryFingerprint = contentDigest({ operation: "architectureMap", identity, filter, budget });
      const cursor = input.continuation ? await mapContinuation(input, queryFingerprint, keyring, continuationStore, now) : { BIZ: 0, SYS: 0, TECH: 0 };
      const page = await mapRepository.listArchitectureUnits(identity, filter, budget, cursor);
      const mappingPage = await mapRepository.listArchitectureUnitMappings(identity, page.units.map((unit) => unit.unitIdentity), budget.maxMappings, filter.mappingFamilies);
      const units = [...page.units].sort(compareArchitectureUnits);
      const mappings = [...mappingPage.mappings].sort(compareArchitectureMappings);
      const mappedIds = new Set(mappings.flatMap((mapping) => [mapping.sourceUnitIdentity, mapping.targetUnitIdentity]));
      const evidenceTotal = units.reduce((total, unit) => total + unit.evidenceCount, 0) + mappings.reduce((total, mapping) => total + mapping.evidenceCount, 0);
      const evidenceDenominator = units.reduce((total, unit) => total + unit.memberCount, 0) + mappings.length;
      const reasons = [...(page.nextCursor ? ["CONTINUATION_REQUIRED", "UNIT_BUDGET_EXCEEDED"] as const : []), ...(mappingPage.hasMore ? ["MAPPING_BUDGET_EXCEEDED"] as const : [])];
      const nextContinuation = page.nextCursor ? await createMapContinuation(input, queryFingerprint, page.nextCursor, (cursor.BIZ + cursor.SYS + cursor.TECH) + 1, keyring, continuationStore, now) : undefined;
      const value = { generationId: manifest.generationId, availability: units.length ? "READY" as const : "NO_GOVERNED_ARCHITECTURE_UNITS" as const, units, mappings, totalByLayer: page.totalByLayer, returnedByLayer: countByLayer(units), unclassifiedCount: page.unclassifiedCount, mappingCompleteness: units.length ? mappedIds.size / units.length : 0, evidenceCoverage: evidenceDenominator ? Number((evidenceTotal / evidenceDenominator).toFixed(6)) : 0, ...(nextContinuation ? { continuation: nextContinuation } : {}), ...(reasons.length ? { partial: { code: "RESULT_PARTIAL" as const, reasons: uniqueArchitectureMapReasons(reasons) } } : {}) };
      return { ...envelope(scope, manifest, value), ...value };
    },
    async unitGraph(input: UnitGraphQueryInput): Promise<UnitGraphQueryResult> {
      const map = await service.architectureMap({ ...input, filter: input.filter ?? {} });
      const scope = authorize(input);
      const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId);
      const analysis = graphRepository
        ? await graphRepository.loadOverview(scope, manifest, { layers: [], assetTypes: [], relationTypes: [], budget: defaultGraphAnalysisBudget })
        : undefined;
      const assertionProbe = await repository.searchNodes(scope, manifest, { limit: 1 });
      const nodes = map.units.map((unit, index) => ({
        applicationServiceId: unit.applicationServiceId,
        scopePath: unit.scopePath,
        id: unit.unitIdentity,
        kind: "cluster" as const,
        label: unit.canonicalName,
        layer: unit.layer,
        clusterId: unit.unitIdentity,
        memberCount: unit.memberCount,
        degree: map.mappings.filter((mapping) => mapping.sourceUnitIdentity === unit.unitIdentity || mapping.targetUnitIdentity === unit.unitIdentity).length,
        criticality: unit.criticality,
        positionSeed: { x: Math.cos((index / Math.max(map.units.length, 1)) * Math.PI * 2), y: Math.sin((index / Math.max(map.units.length, 1)) * Math.PI * 2) }
      }));
      const edges = map.mappings.map((mapping) => ({
        applicationServiceId: mapping.applicationServiceId,
        scopePath: mapping.scopePath,
        id: mapping.mappingIdentity,
        sourceId: mapping.sourceUnitIdentity,
        targetId: mapping.targetUnitIdentity,
        relationCode: mapping.mappingFamily,
        confidence: mapping.confidence,
        bridge: mapping.sourceLayer !== mapping.targetLayer
      }));
      const value = {
        generationId: map.generationId,
        availability: map.availability,
        source: "ARCHITECTURE_UNIT_PROJECTION" as const,
        fidelity: "UNIT" as const,
        analysisAvailability: assertionProbe.nodes.length === 0 ? "EMPTY" as const : analysis?.availability ?? "UNAVAILABLE" as const,
        nodes,
        edges,
        ...(map.continuation ? { continuation: map.continuation } : {}),
        ...(map.partial ? { partial: map.partial } : {})
      };
      return { ...envelope(scope, manifest, value), ...value };
    },
    async architectureUnitNeighborhood(input: ArchitectureUnitNeighborhoodInput): Promise<ArchitectureUnitNeighborhoodResult> {
      const scope = authorize(input);
      const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId);
      const mapRepository = repository as ThreeAQueryRepository & Partial<ArchitectureMapQueryRepository>;
      if (!mapRepository.getArchitectureUnitsByIdentity || !mapRepository.listArchitectureUnitMembers || !mapRepository.listArchitectureUnitNeighborhoodMappings || !mapRepository.listSameLayerDependencies) throw new ThreeAQueryError("ARCHITECTURE_MAP_UNAVAILABLE");
      if (input.generationId !== manifest.generationId || !input.unitIdentity.startsWith("unit:") || input.depth < 1 || input.depth > 3) throw new ThreeAQueryError("ARCHITECTURE_MAP_QUERY_INVALID");
      const identity = { ...scope, generationId: manifest.generationId, baselineId: manifest.baselineId, projectionManifestId: manifest.id };
      const budget = normalizeArchitectureMapBudget(input.budget);
      const selected = await mapRepository.getArchitectureUnitsByIdentity(identity, [input.unitIdentity]);
      const unit = selected[0];
      if (!unit) throw new ThreeAQueryError("ARCHITECTURE_UNIT_NOT_FOUND");
      const mappingPage = await mapRepository.listArchitectureUnitNeighborhoodMappings(identity, [unit.unitIdentity], input.direction, budget.maxMappings, input.mappingFamilies);
      const memberPage = await mapRepository.listArchitectureUnitMembers(identity, unit.unitIdentity, budget.maxMappings, input.memberAssetTypes);
      const dependencyPage = await mapRepository.listSameLayerDependencies(identity, memberPage.members.map((member) => member.assertionId), budget.maxMappings);
      const adjacentIds = [...new Set(mappingPage.mappings.flatMap((mapping) => [mapping.sourceUnitIdentity, mapping.targetUnitIdentity]).filter((id) => id !== unit.unitIdentity))];
      const adjacentUnits = mapRepository.getArchitectureUnitsByIdentity(identity, adjacentIds);
      const [neighbors] = await Promise.all([adjacentUnits]);
      const evidenceRefs = [unit.contentDigest, ...mappingPage.mappings.map((mapping) => mapping.contentDigest), ...memberPage.members.map((member) => member.contentDigest), ...dependencyPage.edges.map((edge) => edge.contentDigest)];
      const partialReasons = [...(mappingPage.hasMore ? ["MAPPING_BUDGET_EXCEEDED"] : []), ...(memberPage.hasMore ? ["UNIT_BUDGET_EXCEEDED"] : []), ...(dependencyPage.hasMore ? ["MAPPING_BUDGET_EXCEEDED"] : [])];
      const value = { generationId: manifest.generationId, unit, adjacentUnits: neighbors.sort(compareArchitectureUnits), members: memberPage.members, mappings: mappingPage.mappings.sort(compareArchitectureMappings), sameLayerDependencies: dependencyPage.edges, evidenceRefs, ...(partialReasons.length ? { partial: { code: "RESULT_PARTIAL" as const, reasons: uniqueArchitectureMapReasons(partialReasons) } } : {}) };
      return { ...envelope(scope, manifest, value), ...value };
    },
    async overview(input: OverviewArchitectureInput): Promise<OverviewArchitectureResult> {
      const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const budget = normalizeGraphAnalysisBudget(input.budget, defaultGraphAnalysisBudget); const filters = normalizedGraphFilters(input); const queryFingerprint = graphFingerprint("overview", scope, manifest, { filters, budget }); const state = await consumeContinuation({ ...input, architectureScope: scope, projectionManifestId: manifest.id, queryFingerprint });
      const result = await requireGraphRepository().loadOverview(scope, manifest, { ...filters, afterClusterId: state?.frontier[0], budget });
      if (result.availability !== "READY" || !result.analysis) throw new Error("GRAPH_ANALYSIS_UNAVAILABLE");
      const bounded = boundOverviewPayload(result.nodes, result.edges, budget);
      const after = bounded.nodes.at(-1)?.clusterId;
      const hasMore = Boolean(result.nextAfterClusterId || bounded.truncated);
      const continuation = hasMore && after ? await createContinuation({ principal: input.principal, architectureScope: scope, baselineId: input.baselineId, projectionManifestId: manifest.id, queryFingerprint, after, sequence: (state?.sequence ?? -1) + 1 }) : undefined;
      const reasons = uniqueReasons([...result.partialReasons, ...bounded.reasons]); const value = { nodes: bounded.nodes, edges: bounded.edges, ...(continuation ? { continuation } : {}), ...(reasons.length ? { partial: { code: "RESULT_PARTIAL" as const, reasons } } : {}) };
      return { ...envelope(scope, manifest, value), ...value };
    },
    async neighborhood(input: TraceArchitecturePathInput): Promise<TraceArchitecturePathResult> { return service.traceArchitecturePath(input); },
    async impact(input: ImpactArchitectureInput): Promise<ImpactArchitectureResult> {
      const scope = authorize(input); const manifest = await manifestFor(scope, input.baselineId, input.projectionManifestId); const budget = normalizeGraphAnalysisBudget(input.budget, defaultImpactGraphAnalysisBudget); const filters = normalizedGraphFilters(input); const policyVersion = normalizeImpactPolicyVersion(input.policyVersion); const queryFingerprint = graphFingerprint("impact", scope, manifest, { focusAssertionId: input.focusAssertionId, direction: input.direction, filters, policyVersion, budget }); const state = await consumeContinuation({ ...input, architectureScope: scope, projectionManifestId: manifest.id, queryFingerprint });
      const focus = await repository.getFact(scope, manifest, input.focusAssertionId); if (!focus) throw new Error("FOCUS_NOT_IN_BASELINE");
      const result = await requireGraphRepository().loadImpact(scope, manifest, { analysisVersion: undefined, focusAssertionId: input.focusAssertionId, direction: input.direction, layers: filters.layers, relationTypes: filters.relationTypes, afterAssertionId: state?.frontier[0], budget });
      if (result.availability !== "READY" || !result.analysis || result.analysis.policyVersion !== policyVersion) throw new Error("GRAPH_ANALYSIS_UNAVAILABLE");
      const facts = await repository.getFactsByIds(scope, manifest, result.metrics.map((metric) => metric.assertionId)); const factsById = new Map(facts.map((fact) => [fact.node.assertionId, fact.node])); const partial = result.partialReasons.length > 0;
      const items = sortImpactItems(result.metrics.flatMap((metric) => { const node = factsById.get(metric.assertionId); const edge = edgeForMetric(result.edges, input.focusAssertionId, metric.assertionId, input.direction); if (!node || !edge) return []; const relationWeight = input.direction === "upstream" ? metric.outboundImpactWeight : input.direction === "downstream" ? metric.inboundImpactWeight : Math.max(metric.inboundImpactWeight, metric.outboundImpactWeight); const scored = scoreImpact({ relationWeight, confidence: edge.confidence, criticalityWeight: metric.criticality, depth: 1 }); return [{ ...node, depth: 1, band: classifyImpactBand(1, scored.score, partial), score: scored.score, factors: scored.factors }]; }));
      const bounded = boundImpactPayload(items, result.edges, budget); const countsByBand = { DIRECT: 0, LIKELY: 0, EXTENDED: 0, UNRESOLVED: 0 } as Record<"DIRECT" | "LIKELY" | "EXTENDED" | "UNRESOLVED", number>; bounded.items.forEach((item) => { countsByBand[item.band] += 1; }); const paths = bounded.edges.slice(0, budget.maxPaths).map((edge) => ({ assertionIds: [edge.sourceAssertionId, edge.targetAssertionId], relationshipIdentities: [edge.relationshipIdentity] })); const after = bounded.items.at(-1)?.assertionId; const hasMore = Boolean(result.nextAfterAssertionId || bounded.truncated); const continuation = hasMore && after ? await createContinuation({ principal: input.principal, architectureScope: scope, baselineId: input.baselineId, projectionManifestId: manifest.id, queryFingerprint, after, sequence: (state?.sequence ?? -1) + 1 }) : undefined; const reasons = uniqueReasons([...result.partialReasons, ...bounded.reasons, ...(result.edges.length > paths.length ? ["MAX_PATHS" as const] : [])]); const value = { focusAssertionId: input.focusAssertionId, policyVersion, items: bounded.items, paths, cutPointAssertionIds: bounded.items.filter((item) => result.metrics.find((metric) => metric.assertionId === item.assertionId)?.bridge).map((item) => item.assertionId).sort(), countsByBand, ...(continuation ? { continuation } : {}), ...(reasons.length ? { partial: { code: "RESULT_PARTIAL" as const, reasons } } : {}) };
      return { ...envelope(scope, manifest, value), ...value };
    }
  } satisfies ThreeAProjectionQueryService & ArchitectureGraphQueryProvider;
  return service;
}

function loadNodes(repository: ThreeAQueryRepository, scope: ArchitectureScopeRef, manifest: Parameters<ThreeAQueryRepository["listEdges"]>[1]): Promise<KnowledgeProjectionNode[]> { return repository.searchNodes(scope, manifest, { limit: 1_000 }).then((result) => result.nodes); }
function normalizedGraphFilters(input: Pick<OverviewArchitectureInput, "layers" | "assetTypes" | "relationTypes"> | Pick<ImpactArchitectureInput, "layers" | "relationTypes">): { layers: ArchitectureLayer[]; assetTypes: string[]; relationTypes: string[] } {
  const layers = [...new Set(input.layers ?? [])].sort(); const relationTypes = [...new Set((input.relationTypes ?? []).map((item) => item.trim()).filter(Boolean))].sort(); const assetTypes = "assetTypes" in input ? [...new Set((input.assetTypes ?? []).map((item) => item.trim()).filter(Boolean))].sort() : [];
  if (layers.length > 3 || relationTypes.length > 20 || assetTypes.length > 20 || relationTypes.some((item) => item.length > 64) || assetTypes.some((item) => item.length > 64)) throw new ThreeAQueryError("QUERY_BUDGET_INVALID");
  return { layers, assetTypes, relationTypes };
}
function graphFingerprint(operation: "overview" | "impact", scope: ArchitectureScopeRef, manifest: ProjectionManifestV2, value: unknown): string { return contentDigest({ operation, scopeDigest: contentDigest(scope), baselineId: manifest.baselineId, projectionManifestId: manifest.id, value }); }
function normalizeArchitectureMapBudget(input: Partial<ArchitectureMapBudget> | undefined): ArchitectureMapBudget { const budget = { ...DEFAULT_ARCHITECTURE_MAP_BUDGET, ...input }; try { validateArchitectureMapBudget(budget); if (budget.maxUnitsPerLayer > 12 || budget.maxMappings > 60 || budget.timeoutMs > 2_000 || budget.maxPayloadBytes > 524_288) throw new Error(); } catch { throw new ThreeAQueryError("QUERY_BUDGET_INVALID"); } return budget; }
function normalizeArchitectureUnitFilter(input: ArchitectureMapQueryInput["filter"]): NonNullable<ArchitectureMapQueryInput["filter"]> { const filter = input ?? {}; if ((filter.layers?.length ?? 0) > 3 || (filter.kinds?.length ?? 0) > 20 || (filter.mappingFamilies?.length ?? 0) > 20 || (filter.query?.length ?? 0) > 256) throw new ThreeAQueryError("ARCHITECTURE_MAP_QUERY_INVALID"); return { ...filter, ...(filter.query?.trim() ? { query: filter.query.trim() } : {}) }; }
function countByLayer(units: { layer: ArchitectureLayer }[]): Record<ArchitectureLayer, number> { return units.reduce((counts, unit) => { counts[unit.layer] += 1; return counts; }, { BIZ: 0, SYS: 0, TECH: 0 }); }
function uniqueArchitectureMapReasons(reasons: string[]): ("UNIT_BUDGET_EXCEEDED" | "MAPPING_BUDGET_EXCEEDED" | "QUERY_TIMEOUT" | "PAYLOAD_BUDGET_EXCEEDED" | "CONTINUATION_REQUIRED")[] { return [...new Set(reasons)].filter((reason): reason is "UNIT_BUDGET_EXCEEDED" | "MAPPING_BUDGET_EXCEEDED" | "QUERY_TIMEOUT" | "PAYLOAD_BUDGET_EXCEEDED" | "CONTINUATION_REQUIRED" => ["UNIT_BUDGET_EXCEEDED", "MAPPING_BUDGET_EXCEEDED", "QUERY_TIMEOUT", "PAYLOAD_BUDGET_EXCEEDED", "CONTINUATION_REQUIRED"].includes(reason)); }
function compareArchitectureUnits(left: { parentUnitIdentity?: string; criticality: number; canonicalName: string; unitIdentity: string }, right: { parentUnitIdentity?: string; criticality: number; canonicalName: string; unitIdentity: string }): number { return (left.parentUnitIdentity ?? "").localeCompare(right.parentUnitIdentity ?? "", "en") || right.criticality - left.criticality || left.canonicalName.localeCompare(right.canonicalName, "en") || left.unitIdentity.localeCompare(right.unitIdentity, "en"); }
function compareArchitectureMappings(left: { sourceUnitIdentity: string; targetUnitIdentity: string; mappingFamily: string; mappingIdentity: string }, right: { sourceUnitIdentity: string; targetUnitIdentity: string; mappingFamily: string; mappingIdentity: string }): number { return left.sourceUnitIdentity.localeCompare(right.sourceUnitIdentity, "en") || left.targetUnitIdentity.localeCompare(right.targetUnitIdentity, "en") || left.mappingFamily.localeCompare(right.mappingFamily, "en") || left.mappingIdentity.localeCompare(right.mappingIdentity, "en"); }
async function mapContinuation(input: ArchitectureMapQueryInput, queryFingerprint: string, keyring: CursorKeyring, store: TraceContinuationStore, now: () => Date): Promise<ArchitectureUnitPageCursor> {
  const cursor = verifyTraversalCursor(input.continuation!, keyring, { tenant: input.principal.tenantId, subject: input.principal.subject, scopeDigest: contentDigest(input.architectureScope), baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint }, now());
  if (cursor.queryFingerprint !== queryFingerprint) throw new ThreeAQueryError("CURSOR_INVALID");
  const state = await store.consume({ browseSessionId: cursor.browseSessionId, sequence: cursor.sequence, tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: input.architectureScope, baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint });
  if (!state) throw new ThreeAQueryError("CURSOR_INVALID");
  try { return JSON.parse(state.frontier[0] ?? "") as ArchitectureUnitPageCursor; } catch { throw new ThreeAQueryError("CURSOR_INVALID"); }
}
async function createMapContinuation(input: ArchitectureMapQueryInput, queryFingerprint: string, nextCursor: ArchitectureUnitPageCursor, sequence: number, keyring: CursorKeyring, store: TraceContinuationStore, now: () => Date): Promise<string> {
  const state = { tenantId: input.principal.tenantId, subject: input.principal.subject, architectureScope: input.architectureScope, baselineId: input.baselineId, projectionManifestId: input.projectionManifestId, queryFingerprint, frontier: [JSON.stringify(nextCursor)], visitedIds: [], stateDigest: contentDigest(nextCursor), expiresAt: new Date(now().getTime() + 15 * 60_000).toISOString() };
  const created = createTraversalCursor(state, keyring, sequence);
  await store.create({ browseSessionId: created.browseSessionId, sequence: created.payload.sequence, ...state });
  return created.token;
}
function edgeForMetric(edges: readonly KnowledgeProjectionEdge[], focusAssertionId: string, assertionId: string, direction: TraceDirection): KnowledgeProjectionEdge | undefined {
  return edges.filter((edge) => direction === "downstream" ? edge.sourceAssertionId === focusAssertionId && edge.targetAssertionId === assertionId : direction === "upstream" ? edge.targetAssertionId === focusAssertionId && edge.sourceAssertionId === assertionId : (edge.sourceAssertionId === focusAssertionId && edge.targetAssertionId === assertionId) || (edge.targetAssertionId === focusAssertionId && edge.sourceAssertionId === assertionId)).sort((left, right) => left.relationCode.localeCompare(right.relationCode) || left.relationshipIdentity.localeCompare(right.relationshipIdentity))[0];
}
function boundOverviewPayload(nodes: readonly GraphSummaryNode[], edges: readonly GraphSummaryEdge[], budget: GraphAnalysisBudget): { nodes: GraphSummaryNode[]; edges: GraphSummaryEdge[]; reasons: ThreeAPartialReason[]; truncated: boolean } {
  const acceptedNodes: GraphSummaryNode[] = []; const acceptedEdges: GraphSummaryEdge[] = []; let size = 0;
  for (const node of nodes) { const next = jsonSize(node); if (acceptedNodes.length >= budget.maxNodes || size + next > budget.maxPayloadBytes) break; acceptedNodes.push(node); size += next; }
  const ids = new Set(acceptedNodes.map((node) => node.id));
  for (const edge of edges) { const next = jsonSize(edge); if (!ids.has(edge.sourceId) || !ids.has(edge.targetId) || acceptedEdges.length >= budget.maxEdges || size + next > budget.maxPayloadBytes) continue; acceptedEdges.push(edge); size += next; }
  const reasons = uniqueReasons([...(acceptedNodes.length < nodes.length ? ["MAX_NODES" as const] : []), ...(acceptedEdges.length < edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)).length ? ["MAX_EDGES" as const] : []), ...(size >= budget.maxPayloadBytes ? ["MAX_PAYLOAD" as const] : [])]);
  return { nodes: acceptedNodes, edges: acceptedEdges, reasons, truncated: acceptedNodes.length < nodes.length || acceptedEdges.length < edges.length };
}
function boundImpactPayload(items: readonly ImpactArchitectureItem[], edges: readonly KnowledgeProjectionEdge[], budget: GraphAnalysisBudget): { items: ImpactArchitectureItem[]; edges: KnowledgeProjectionEdge[]; reasons: ThreeAPartialReason[]; truncated: boolean } {
  const acceptedItems: ImpactArchitectureItem[] = []; let size = 0;
  for (const item of items) { const next = jsonSize(item); if (acceptedItems.length >= budget.maxNodes || size + next > budget.maxPayloadBytes) break; acceptedItems.push(item); size += next; }
  const ids = new Set(acceptedItems.map((item) => item.assertionId)); const acceptedEdges = edges.filter((edge) => ids.has(edge.sourceAssertionId) || ids.has(edge.targetAssertionId)).slice(0, budget.maxEdges); let edgeBytes = acceptedEdges.reduce((total, edge) => total + jsonSize(edge), 0);
  while (acceptedEdges.length && size + edgeBytes > budget.maxPayloadBytes) { edgeBytes -= jsonSize(acceptedEdges.pop()!); }
  const reasons = uniqueReasons([...(acceptedItems.length < items.length ? ["MAX_NODES" as const] : []), ...(acceptedEdges.length < edges.length ? ["MAX_EDGES" as const] : []), ...(size + edgeBytes >= budget.maxPayloadBytes ? ["MAX_PAYLOAD" as const] : [])]);
  return { items: acceptedItems, edges: acceptedEdges, reasons, truncated: acceptedItems.length < items.length || acceptedEdges.length < edges.length };
}
function jsonSize(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }
function uniqueReasons(reasons: readonly ThreeAPartialReason[]): ThreeAPartialReason[] { return [...new Set(reasons)].sort() as ThreeAPartialReason[]; }
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
