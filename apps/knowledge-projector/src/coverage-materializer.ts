import { contentDigest, evaluateCoverageCandidate, genericSystemCoverageProfile, type ArchitectureScopeRef, type CoveragePathEvidence, type CoverageResult } from "@specforge/core";
import type { CoverageBuildJob, CoverageBuildRepository, CoverageProjectionRow } from "./coverage-repository.js";

export interface AuthoredCoverageRevision extends ArchitectureScopeRef {
  catalogVersion: string | bigint;
  assetType: string;
  assetId: string;
  operation: "UPSERT" | "DELETE";
  payload: unknown;
  contentDigest: string;
}

export interface CoverageRelationship extends ArchitectureScopeRef {
  relationshipIdentity: string;
  relationCode: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  sourceExists?: boolean;
  targetExists?: boolean;
}

export interface CoverageSnapshot extends ArchitectureScopeRef {
  catalogVersion: string;
  relationshipVersion: string;
  revisions: readonly AuthoredCoverageRevision[];
  relationships: readonly CoverageRelationship[];
  directMemberIds: readonly string[];
  baselineId: string;
  generationId: string;
}

export interface MaterializedCoverageBatch {
  rows: CoverageProjectionRow[];
  complete: boolean;
  nextCursor?: string;
}

export function materializeCoverageBatch(
  job: CoverageBuildJob,
  snapshot: CoverageSnapshot,
  cursor?: string,
  limit = 200
): MaterializedCoverageBatch {
  assertSnapshotScope(job, snapshot);
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("COVERAGE_BATCH_LIMIT_INVALID");
  const assets = latestAssets(snapshot.revisions)
    .sort((left, right) => `${left.assetType}:${left.assetId}`.localeCompare(`${right.assetType}:${right.assetId}`));
  const start = cursor ? assets.findIndex((asset) => `${asset.assetType}:${asset.assetId}` > cursor) : 0;
  const selected = assets.slice(start < 0 ? assets.length : start, (start < 0 ? assets.length : start) + limit);
  const rows = selected.map((asset) => toCoverageRow(job, snapshot, asset));
  const last = selected.at(-1);
  return {
    rows,
    complete: (start < 0 ? assets.length : start) + selected.length >= assets.length,
    ...(last && (start < 0 ? assets.length : start) + selected.length < assets.length ? { nextCursor: `${last.assetType}:${last.assetId}` } : {})
  };
}

export interface CoverageSnapshotLoader { load(job: CoverageBuildJob): Promise<CoverageSnapshot>; }

export interface CoverageProjectorRuntime {
  processNext(): Promise<{ status: "idle" | "progressed" | "published" | "failed"; jobId?: string }>;
}

export function createCoverageProjectorRuntime(options: {
  repository: CoverageBuildRepository;
  snapshotLoader: CoverageSnapshotLoader;
  owner: string;
  batchSize?: number;
  now?: () => Date;
  leaseDurationMs?: number;
}): CoverageProjectorRuntime {
  const batchSize = options.batchSize ?? 200;
  const now = options.now ?? (() => new Date());
  const leaseDurationMs = options.leaseDurationMs ?? 300_000;
  return {
    async processNext() {
      const current = now();
      const job = await options.repository.claim(options.owner, current, new Date(current.getTime() + leaseDurationMs));
      if (!job) return { status: "idle" as const };
      try {
        const snapshot = await options.snapshotLoader.load(job);
        const cursor = typeof job.checkpoint.assetCursor === "string" ? job.checkpoint.assetCursor : undefined;
        const batch = materializeCoverageBatch(job, snapshot, cursor, batchSize);
        const checkpoint = batch.complete ? {} : { ...job.checkpoint, assetCursor: batch.nextCursor };
        if (!(await options.repository.writeBatch(job, options.owner, batch.rows, checkpoint))) throw new Error("COVERAGE_BUILD_LEASE_LOST");
        if (!batch.complete) return { status: "progressed" as const, jobId: job.id };
        const allRows = materializeAllRows(job, snapshot);
        const counts = countRows(allRows);
        await options.repository.publish(job, options.owner, {
          inputDigest: job.inputDigest,
          contentDigest: contentDigest({ scope: snapshot, generationId: job.generationId, inputDigest: job.inputDigest, rows: allRows.map(rowDigestInput) }),
          ...counts
        });
        return { status: "published" as const, jobId: job.id };
      } catch (error) {
        await options.repository.fail(job, options.owner, error instanceof Error ? error.message : "COVERAGE_BUILD_FAILED", `coverage-build:${job.id}`);
        return { status: "failed" as const, jobId: job.id };
      }
    }
  };
}

function toCoverageRow(job: CoverageBuildJob, snapshot: CoverageSnapshot, asset: { assetType: string; assetId: string; payload: Record<string, unknown>; contentDigest: string }): CoverageProjectionRow {
  const candidate = evaluateCoverageCandidate({
    exactScope: { applicationServiceId: snapshot.applicationServiceId, scopePath: snapshot.scopePath },
    generationId: job.generationId,
    source: { assetType: asset.assetType, assetId: asset.assetId },
    sourceDigest: asset.contentDigest,
    paths: enumeratePaths(asset.assetType, asset.assetId, snapshot.relationships),
    directMemberIds: [...snapshot.directMemberIds],
    knownAssetIds: [...new Set([...latestAssetIds(snapshot.revisions), ...snapshot.relationships.flatMap((edge) => [edge.sourceId, edge.targetId])])],
    knownRelationshipIdentities: snapshot.relationships.map((relationship) => relationship.relationshipIdentity),
    localization: asset.payload.localizedContent as { en?: unknown; zh?: unknown } | undefined,
    snapshotAvailable: true
  }, genericSystemCoverageProfile);
  return {
    applicationServiceId: snapshot.applicationServiceId,
    scopePath: snapshot.scopePath,
    generationId: job.generationId,
    baselineId: snapshot.baselineId,
    manifestId: `coverage-manifest:${job.generationId}`,
    assetType: candidate.source.assetType,
    assetId: candidate.source.assetId,
    role: candidate.role,
    status: candidate.status,
    ...(candidate.terminalMemberId ? { terminalMemberId: candidate.terminalMemberId } : {}),
    pathEvidence: candidate.path ?? [],
    ...(candidate.reasonCode ? { reasonCode: candidate.reasonCode } : {}),
    ...(candidate.diagnosticRef ? { diagnosticRef: candidate.diagnosticRef } : {}),
    ...(candidate.sourceDigest ? { sourceDigest: candidate.sourceDigest } : {}),
    rowDigest: candidate.rowDigest
  };
}

function latestAssets(revisions: readonly AuthoredCoverageRevision[]): Array<{ assetType: string; assetId: string; payload: Record<string, unknown>; contentDigest: string }> {
  const latest = new Map<string, AuthoredCoverageRevision>();
  for (const revision of [...revisions].sort((left, right) => Number(left.catalogVersion) - Number(right.catalogVersion))) {
    latest.set(`${revision.assetType}:${revision.assetId}`, revision);
  }
  return [...latest.values()].filter((revision) => revision.operation !== "DELETE").map((revision) => ({ assetType: revision.assetType, assetId: revision.assetId, payload: objectPayload(revision.payload), contentDigest: revision.contentDigest }));
}

function latestAssetIds(revisions: readonly AuthoredCoverageRevision[]): string[] {
  return latestAssets(revisions).map((asset) => asset.assetId);
}

function enumeratePaths(sourceType: string, sourceId: string, relationships: readonly CoverageRelationship[]): CoveragePathEvidence[] {
  const edges = relationships.filter((edge) => edge.applicationServiceId && edge.sourceType && edge.sourceId);
  const paths: CoveragePathEvidence[] = [];
  const walk = (currentType: string, currentId: string, path: CoveragePathEvidence) => {
    if (path.length >= genericSystemCoverageProfile.maxPathLength) return;
    for (const edge of edges.filter((candidate) => candidate.sourceType === currentType && candidate.sourceId === currentId)) {
      const next: CoveragePathEvidence = [...path, { relationshipIdentity: edge.relationshipIdentity, relationCode: edge.relationCode, sourceType: edge.sourceType, sourceId: edge.sourceId, targetType: edge.targetType, targetId: edge.targetId, architectureScope: { applicationServiceId: edge.applicationServiceId, scopePath: edge.scopePath }, sourceExists: edge.sourceExists, targetExists: edge.targetExists }];
      paths.push(next);
      walk(edge.targetType, edge.targetId, next);
    }
  };
  walk(sourceType, sourceId, []);
  return paths;
}

function materializeAllRows(job: CoverageBuildJob, snapshot: CoverageSnapshot): CoverageProjectionRow[] {
  const rows: CoverageProjectionRow[] = [];
  let cursor: string | undefined;
  while (true) {
    const batch = materializeCoverageBatch(job, snapshot, cursor, 1000);
    rows.push(...batch.rows);
    if (batch.complete) return rows;
    cursor = batch.nextCursor;
  }
}

function countRows(rows: readonly CoverageProjectionRow[]) { return { rowCount: rows.length, coveredCount: rows.filter((row) => row.status === "COVERED").length, blockedCount: rows.filter((row) => row.status === "BLOCKED").length, notEvaluatedCount: rows.filter((row) => row.status === "NOT_EVALUATED").length }; }
function rowDigestInput(row: CoverageProjectionRow) { return { assetType: row.assetType, assetId: row.assetId, role: row.role, status: row.status, terminalMemberId: row.terminalMemberId ?? null, pathEvidence: row.pathEvidence, reasonCode: row.reasonCode ?? null, diagnosticRef: row.diagnosticRef ?? null, sourceDigest: row.sourceDigest ?? null, rowDigest: row.rowDigest }; }
function objectPayload(payload: unknown): Record<string, unknown> { if (typeof payload === "string") { try { return objectPayload(JSON.parse(payload)); } catch { return {}; } } return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {}; }
function assertSnapshotScope(job: ArchitectureScopeRef, snapshot: ArchitectureScopeRef) { if (job.applicationServiceId !== snapshot.applicationServiceId || job.scopePath !== snapshot.scopePath) throw new Error("COVERAGE_SNAPSHOT_SCOPE_MISMATCH"); }
