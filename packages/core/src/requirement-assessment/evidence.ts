import { contentDigest } from "../federation/digest";
import { assertValidScope } from "./state";
import type { AssessmentScopeRef, LocalizedText, RequirementBrief } from "./types";

export interface EvidenceAsset {
  id: string;
  assetType: string;
  revision?: number;
  contentDigest: string;
  evidenceKinds?: string[];
  summary?: LocalizedText;
}

export interface EvidenceRelationship {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  revision?: number;
  contentDigest: string;
}

export interface ScopedCatalogWaterline {
  catalogWaterline: string;
  assets: EvidenceAsset[];
}

export interface RelationshipEvidence {
  relationshipWaterline: string;
  relationships: EvidenceRelationship[];
  complete: boolean;
}

export interface GovernanceEvidence {
  authorizationDecisionRef: string;
  authorizationAllowed: boolean;
  reconciliationStatus: string;
  rulesetRevision: string;
  coveragePolicyRevision: string;
  blockers: Array<{ code: string; title: LocalizedText; detail: LocalizedText }>;
}

export interface ProjectionEvidence {
  checkpoint: string | null;
  status: "READY" | "FALLBACK" | "UNAVAILABLE";
  semanticsAvailable: boolean;
}

export interface AssessmentEvidenceReader {
  readCatalog(scope: AssessmentScopeRef): Promise<ScopedCatalogWaterline>;
  readRelationships(scope: AssessmentScopeRef, roots: EvidenceAsset[]): Promise<RelationshipEvidence>;
  readGovernance(scope: AssessmentScopeRef): Promise<GovernanceEvidence>;
  readProjection(scope: AssessmentScopeRef): Promise<ProjectionEvidence>;
}

export interface AssessmentEvidenceSnapshot extends AssessmentScopeRef {
  id: string;
  requirementId: string;
  requirementRevision: number;
  authorizationDecisionRef: string;
  catalogWaterline: string;
  relationshipWaterline: string;
  projectionCheckpoint: string | null;
  projectionStatus: ProjectionEvidence["status"];
  projectionSemanticsAvailable: boolean;
  orderedAssetManifest: EvidenceAsset[];
  relationshipManifest: EvidenceRelationship[];
  rulesetRevision: string;
  coveragePolicyRevision: string;
  promptTemplateDigest: string;
  reviewTemplateDigest: string;
  modelProfileRevision: string;
  executionProfileRevision: string;
  reconciliationStatus: string;
  authorizationAllowed: boolean;
  governanceBlockers: GovernanceEvidence["blockers"];
  evidenceKinds: string[];
  contentDigest: string;
  validAtWaterline: string;
}

export async function buildEvidenceSnapshot(input: {
  scope: AssessmentScopeRef;
  brief: RequirementBrief;
  reader: AssessmentEvidenceReader;
  policyRevision?: string;
  promptTemplateDigest: string;
  reviewTemplateDigest: string;
  modelProfileRevision: string;
  executionProfileRevision: string;
  id?: string;
}): Promise<AssessmentEvidenceSnapshot> {
  assertValidScope(input.scope);
  if (input.brief.applicationServiceId !== input.scope.applicationServiceId || input.brief.scopePath !== input.scope.scopePath) {
    throw new Error("ASSESSMENT_SCOPE_MISMATCH");
  }

  const catalog = await input.reader.readCatalog(input.scope);
  const assets = [...catalog.assets].sort(compareAssets);
  const relationships = await input.reader.readRelationships(input.scope, assets);
  const governance = await input.reader.readGovernance(input.scope);
  const projection = await input.reader.readProjection(input.scope);
  const orderedRelationships = [...relationships.relationships].sort(compareRelationships);
  const evidenceKinds = [...new Set([
    ...assets.flatMap((asset) => asset.evidenceKinds ?? []),
    ...(relationships.complete ? ["relationship"] : []),
    ...(governance.authorizationAllowed ? ["authorization"] : []),
    ...(governance.reconciliationStatus.toUpperCase() === "CONVERGED" ? ["reconciliation"] : []),
    ...(projection.semanticsAvailable ? ["projection"] : [])
  ])].sort();
  const validAtWaterline = `${catalog.catalogWaterline}:${relationships.relationshipWaterline}`;
  const digestInput = {
    scope: input.scope,
    requirement: { id: input.brief.id, revision: input.brief.revision, intent: input.brief.intent },
    catalogWaterline: catalog.catalogWaterline,
    relationshipWaterline: relationships.relationshipWaterline,
    projectionCheckpoint: projection.checkpoint,
    orderedAssetManifest: assets,
    relationshipManifest: orderedRelationships,
    rulesetRevision: governance.rulesetRevision,
    coveragePolicyRevision: input.policyRevision ?? governance.coveragePolicyRevision,
    promptTemplateDigest: input.promptTemplateDigest,
    reviewTemplateDigest: input.reviewTemplateDigest,
    modelProfileRevision: input.modelProfileRevision,
    executionProfileRevision: input.executionProfileRevision
  };
  return {
    ...input.scope,
    id: input.id ?? `snapshot-${contentDigest(digestInput).slice(0, 24)}`,
    requirementId: input.brief.id,
    requirementRevision: input.brief.revision,
    authorizationDecisionRef: governance.authorizationDecisionRef,
    catalogWaterline: catalog.catalogWaterline,
    relationshipWaterline: relationships.relationshipWaterline,
    projectionCheckpoint: projection.checkpoint,
    projectionStatus: projection.status,
    projectionSemanticsAvailable: projection.semanticsAvailable,
    orderedAssetManifest: assets,
    relationshipManifest: orderedRelationships,
    rulesetRevision: governance.rulesetRevision,
    coveragePolicyRevision: input.policyRevision ?? governance.coveragePolicyRevision,
    promptTemplateDigest: input.promptTemplateDigest,
    reviewTemplateDigest: input.reviewTemplateDigest,
    modelProfileRevision: input.modelProfileRevision,
    executionProfileRevision: input.executionProfileRevision,
    reconciliationStatus: governance.reconciliationStatus,
    authorizationAllowed: governance.authorizationAllowed,
    governanceBlockers: governance.blockers,
    evidenceKinds,
    contentDigest: contentDigest(digestInput),
    validAtWaterline
  };
}

function compareAssets(left: EvidenceAsset, right: EvidenceAsset): number {
  return stable([left.assetType, left.id, left.revision ?? 0, left.contentDigest]).localeCompare(stable([right.assetType, right.id, right.revision ?? 0, right.contentDigest]));
}

function compareRelationships(left: EvidenceRelationship, right: EvidenceRelationship): number {
  return stable([left.sourceType, left.sourceId, left.targetType, left.targetId, left.relationType, left.revision ?? 0, left.contentDigest])
    .localeCompare(stable([right.sourceType, right.sourceId, right.targetType, right.targetId, right.relationType, right.revision ?? 0, right.contentDigest]));
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}
