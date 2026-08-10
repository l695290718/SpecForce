import { Prisma } from "@prisma/client";
import { genericSystemAnalysisProfile, optionalAnalysisProfiles, projectionBuildKey, isOfficialBaseline, type AnalysisProfile, type ArchitectureScopeRef, type ProjectionBuildJob, type ProjectionManifestV2, type ProjectionBuildStatus, THREE_A_PROJECTION_SCHEMA_VERSION } from "@specforge/core";
import { ensureMcpPersistenceSchema, prisma, resolveWritableScope, writableActor } from "../persistence";

export interface ProjectionBuildRequest {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: typeof THREE_A_PROJECTION_SCHEMA_VERSION;
  query?: Record<string, unknown>;
}

export interface ProjectionBuildSubmission extends ArchitectureScopeRef {
  id: string;
  buildKey: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: typeof THREE_A_PROJECTION_SCHEMA_VERSION;
  status: ProjectionBuildStatus;
  attempt: number;
  manifestId?: string;
}

export interface ProjectionBuildStatusResult extends ProjectionBuildSubmission {
  nodeCount: number;
  edgeCount: number;
  availableAt?: string;
  completedAt?: string;
  errorCode?: string;
  diagnosticRef?: string;
  publishedAt?: string;
}

export async function requestProjectionBuild(input: ProjectionBuildRequest): Promise<ProjectionBuildSubmission> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const baseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.baselineId } } });
  if (!baseline || !isOfficialBaseline({ status: baseline.status as "PUBLISHED" | "SUPERSEDED" | "BLOCKED", publishedAt: baseline.publishedAt?.toISOString() })) throw new Error("BASELINE_NOT_OFFICIAL");
  const profile = requireAnalysisProfile(input.profileId, input.profileVersion);
  const manifest = baseline.manifest as Record<string, unknown>;
  const sourceRevisionIds = stringArray(manifest.sourceRevisionIds);
  const relationshipVersion = stringValue(manifest.relationshipVersion) ?? "unknown";
  const query = input.query ?? {};
  const buildKey = projectionBuildKey({ architectureScope: scope, baselineId: baseline.id, profileId: profile.id, profileVersion: profile.version, projectionSchemaVersion: input.projectionSchemaVersion, sourceRevisionIds, relationshipVersion, query });

  return prisma.$transaction(async (transaction) => {
    const published = await transaction.projectionManifest.findFirst({
      where: { ...scope, baselineId: baseline.id, projectionSchemaVersion: input.projectionSchemaVersion, profileId: profile.id, profileVersion: profile.version, publishedAt: { not: null } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }]
    });
    if (published && published.generationId && published.inputDigest && published.contentDigest) {
      return submissionFromManifest(published, scope);
    }

    const active = await transaction.projectionBuildJob.findFirst({ where: { ...scope, buildKey, status: { in: ["QUEUED", "BUILDING"] } }, orderBy: [{ attempt: "desc" }, { createdAt: "asc" }] });
    if (active) return submissionFromJob(active, scope);

    const previous = await transaction.projectionBuildJob.findFirst({ where: { ...scope, buildKey }, orderBy: { attempt: "desc" } });
    const attempt = (previous?.attempt ?? 0) + 1;
    const job = await transaction.projectionBuildJob.create({
      data: {
        ...scope,
        id: `projection-build:${buildKey}:${attempt}`,
        buildKey,
        generationId: `projection-generation:${buildKey}:${attempt}`,
        baselineId: baseline.id,
        profileId: profile.id,
        profileVersion: profile.version,
        projectionSchemaVersion: input.projectionSchemaVersion,
        status: "QUEUED",
        attempt,
        checkpoint: {}
      } as never
    });
    return submissionFromJob(job, scope);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function getProjectionBuild(input: { architectureScope: ArchitectureScopeRef; id: string }): Promise<ProjectionBuildStatusResult> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();
  const job = await prisma.projectionBuildJob.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: input.id } } });
  if (job) {
    const manifest = await prisma.projectionManifest.findFirst({ where: { ...scope, generationId: job.generationId, projectionSchemaVersion: THREE_A_PROJECTION_SCHEMA_VERSION, publishedAt: { not: null } }, orderBy: { publishedAt: "desc" } });
    return { ...submissionFromJob(job, scope), nodeCount: job.nodeCount, edgeCount: job.edgeCount, availableAt: job.availableAt.toISOString(), ...(job.completedAt ? { completedAt: job.completedAt.toISOString() } : {}), ...(job.errorCode ? { errorCode: job.errorCode } : {}), ...(job.diagnosticRef ? { diagnosticRef: job.diagnosticRef } : {}), ...(manifest?.publishedAt ? { publishedAt: manifest.publishedAt.toISOString(), manifestId: manifest.id } : {}) };
  }
  throw new Error("PROJECTION_BUILD_NOT_FOUND");
}

export function requireAnalysisProfile(profileId: string, profileVersion: string): AnalysisProfile {
  const profile = [genericSystemAnalysisProfile, ...optionalAnalysisProfiles].find((candidate) => candidate.id === profileId && candidate.version === profileVersion);
  if (!profile) throw new Error("ANALYSIS_PROFILE_NOT_FOUND");
  return profile;
}

function submissionFromJob(row: any, scope: ArchitectureScopeRef): ProjectionBuildSubmission {
  return { ...scope, id: row.id, buildKey: row.buildKey, generationId: row.generationId, baselineId: row.baselineId, profileId: row.profileId, profileVersion: row.profileVersion, projectionSchemaVersion: row.projectionSchemaVersion as typeof THREE_A_PROJECTION_SCHEMA_VERSION, status: row.status as ProjectionBuildStatus, attempt: row.attempt };
}

function submissionFromManifest(row: any, scope: ArchitectureScopeRef): ProjectionBuildSubmission {
  return { ...scope, id: row.id, buildKey: row.inputDigest, generationId: row.generationId, baselineId: row.baselineId, profileId: row.profileId, profileVersion: row.profileVersion, projectionSchemaVersion: row.projectionSchemaVersion as typeof THREE_A_PROJECTION_SCHEMA_VERSION, status: "READY", attempt: 0, manifestId: row.id };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value as string[] : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
