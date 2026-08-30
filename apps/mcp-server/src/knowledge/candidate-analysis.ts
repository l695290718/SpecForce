import {
  contentDigest,
  candidateCounts,
  validateCandidateAnalysisRequest,
  type ArchitectureFactBatchSubmission,
  type ArchitectureScopeRef,
  type ThreeACandidateAnalysisRequest,
  type ThreeACandidateSet,
  type ThreeACandidateSnapshot
} from "@specforge/core";
import {
  configuredRelationshipScope,
  ensureMcpPersistenceSchema,
  prisma,
  resolveWritableScope,
  writableActor
} from "../persistence";
import { PrismaRelationshipRepository } from "../relationships/repository";
import { get3aCandidateSet, submit3aArchitectureFactBatch } from "./architecture-authoring";

const officialBaselineStatus = "PUBLISHED";

export async function analyze3aArchitectureCandidates(
  input: ThreeACandidateAnalysisRequest
): Promise<ThreeACandidateSet> {
  validateCandidateAnalysisRequest(input);
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  if (
    input.candidateBatch.designChangeSessionId &&
    input.candidateBatch.designChangeSessionId !== input.designChangeSessionId
  )
    throw new Error("THREE_A_CANDIDATE_DESIGN_SESSION_MISMATCH");
  await ensureMcpPersistenceSchema();

  const [baseline, manifest, assets, relationshipVersion] = await Promise.all([
    prisma.knowledgeBaseline.findUnique({
      where: { applicationServiceId_scopePath_id: { ...scope, id: input.sourceBaselineId } }
    }),
    prisma.projectionManifest.findFirst({
      where: { ...scope, baselineId: input.sourceBaselineId, publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" }
    }),
    prisma.designAsset.findMany({
      where: { ...scope, ...(input.assetIds?.length ? { id: { in: input.assetIds } } : {}) },
      select: { id: true, type: true, name: true, description: true, payload: true, updatedAt: true },
      orderBy: [{ type: "asc" }, { id: "asc" }]
    }),
    new PrismaRelationshipRepository(prisma).currentGraphVersion(configuredRelationshipScope(scope))
  ]);
  if (!baseline || baseline.status !== officialBaselineStatus || !baseline.publishedAt)
    throw new Error("THREE_A_CANDIDATE_SOURCE_BASELINE_NOT_PUBLISHED");
  if (!manifest) throw new Error("THREE_A_CANDIDATE_SOURCE_PROJECTION_NOT_READY");
  const catalogDigest = contentDigest(
    assets.map((asset) => ({
      id: asset.id,
      type: asset.type,
      name: asset.name,
      description: asset.description,
      payload: asset.payload,
      updatedAt: asset.updatedAt.toISOString()
    }))
  );
  const snapshot: ThreeACandidateSnapshot = {
    sourceBaselineId: input.sourceBaselineId,
    catalogDigest,
    relationshipVersion: relationshipVersion.toString(),
    designContextDigest: contentDigest({
      scope,
      sourceBaselineId: input.sourceBaselineId,
      manifestId: manifest.id,
      catalogDigest,
      relationshipVersion: relationshipVersion.toString()
    }),
    capturedAt: new Date().toISOString()
  };
  const candidateBatch: ArchitectureFactBatchSubmission = {
    id: input.candidateBatch.id,
    idempotencyKey: input.idempotencyKey,
    designChangeSessionId: input.designChangeSessionId,
    architectureScope: scope,
    provenance: input.candidateBatch.provenance,
    evidenceRefs: [
      ...new Set([
        ...input.evidenceRefs,
        `baseline:${input.sourceBaselineId}`,
        `projection:${manifest.id}`,
        `catalog:${catalogDigest}`
      ])
    ],
    units: input.candidateBatch.units,
    memberships: input.candidateBatch.memberships,
    mappings: input.candidateBatch.mappings
  };
  const counts = candidateCounts(candidateBatch);
  if (counts.BIZ > 6 || counts.SYS > 12 || counts.TECH > 5) throw new Error("THREE_A_CANDIDATE_COUNT_CEILING_EXCEEDED");
  const excludedCandidates = input.candidateBatch.excludedCandidates ?? [];
  const blockingIssues = [...new Set(input.candidateBatch.blockingIssues ?? [])];
  const receipt = await submit3aArchitectureFactBatch({
    ...candidateBatch,
    candidateSet: {
      status: blockingIssues.length ? "BLOCKED" : "READY",
      sourceBaselineId: input.sourceBaselineId,
      snapshot,
      excludedCandidates,
      blockingIssues,
      analysisIntent: input.intent
    }
  });
  return get3aCandidateSet({ architectureScope: scope, candidateSetId: receipt.id });
}

export async function get3aArchitectureCandidateSet(input: {
  architectureScope: ArchitectureScopeRef;
  candidateSetId: string;
}): Promise<ThreeACandidateSet> {
  return get3aCandidateSet(input);
}
