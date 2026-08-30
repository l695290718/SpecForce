import { contentDigest, type ArchitectureScopeRef, type KnowledgeEvidenceSnapshot, type KnowledgeReadinessPolicy, type KnowledgeSourceRole, type KnowledgeSourceRequirement, type KnowledgeProfileId } from "@specforge/core";
import type { Prisma } from "@prisma/client";
import type { ReadinessDb } from "./repository";

export interface KnowledgeWaterlineEnvelope {
  waterlines: {
    baseline: string;
    catalog: string;
    relationships: string;
    connectors: string;
    snapshots: string;
    pending: string;
    conflicts: string;
    reconciliation: string;
  };
  waterlineDigest: string;
  coverageSummary: Record<string, number | string>;
  freshnessSummary: Record<string, string | number>;
}

export type KnowledgeEvidenceSnapshotWithWaterlines = KnowledgeEvidenceSnapshot & KnowledgeWaterlineEnvelope;

const sourceRoles = new Set<KnowledgeSourceRole>([
  "DESIGN_CATALOG",
  "SOURCE_CODE",
  "API_SCHEMA",
  "DATA_SCHEMA",
  "TEST_EVIDENCE",
  "DEPLOYMENT",
  "RUNTIME_TELEMETRY"
]);

const kindRoleMap: Record<string, KnowledgeSourceRole> = {
  "source-code": "SOURCE_CODE",
  "api-schema": "API_SCHEMA",
  "data-schema": "DATA_SCHEMA",
  "test-evidence": "TEST_EVIDENCE",
  deployment: "DEPLOYMENT",
  "runtime-telemetry": "RUNTIME_TELEMETRY"
};

function scopeWhere(scope: ArchitectureScopeRef) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function sourceRoleForConnector(kind: string, configuration: unknown): KnowledgeSourceRole | null {
  const configured = record(configuration).sourceRole;
  if (typeof configured === "string" && sourceRoles.has(configured as KnowledgeSourceRole)) return configured as KnowledgeSourceRole;
  return kindRoleMap[kind.trim().toLowerCase()] ?? null;
}

function sourceNamespaceForConnector(kind: string, configuration: unknown): string {
  const configured = record(configuration).sourceNamespace;
  return typeof configured === "string" && configured.trim() ? configured.trim() : kind;
}

function stringDigest(value: unknown): string {
  return contentDigest(value);
}

async function catalogSource(db: ReadinessDb, scope: ArchitectureScopeRef): Promise<KnowledgeEvidenceSnapshot["sources"][number] | undefined> {
  const cursor = await db.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } });
  if (!cursor) return undefined;
  return {
    role: "DESIGN_CATALOG",
    authority: "SPECFORGE",
    fullSnapshotCompleted: cursor.nextVersion > 0n,
    snapshotId: `catalog:${cursor.nextVersion.toString()}`,
    waterline: cursor.nextVersion.toString(),
    observedAt: cursor.updatedAt,
    receivedAt: cursor.updatedAt,
    pendingCount: 0,
    openTombstoneCount: 0
  };
}

async function connectorSource(
  db: ReadinessDb,
  scope: ArchitectureScopeRef,
  connector: { id: string; kind: string; configuration: Prisma.JsonValue },
  role: KnowledgeSourceRole
): Promise<KnowledgeEvidenceSnapshot["sources"][number] | undefined> {
  const sourceNamespace = sourceNamespaceForConnector(connector.kind, connector.configuration);
  const cursor = await db.federationObservationCursor.findUnique({
    where: { applicationServiceId_scopePath_connectorId_sourceNamespace: { ...scopeWhere(scope), connectorId: connector.id, sourceNamespace } }
  });
  const run = await db.connectorRun.findFirst({
    where: { ...scopeWhere(scope), connectorId: connector.id, sourceNamespace, status: "SUCCEEDED" },
    orderBy: [{ finishedAt: "desc" }, { updatedAt: "desc" }]
  });
  const observedAt = cursor?.lastObservedAt ?? run?.updatedAt;
  const receivedAt = cursor?.updatedAt ?? run?.updatedAt;
  if (!observedAt || !receivedAt) return undefined;
  const [pendingCount, openTombstoneCount] = await Promise.all([
    db.sourceObservation.count({ where: { ...scopeWhere(scope), connectorId: connector.id, sourceNamespace, status: "CANDIDATE" } }),
    db.sourceObservation.count({ where: { ...scopeWhere(scope), connectorId: connector.id, sourceNamespace, operation: "TOMBSTONE", status: { in: ["CANDIDATE", "CONFLICTED"] } } })
  ]);
  const completedSnapshotId = cursor?.lastCompletedSnapshotId ?? null;
  return {
    role,
    authority: "EXTERNAL",
    fullSnapshotCompleted: Boolean(completedSnapshotId && run?.mode === "FULL_SNAPSHOT" && run.snapshotId === completedSnapshotId),
    snapshotId: completedSnapshotId,
    waterline: [cursor?.acceptedSequence ?? -1, cursor?.acceptedBatchDigest ?? "none", cursor?.lastCompletedBoundaryDigest ?? "none"].join(":"),
    observedAt,
    receivedAt,
    pendingCount,
    openTombstoneCount
  };
}

async function requiredSources(
  db: ReadinessDb,
  scope: ArchitectureScopeRef,
  requirements: readonly KnowledgeSourceRequirement[]
): Promise<KnowledgeEvidenceSnapshot["sources"]> {
  const connectors = await db.connectorInstance.findMany({ where: scopeWhere(scope), orderBy: { id: "asc" }, take: 1000, select: { id: true, kind: true, configuration: true } });
  const result: Array<KnowledgeEvidenceSnapshot["sources"][number]> = [];
  const catalog = requirements.some((requirement) => requirement.role === "DESIGN_CATALOG") ? await catalogSource(db, scope) : undefined;
  if (catalog) result.push(catalog);
  for (const role of [...new Set(requirements.map((requirement) => requirement.role))]) {
    if (role === "DESIGN_CATALOG") continue;
    const connector = connectors.find((candidate) => sourceRoleForConnector(candidate.kind, candidate.configuration) === role);
    if (!connector) continue;
    const source = await connectorSource(db, scope, connector, role);
    if (source) result.push(source);
  }
  return result.sort((left, right) => left.role.localeCompare(right.role));
}

export async function loadKnowledgeEvidenceSnapshot(
  db: ReadinessDb,
  architectureScope: ArchitectureScopeRef,
  policy: KnowledgeReadinessPolicy,
  profileId: KnowledgeProfileId
): Promise<KnowledgeEvidenceSnapshotWithWaterlines> {
  const scope = scopeWhere(architectureScope);
  const requirements = policy.profileRequirements[profileId];
  const [baseline, relationship, pendingObservations, pendingCandidates, conflicts, reconciliation, sources] = await Promise.all([
    db.knowledgeBaseline.findFirst({ where: { ...scope, status: "PUBLISHED", publishedAt: { not: null } }, orderBy: { publishedAt: "desc" }, select: { id: true, manifest: true, publishedAt: true } }),
    db.relationshipEvent.aggregate({ where: scope, _max: { graphVersion: true } }),
    db.sourceObservation.count({ where: { ...scope, status: "CANDIDATE" } }),
    db.identityCandidate.count({ where: { ...scope, decision: { in: ["UNMATCHED", "AMBIGUOUS"] } } }),
    db.sourceObservation.count({ where: { ...scope, status: "CONFLICTED" } }),
    db.reconciliationSnapshot.findFirst({ where: scope, orderBy: { createdAt: "desc" }, select: { root: true, status: true, createdAt: true } }),
    requiredSources(db, architectureScope, requirements)
  ]);
  const identityConflicts = await db.identityCandidate.count({ where: { ...scope, decision: "AMBIGUOUS" } });
  const catalogCursor = await db.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: architectureScope }, select: { nextVersion: true } });
  const catalogWaterline = (catalogCursor?.nextVersion ?? 0n).toString();
  const relationshipWaterline = (relationship._max.graphVersion ?? 0n).toString();
  const baselineDigest = baseline ? stringDigest({ id: baseline.id, manifest: baseline.manifest }) : "none";
  const sourceDigest = stringDigest(sources.map((source) => ({ ...source, observedAt: source.observedAt.toISOString(), receivedAt: source.receivedAt.toISOString() })));
  const waterlines = {
    baseline: baselineDigest,
    catalog: catalogWaterline,
    relationships: relationshipWaterline,
    connectors: stringDigest(sources.map((source) => [source.role, source.waterline])),
    snapshots: sourceDigest,
    pending: stringDigest({ pendingObservations, pendingCandidates }),
    conflicts: stringDigest({ conflicts, identityConflicts }),
    reconciliation: reconciliation?.root ?? "none"
  };
  const freshnessSummary: Record<string, string | number> = {};
  for (const source of sources) {
    freshnessSummary[source.role] = source.observedAt.toISOString();
  }
  const coverageSummary = {
    requiredSources: requirements.length,
    availableSources: sources.length,
    pendingObservations,
    pendingCandidates,
    conflicts: conflicts + identityConflicts,
    reconciliationStatus: reconciliation?.status ?? "MISSING"
  };
  return {
    baseline: baseline && baseline.publishedAt ? { id: baseline.id, digest: baselineDigest, publishedAt: baseline.publishedAt } : null,
    catalogWaterline,
    relationshipWaterline,
    reconciliation: reconciliation ? { id: reconciliation.root, status: reconciliation.status, digest: reconciliation.root, createdAt: reconciliation.createdAt } : null,
    sources,
    unresolvedConflictCount: conflicts + identityConflicts,
    pendingCandidateCount: pendingObservations + pendingCandidates,
    waterlines,
    waterlineDigest: stringDigest(waterlines),
    coverageSummary,
    freshnessSummary
  };
}
