import { defaultHuaweiActor, deriveKnowledgeProjection, hasScopeAccess, scopeById, type ArchitectureScopeRef, type BaselineManifest, type KnowledgeAssertion, type KnowledgeProjectionRelationship } from "@specforge/core";
import { ensureMcpPersistenceSchema, prisma } from "../persistence";

export interface DeriveKnowledgeProjectionInput {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  currentAssertionIds?: string[];
}

export async function deriveScopedKnowledgeProjection(input: DeriveKnowledgeProjectionInput) {
  const scope = readableExactScope(input.architectureScope);
  await ensureMcpPersistenceSchema();
  const baselineRow = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.baselineId } } });
  if (!baselineRow) throw new Error("BASELINE_NOT_FOUND");
  const manifest = baselineRow.manifest as unknown as BaselineManifest;
  const sourceRevisionIds = Array.isArray(manifest.sourceRevisionIds) ? manifest.sourceRevisionIds : [];
  const rows = await prisma.knowledgeAssertion.findMany({
    where: {
      ...scope,
      status: "ACCEPTED",
      OR: [{ changeSetId: baselineRow.changeSetId }, { id: { in: sourceRevisionIds } }]
    },
    orderBy: [{ semanticIdentity: "asc" }, { revision: "asc" }]
  });
  const assertions = rows.map(assertionFromRow);
  const currentRows = input.currentAssertionIds?.length
    ? await prisma.knowledgeAssertion.findMany({ where: { ...scope, id: { in: input.currentAssertionIds }, status: "ACCEPTED" }, orderBy: [{ semanticIdentity: "asc" }, { revision: "asc" }] })
    : assertions;
  return deriveKnowledgeProjection({
    baseline: { id: baselineRow.id, status: baselineRow.status as "PUBLISHED" | "SUPERSEDED" | "BLOCKED", manifest, architectureScope: scope },
    assertions,
    currentAssertions: currentRows.map(assertionFromRow),
    relationships: relationshipFacts(assertions, scope)
  });
}

function readableExactScope(scope: ArchitectureScopeRef): ArchitectureScopeRef {
  const registered = scopeById(scope.applicationServiceId);
  if (!registered || registered.scopePath !== scope.scopePath || !hasScopeAccess(defaultHuaweiActor, registered, "read")) throw new Error("Scope read is not authorized.");
  return scope;
}

function assertionFromRow(row: any): KnowledgeAssertion {
  return { id: row.id, semanticIdentity: row.semanticIdentity, factType: row.factType, layer: row.layer, aspect: row.aspect, value: row.value as Record<string, unknown>, architectureScope: { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath }, status: row.status, confidence: row.confidence, matchingEvidence: row.matchingEvidence as string[], counterEvidence: row.counterEvidence as string[], unresolvedQuestions: row.unresolvedQuestions as string[], evidenceRefs: row.evidenceRefs as string[], sourceObservationIds: row.sourceObservationIds as string[], extractorId: row.extractorId, riskTier: row.riskTier ?? undefined, domainCluster: row.domainCluster ?? undefined, generatedByActorId: row.generatedByActorId ?? undefined, revision: row.revision, changeSetId: row.changeSetId ?? undefined, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function relationshipFacts(assertions: readonly KnowledgeAssertion[], scope: ArchitectureScopeRef): KnowledgeProjectionRelationship[] {
  const byIdentity = new Map(assertions.map((assertion) => [assertion.semanticIdentity, assertion]));
  const result: KnowledgeProjectionRelationship[] = [];
  for (const assertion of assertions) {
    const canonical = assertion.value.canonicalContent;
    if (!canonical || typeof canonical !== "object" || Array.isArray(canonical)) continue;
    const source = endpoint((canonical as Record<string, unknown>).source);
    const target = endpoint((canonical as Record<string, unknown>).target);
    const code = typeof (canonical as Record<string, unknown>).relationType === "string" ? (canonical as Record<string, unknown>).relationType as string : undefined;
    if (!source || !target || !code) continue;
    const sourceAssertion = byIdentity.get(source);
    const targetAssertion = byIdentity.get(target);
    if (!sourceAssertion || !targetAssertion) continue;
    result.push({ id: assertion.id, sourceAssertionId: sourceAssertion.id, targetAssertionId: targetAssertion.id, code, confidence: assertion.confidence, architectureScope: scope });
  }
  return result;
}

function endpoint(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.semanticIdentity === "string" ? record.semanticIdentity : undefined;
}
