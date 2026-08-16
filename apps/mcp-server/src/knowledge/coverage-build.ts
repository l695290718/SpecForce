import { Prisma, PrismaClient } from "@prisma/client";
import { contentDigest, coverageBuildKey, coverageInputDigest, genericSystemCoverageProfile, type ArchitectureScopeRef, type CoverageBuildKeyInput } from "@specforge/core";
import { ensureMcpPersistenceSchema, prisma, readableScope } from "../persistence";

export type CoverageBuildJobStatus = "QUEUED" | "BUILDING" | "READY" | "FAILED";

export interface CoverageBuildRequest {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  generationId: string;
  profileId: string;
  profileVersion: string;
  coverageSchemaVersion: string;
  catalogVersion?: string | bigint;
  catalogDigest?: string;
  relationshipVersion?: string;
  relationshipDigest?: string;
  query: Record<string, unknown>;
}

export interface CoverageBuildSubmission extends ArchitectureScopeRef {
  jobId: string;
  buildKey: string;
  inputDigest: string;
  status: CoverageBuildJobStatus;
  idempotent: boolean;
  catalogVersion: string;
  relationshipVersion: string;
}

export interface CoverageBuildStatusInput extends ArchitectureScopeRef {
  jobId?: string;
  buildKey?: string;
}

export interface CoverageBuildStatusResult extends CoverageBuildSubmission {
  attempt: number;
  rowCount: number;
  coveredCount: number;
  blockedCount: number;
  notEvaluatedCount: number;
  checkpoint: Record<string, unknown>;
  diagnosticRef?: string;
}

type CoverageBuildClient = PrismaClient | Pick<PrismaClient, "$transaction" | "knowledgeBaseline" | "architectureCoverageBuildJob" | "authoredCatalogCursor" | "authoredAssetRevision" | "relationshipEvent">;

export interface CoverageBuildServiceOptions {
  client?: CoverageBuildClient;
  authorizeScope?: (scope: ArchitectureScopeRef) => ArchitectureScopeRef;
  ensureSchema?: () => Promise<unknown>;
  now?: () => Date;
}

const defaultOptions: Required<CoverageBuildServiceOptions> = {
  client: prisma,
  authorizeScope: (scope) => {
    const readable = readableScope(scope.applicationServiceId);
    assertExactScope(readable, scope);
    return readable;
  },
  ensureSchema: ensureMcpPersistenceSchema,
  now: () => new Date()
};

export function createCoverageBuildService(options: CoverageBuildServiceOptions = {}) {
  const config = { ...defaultOptions, ...options };

  return {
    request: (input: CoverageBuildRequest) => requestCoverageBuildWith(input, config),
    get: (input: CoverageBuildStatusInput) => getCoverageBuildWith(input, config)
  };
}

export async function requestCoverageBuild(input: CoverageBuildRequest): Promise<CoverageBuildSubmission> {
  return createCoverageBuildService().request(input);
}

export async function getCoverageBuild(input: CoverageBuildStatusInput): Promise<CoverageBuildStatusResult> {
  return createCoverageBuildService().get(input);
}

async function requestCoverageBuildWith(input: CoverageBuildRequest, config: Required<CoverageBuildServiceOptions>): Promise<CoverageBuildSubmission> {
  validateBuildRequest(input);
  const scope = config.authorizeScope(input.architectureScope);
  await config.ensureSchema();
  const waterlines = await resolveWaterlines(input, scope, config.client);
  const baseline = await config.client.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.baselineId } } });
  if (!baseline || (baseline.status !== "PUBLISHED" && baseline.status !== "SUPERSEDED") || !baseline.publishedAt) throw new Error("BASELINE_NOT_OFFICIAL");

  const buildInput: CoverageBuildKeyInput = {
    architectureScope: scope,
    baselineId: input.baselineId,
    generationId: input.generationId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    coverageSchemaVersion: input.coverageSchemaVersion,
    catalogVersion: waterlines.catalogVersion,
    catalogDigest: waterlines.catalogDigest,
    relationshipVersion: waterlines.relationshipVersion,
    relationshipDigest: waterlines.relationshipDigest,
    query: input.query
  };
  const buildKey = coverageBuildKey(buildInput);
  const inputDigest = coverageInputDigest(buildInput);
  const existing = await config.client.architectureCoverageBuildJob.findUnique({ where: { applicationServiceId_scopePath_buildKey: { ...scope, buildKey } } });
  if (existing) return submissionFromRow(existing, true);

  const jobId = `coverage-build:${input.generationId}:${buildKey.slice(0, 20)}`;
  try {
    const job = await config.client.architectureCoverageBuildJob.create({
      data: {
        ...scope,
        id: jobId,
        buildKey,
        baselineId: input.baselineId,
        generationId: input.generationId,
        profileId: input.profileId,
        profileVersion: input.profileVersion,
        coverageSchemaVersion: input.coverageSchemaVersion,
        catalogVersion: BigInt(waterlines.catalogVersion),
        catalogDigest: waterlines.catalogDigest,
        relationshipVersion: waterlines.relationshipVersion,
        relationshipDigest: waterlines.relationshipDigest,
        query: input.query as Prisma.InputJsonValue,
        inputDigest,
        status: "QUEUED",
        availableAt: config.now()
      }
    });
    return submissionFromRow(job, false);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const concurrent = await config.client.architectureCoverageBuildJob.findUnique({ where: { applicationServiceId_scopePath_buildKey: { ...scope, buildKey } } });
    if (!concurrent) throw error;
    return submissionFromRow(concurrent, true);
  }
}

async function getCoverageBuildWith(input: CoverageBuildStatusInput, config: Required<CoverageBuildServiceOptions>): Promise<CoverageBuildStatusResult> {
  if ((!input.jobId && !input.buildKey) || (input.jobId && input.buildKey)) throw new Error("COVERAGE_BUILD_SELECTOR_INVALID");
  const scope = config.authorizeScope(input);
  await config.ensureSchema();
  const row = input.jobId
    ? await config.client.architectureCoverageBuildJob.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.jobId } } })
    : await config.client.architectureCoverageBuildJob.findUnique({ where: { applicationServiceId_scopePath_buildKey: { ...scope, buildKey: input.buildKey! } } });
  if (!row) throw new Error("COVERAGE_BUILD_NOT_FOUND");
  return statusFromRow(row);
}

async function resolveWaterlines(input: CoverageBuildRequest, scope: ArchitectureScopeRef, client: CoverageBuildClient): Promise<{ catalogVersion: string; catalogDigest: string; relationshipVersion: string; relationshipDigest: string }> {
  if (input.catalogVersion !== undefined && input.catalogDigest && input.relationshipVersion && input.relationshipDigest) {
    return { catalogVersion: String(input.catalogVersion), catalogDigest: input.catalogDigest, relationshipVersion: input.relationshipVersion, relationshipDigest: input.relationshipDigest };
  }
  const result = await client.$transaction(async (transaction) => {
    const cursor = await transaction.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } });
    const catalogVersion = cursor?.nextVersion ?? 0n;
    const revisions = await transaction.authoredAssetRevision.findMany({ where: { ...scope, catalogVersion: { lte: catalogVersion } }, select: { assetType: true, assetId: true, catalogVersion: true, operation: true, contentDigest: true }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }] });
    const relationshipRows = await transaction.relationshipEvent.findMany({ where: { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath }, select: { dbId: true, graphVersion: true }, orderBy: [{ graphVersion: "asc" }, { dbId: "asc" }] });
    const relationshipVersion = relationshipRows.at(-1)?.graphVersion ?? 0n;
    return {
      catalogVersion: catalogVersion.toString(),
      catalogDigest: contentDigest({ scope, catalogVersion, revisions }),
      relationshipVersion: relationshipVersion.toString(),
      relationshipDigest: contentDigest({ scope, relationshipVersion, relationshipRows })
    };
  });
  return result;
}

function validateBuildRequest(input: CoverageBuildRequest): void {
  if (!input.architectureScope.applicationServiceId?.trim() || !input.architectureScope.scopePath?.trim()) throw new Error("Architecture scope is required.");
  if (!input.baselineId || !input.generationId) throw new Error("COVERAGE_BUILD_ID_REQUIRED");
  if (input.profileId !== genericSystemCoverageProfile.id || input.profileVersion !== genericSystemCoverageProfile.version) throw new Error("COVERAGE_PROFILE_UNSUPPORTED");
  if (input.coverageSchemaVersion !== genericSystemCoverageProfile.schemaVersion) throw new Error("COVERAGE_SCHEMA_UNSUPPORTED");
  if (!input.query || typeof input.query !== "object" || Array.isArray(input.query)) throw new Error("COVERAGE_QUERY_INVALID");
}

function assertExactScope(left: ArchitectureScopeRef, right: ArchitectureScopeRef): void {
  if (left.applicationServiceId !== right.applicationServiceId || left.scopePath !== right.scopePath) throw new Error("SCOPE_MISMATCH");
}

function submissionFromRow(row: any, idempotent: boolean): CoverageBuildSubmission {
  return { applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, jobId: row.id, buildKey: row.buildKey, inputDigest: row.inputDigest, status: row.status as CoverageBuildJobStatus, idempotent, catalogVersion: row.catalogVersion.toString(), relationshipVersion: row.relationshipVersion };
}

function statusFromRow(row: any): CoverageBuildStatusResult {
  return { ...submissionFromRow(row, true), attempt: row.attempt, rowCount: row.rowCount, coveredCount: row.coveredCount, blockedCount: row.blockedCount, notEvaluatedCount: row.notEvaluatedCount, checkpoint: jsonObject(row.checkpoint), ...(row.diagnosticRef ? { diagnosticRef: row.diagnosticRef } : {}) };
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
}
