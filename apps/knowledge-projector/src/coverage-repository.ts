import { Prisma, PrismaClient } from "@prisma/client";
import { contentDigest, type ArchitectureScopeRef, type CoveragePathEvidence, type CoverageRole, type CoverageStatus } from "@specforge/core";
type CoverageBuildJobStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";

export interface CoverageBuildJob {
  applicationServiceId: string;
  scopePath: string;
  id: string;
  buildKey: string;
  baselineId: string;
  generationId: string;
  profileId: string;
  profileVersion: string;
  coverageSchemaVersion: string;
  catalogVersion: string;
  catalogDigest: string;
  relationshipVersion: string;
  relationshipDigest: string;
  query: Record<string, unknown>;
  inputDigest: string;
  status: CoverageBuildJobStatus;
  attempt: number;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  checkpoint: Record<string, unknown>;
  rowCount: number;
  coveredCount: number;
  blockedCount: number;
  notEvaluatedCount: number;
}

export interface CoverageProjectionRow extends ArchitectureScopeRef {
  generationId: string;
  baselineId: string;
  manifestId: string;
  assetType: string;
  assetId: string;
  role: CoverageRole;
  status: CoverageStatus;
  terminalMemberId?: string;
  pathEvidence: CoveragePathEvidence;
  reasonCode?: string;
  diagnosticRef?: string;
  sourceDigest?: string;
  rowDigest: string;
}

export interface CoverageBatch {
  rows: CoverageProjectionRow[];
  nextCursor?: string;
  complete: boolean;
}

export interface CoveragePublication {
  inputDigest: string;
  contentDigest: string;
  rowCount: number;
  coveredCount: number;
  blockedCount: number;
  notEvaluatedCount: number;
}

export interface CoverageManifest extends ArchitectureScopeRef {
  id: string;
  buildJobId: string;
  buildKey: string;
  baselineId: string;
  generationId: string;
  profileId: string;
  profileVersion: string;
  coverageSchemaVersion: string;
  catalogVersion: string;
  catalogDigest: string;
  relationshipVersion: string;
  relationshipDigest: string;
  inputDigest: string;
  contentDigest: string;
  publicationState: "PUBLISHED";
  rowCount: number;
  coveredCount: number;
  blockedCount: number;
  notEvaluatedCount: number;
  publishedAt: string;
}

export interface CoverageBuildRepository {
  claim(owner: string, now: Date, leaseExpiresAt: Date): Promise<CoverageBuildJob | null>;
  renew(job: CoverageBuildJob, owner: string, leaseExpiresAt: Date): Promise<boolean>;
  loadBatch(job: CoverageBuildJob, limit: number, cursor?: string): Promise<CoverageBatch>;
  writeBatch(job: CoverageBuildJob, owner: string, rows: readonly CoverageProjectionRow[], checkpoint?: Record<string, unknown>): Promise<boolean>;
  publish(job: CoverageBuildJob, owner: string, publication: CoveragePublication): Promise<CoverageManifest>;
  fail(job: CoverageBuildJob, owner: string, code: string, diagnosticRef: string): Promise<boolean>;
}

const CLAIM_SQL = `
  UPDATE "ArchitectureCoverageBuildJob" AS job
  SET status = 'BUILDING', "leaseOwner" = $2, "leaseExpiresAt" = $3,
      attempt = job.attempt + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE job."dbId" = (
    SELECT candidate."dbId"
    FROM "ArchitectureCoverageBuildJob" AS candidate
    WHERE candidate.status = 'QUEUED'
      AND candidate."availableAt" <= $1
      AND (candidate."leaseExpiresAt" IS NULL OR candidate."leaseExpiresAt" < $1)
    ORDER BY candidate."availableAt" ASC, candidate."createdAt" ASC, candidate."dbId" ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING job.*
`;

export class PrismaCoverageBuildRepository implements CoverageBuildRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(owner: string, now: Date, leaseExpiresAt: Date): Promise<CoverageBuildJob | null> {
    const rows = await this.prisma.$queryRawUnsafe<any[]>(CLAIM_SQL, now, owner, leaseExpiresAt);
    return rows[0] ? jobFromRow(rows[0]) : null;
  }

  async renew(job: CoverageBuildJob, owner: string, leaseExpiresAt: Date): Promise<boolean> {
    const updated = await this.prisma.architectureCoverageBuildJob.updateMany({ where: { ...scope(job), id: job.id, status: "BUILDING", leaseOwner: owner }, data: { leaseExpiresAt } });
    return updated.count === 1;
  }

  async loadBatch(job: CoverageBuildJob, limit: number, cursor?: string): Promise<CoverageBatch> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error("COVERAGE_BATCH_LIMIT_INVALID");
    const decoded = cursor ? decodeCursor(cursor) : undefined;
    const rows = await this.prisma.architectureAssetCoverageProjection.findMany({
      where: {
        ...scope(job), generationId: job.generationId,
        ...(decoded ? { OR: [{ assetType: { gt: decoded.assetType } }, { assetType: decoded.assetType, assetId: { gt: decoded.assetId } }] } : {})
      },
      orderBy: [{ assetType: "asc" }, { assetId: "asc" }],
      take: limit + 1
    });
    const selected = rows.slice(0, limit).map(rowFromDb);
    const last = selected.at(-1);
    return { rows: selected, complete: rows.length <= limit, ...(rows.length > limit && last ? { nextCursor: encodeCursor(last) } : {}) };
  }

  async writeBatch(job: CoverageBuildJob, owner: string, rows: readonly CoverageProjectionRow[], checkpoint: Record<string, unknown> = {}): Promise<boolean> {
    rows.forEach((row) => assertRowMatchesJob(row, job));
    return this.prisma.$transaction(async (transaction) => {
      const leased = await transaction.architectureCoverageBuildJob.updateMany({ where: { ...scope(job), id: job.id, status: "BUILDING", leaseOwner: owner }, data: { checkpoint: checkpoint as Prisma.InputJsonValue, updatedAt: new Date() } });
      if (leased.count !== 1) return false;
      for (const row of rows) {
        const data = rowData(row);
        await transaction.architectureAssetCoverageProjection.upsert({
          where: { applicationServiceId_scopePath_generationId_assetType_assetId: { ...scope(row), generationId: row.generationId, assetType: row.assetType, assetId: row.assetId } },
          create: data,
          update: data
        });
      }
      const stored = await transaction.architectureAssetCoverageProjection.findMany({ where: { ...scope(job), generationId: job.generationId }, select: { status: true } });
      await transaction.architectureCoverageBuildJob.update({ where: { applicationServiceId_scopePath_id: { ...scope(job), id: job.id } }, data: counts(stored) });
      return true;
    });
  }

  async publish(job: CoverageBuildJob, owner: string, publication: CoveragePublication): Promise<CoverageManifest> {
    if (publication.inputDigest !== job.inputDigest) throw new Error("COVERAGE_INPUT_DIGEST_MISMATCH");
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.architectureCoverageBuildJob.findFirst({ where: { ...scope(job), id: job.id, status: "BUILDING", leaseOwner: owner } });
      if (!locked) throw new Error("COVERAGE_BUILD_LEASE_LOST");
      const rows = await transaction.architectureAssetCoverageProjection.findMany({ where: { ...scope(job), generationId: job.generationId }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }] });
      const actual = counts(rows);
      if (actual.rowCount !== publication.rowCount || actual.coveredCount !== publication.coveredCount || actual.blockedCount !== publication.blockedCount || actual.notEvaluatedCount !== publication.notEvaluatedCount) throw new Error("COVERAGE_COUNT_MISMATCH");
      const actualDigest = contentDigest({ scope: scope(job), generationId: job.generationId, inputDigest: job.inputDigest, rows: rows.map(rowForDigest) });
      if (actualDigest !== publication.contentDigest) throw new Error("COVERAGE_CONTENT_DIGEST_MISMATCH");
      const manifestId = `coverage-manifest:${job.generationId}`;
      const existing = await transaction.architectureCoverageManifest.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope(job), id: manifestId } } });
      if (existing && (existing.inputDigest !== publication.inputDigest || existing.contentDigest !== publication.contentDigest)) throw new Error("COVERAGE_MANIFEST_IMMUTABLE");
      const publishedAt = existing?.publishedAt ?? new Date();
      const manifest = existing ?? await transaction.architectureCoverageManifest.create({ data: { ...scope(job), id: manifestId, buildJobId: job.id, buildKey: job.buildKey, baselineId: job.baselineId, generationId: job.generationId, profileId: job.profileId, profileVersion: job.profileVersion, coverageSchemaVersion: job.coverageSchemaVersion, catalogVersion: BigInt(job.catalogVersion), catalogDigest: job.catalogDigest, relationshipVersion: job.relationshipVersion, relationshipDigest: job.relationshipDigest, query: job.query as Prisma.InputJsonValue, inputDigest: publication.inputDigest, contentDigest: publication.contentDigest, publicationState: "PUBLISHED", ...actual, publishedAt } });
      await transaction.architectureCoverageBuildJob.update({ where: { applicationServiceId_scopePath_id: { ...scope(job), id: job.id } }, data: { status: "READY", ...actual, completedAt: publishedAt, leaseOwner: null, leaseExpiresAt: null } });
      return manifestFromRow(manifest);
    });
  }

  async fail(job: CoverageBuildJob, owner: string, code: string, diagnosticRef: string): Promise<boolean> {
    const updated = await this.prisma.architectureCoverageBuildJob.updateMany({ where: { ...scope(job), id: job.id, status: "BUILDING", leaseOwner: owner }, data: { status: "FAILED", errorCode: code, diagnosticRef, leaseOwner: null, leaseExpiresAt: null } });
    return updated.count === 1;
  }
}

function scope(value: ArchitectureScopeRef): ArchitectureScopeRef { return { applicationServiceId: value.applicationServiceId, scopePath: value.scopePath }; }

function assertRowMatchesJob(row: CoverageProjectionRow, job: CoverageBuildJob): void {
  if (row.applicationServiceId !== job.applicationServiceId || row.scopePath !== job.scopePath || row.generationId !== job.generationId || row.baselineId !== job.baselineId) throw new Error("COVERAGE_ROW_SCOPE_MISMATCH");
}

function rowData(row: CoverageProjectionRow) {
  return { ...scope(row), generationId: row.generationId, baselineId: row.baselineId, manifestId: row.manifestId, assetType: row.assetType, assetId: row.assetId, role: row.role, status: row.status, terminalMemberId: row.terminalMemberId ?? null, pathEvidence: row.pathEvidence as Prisma.InputJsonValue, reasonCode: row.reasonCode ?? null, diagnosticRef: row.diagnosticRef ?? null, sourceDigest: row.sourceDigest ?? null, rowDigest: row.rowDigest };
}

function rowForDigest(row: any) { return { assetType: row.assetType, assetId: row.assetId, role: row.role, status: row.status, terminalMemberId: row.terminalMemberId ?? null, pathEvidence: row.pathEvidence ?? [], reasonCode: row.reasonCode ?? null, diagnosticRef: row.diagnosticRef ?? null, sourceDigest: row.sourceDigest ?? null, rowDigest: row.rowDigest }; }

function counts(rows: readonly { status: string }[]) { return { rowCount: rows.length, coveredCount: rows.filter((row) => row.status === "COVERED").length, blockedCount: rows.filter((row) => row.status === "BLOCKED").length, notEvaluatedCount: rows.filter((row) => row.status === "NOT_EVALUATED").length }; }

function jobFromRow(row: any): CoverageBuildJob { return { ...scope(row), id: row.id, buildKey: row.buildKey, baselineId: row.baselineId, generationId: row.generationId, profileId: row.profileId, profileVersion: row.profileVersion, coverageSchemaVersion: row.coverageSchemaVersion, catalogVersion: row.catalogVersion.toString(), catalogDigest: row.catalogDigest, relationshipVersion: row.relationshipVersion, relationshipDigest: row.relationshipDigest, query: jsonObject(row.query), inputDigest: row.inputDigest, status: row.status as CoverageBuildJobStatus, attempt: row.attempt, ...(row.leaseOwner ? { leaseOwner: row.leaseOwner } : {}), ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt.toISOString() } : {}), checkpoint: jsonObject(row.checkpoint), rowCount: row.rowCount, coveredCount: row.coveredCount, blockedCount: row.blockedCount, notEvaluatedCount: row.notEvaluatedCount }; }

function rowFromDb(row: any): CoverageProjectionRow { return { ...scope(row), generationId: row.generationId, baselineId: row.baselineId, manifestId: row.manifestId, assetType: row.assetType, assetId: row.assetId, role: row.role as CoverageRole, status: row.status as CoverageStatus, ...(row.terminalMemberId ? { terminalMemberId: row.terminalMemberId } : {}), pathEvidence: (row.pathEvidence ?? []) as CoveragePathEvidence, ...(row.reasonCode ? { reasonCode: row.reasonCode } : {}), ...(row.diagnosticRef ? { diagnosticRef: row.diagnosticRef } : {}), ...(row.sourceDigest ? { sourceDigest: row.sourceDigest } : {}), rowDigest: row.rowDigest }; }

function manifestFromRow(row: any): CoverageManifest { return { ...scope(row), id: row.id, buildJobId: row.buildJobId, buildKey: row.buildKey, baselineId: row.baselineId, generationId: row.generationId, profileId: row.profileId, profileVersion: row.profileVersion, coverageSchemaVersion: row.coverageSchemaVersion, catalogVersion: row.catalogVersion.toString(), catalogDigest: row.catalogDigest, relationshipVersion: row.relationshipVersion, relationshipDigest: row.relationshipDigest, inputDigest: row.inputDigest, contentDigest: row.contentDigest, publicationState: "PUBLISHED", rowCount: row.rowCount, coveredCount: row.coveredCount, blockedCount: row.blockedCount, notEvaluatedCount: row.notEvaluatedCount, publishedAt: row.publishedAt.toISOString() }; }

function jsonObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

function encodeCursor(row: Pick<CoverageProjectionRow, "assetType" | "assetId">): string { return Buffer.from(JSON.stringify({ assetType: row.assetType, assetId: row.assetId }), "utf8").toString("base64url"); }

function decodeCursor(value: string): { assetType: string; assetId: string } { try { const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>; if (typeof parsed.assetType !== "string" || typeof parsed.assetId !== "string") throw new Error("invalid"); return { assetType: parsed.assetType, assetId: parsed.assetId }; } catch { throw new Error("COVERAGE_CURSOR_INVALID"); } }
