import {
  changeSetDigest,
  contentDigest,
  localizeAsset,
  type ArchitectureScopeRef,
  type Asset,
  type AssetType,
  type KnowledgeAssertion
} from "@specforge/core";
import { Prisma } from "@prisma/client";
import {
  configuredRelationshipScope,
  ensureMcpPersistenceSchema,
  listPersistedAssetLinks,
  listPersistedAssets,
  listPersistedContextPacks,
  listPersistedProposals,
  prisma,
  resolveWritableScope,
  writableActor
} from "../persistence";
import { PrismaRelationshipRepository } from "../relationships/repository";

const sourceExtractor = "mcp:legacy-design-asset-bootstrap";
const bootstrapPrefix = "legacy-design-assets";

export interface BootstrapThreeAInput {
  architectureScope: ArchitectureScopeRef;
  designChangeSessionId: string;
}

export interface BootstrapThreeAResult {
  architectureScope: ArchitectureScopeRef;
  baselineId: string;
  changeSetId: string;
  streamId: string;
  reconciliationReceiptId: string;
  sourceDigest: string;
  assertionCount: number;
  relationshipCount: number;
  layerCounts: Record<"BIZ" | "SYS" | "TECH", number>;
  skippedRelationshipCount: number;
  idempotent: boolean;
}

/**
 * Converts the already-authored exact-Scope catalog into a first official 3A
 * baseline. This is intentionally a migration boundary: it preserves authored
 * English content, carries the existing Chinese overlay, and does not infer new
 * business meaning from source code or an AI provider.
 */
export async function bootstrapThreeAFromDesignAssets(input: BootstrapThreeAInput): Promise<BootstrapThreeAResult> {
  const scope = resolveWritableScope(writableActor(), input.architectureScope);
  await ensureMcpPersistenceSchema();

  const session = await prisma.designChangeSession.findUnique({
    where: { applicationServiceId_scopePath_id: { ...scope, id: input.designChangeSessionId } }
  });
  if (!session || session.status !== "OPEN") throw new Error("DESIGN_CHANGE_SESSION_NOT_OPEN");

  const [persistedAssets, proposals, contextPacks, links] = await Promise.all([
    listPersistedAssets(scope.applicationServiceId),
    listPersistedProposals(scope.applicationServiceId),
    listPersistedContextPacks(scope.applicationServiceId),
    listPersistedAssetLinks(scope.applicationServiceId)
  ]);
  const records: Array<{ type: AssetType; asset: Asset }> = [
    ...persistedAssets,
    ...proposals.map((asset) => ({ type: "proposal" as const, asset: asset as unknown as Asset })),
    ...contextPacks.map((asset) => ({ type: "contextPack" as const, asset: asset as unknown as Asset }))
  ];
  const uniqueRecords = uniqueAssets(records);
  const assetKeys = new Set(uniqueRecords.map(({ type, asset }) => assetKey(type, asset.id)));
  const scopedLinks = links.filter((link) => link.architectureScope?.scopePath === scope.scopePath);
  const usableLinks = scopedLinks.filter((link) => assetKeys.has(assetKey(link.sourceType as AssetType, link.sourceId)) && assetKeys.has(assetKey(link.targetType as AssetType, link.targetId)));
  const skippedRelationshipCount = scopedLinks.length - usableLinks.length;
  const sourceDigest = contentDigest({
    architectureScope: scope,
    assets: uniqueRecords.map(({ type, asset }) => ({ type, asset })),
    links: scopedLinks
  });
  const version = sourceDigest.slice(0, 16);
  const streamId = `${bootstrapPrefix}:stream`;
  const changeSetId = `${bootstrapPrefix}:changeset:${version}`;
  const baselineId = `${bootstrapPrefix}:baseline:${version}`;
  const reconciliationReceiptId = `${bootstrapPrefix}:reconciliation:${version}`;
  const promotionReceiptId = `${bootstrapPrefix}:promotion:${version}`;
  const scanSessionId = `${bootstrapPrefix}:scan:${version}`;
  const evidenceRefs = [
    `persisted-design-assets:${sourceDigest}`,
    `design-change-session:${input.designChangeSessionId}`,
    "legacy-authored-catalog",
    "bilingual-canonical-content"
  ];
  const now = new Date().toISOString();
  const assetAssertions = uniqueRecords.map(({ type, asset }) => {
    try {
      return assertionForAsset({ type, asset, scope, changeSetId, sourceDigest, now });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`THREE_A_BOOTSTRAP_ASSET_INVALID:${type}:${asset.id}:${reason}`);
    }
  });
  const byAssetKey = new Map(uniqueRecords.map(({ type, asset }, index) => [assetKey(type, asset.id), assetAssertions[index]!]));
  const relationshipAssertions = usableLinks.map((link) => assertionForLink({ link, scope, changeSetId, sourceDigest, byAssetKey, now }));
  const assertions = [...assetAssertions, ...relationshipAssertions];
  const sourceRevisionIds = assertions.map((assertion) => assertion.id).sort();
  const relationshipRevisionIds = relationshipAssertions.map((assertion) => assertion.id).sort();
  const relationshipVersion = (await new PrismaRelationshipRepository(prisma).currentGraphVersion(configuredRelationshipScope(scope))).toString();
  const digest = changeSetDigest({
    architectureScope: scope,
    streamId,
    sequence: 1,
    assetRevisionIds: sourceRevisionIds,
    relationshipRevisionIds,
    architectureFactRevisionIds: [],
    evidenceRefs
  });
  const reconciliation = {
    id: reconciliationReceiptId,
    architectureScope: scope,
    promotionReceiptId,
    promotionSourceDigest: sourceDigest,
    scanSessionId,
    scanSessionDigest: sourceDigest,
    changeSetId,
    status: "CONVERGED" as const,
    issues: [] as string[],
    assetRevisionIds: sourceRevisionIds,
    relationshipRevisionIds,
    evidenceRefs,
    relationshipVersion,
    reconciledAt: now
  };

  const existingBaseline = await prisma.knowledgeBaseline.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: baselineId } } });
  const reusableBaseline = existingBaseline ?? await prisma.knowledgeBaseline.findFirst({
    where: { ...scope, streamId, status: "PUBLISHED", publishedAt: { not: null } },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }]
  });
  if (reusableBaseline?.status === "PUBLISHED" && reusableBaseline.publishedAt) {
    const existingAssertions = await prisma.knowledgeAssertion.groupBy({
      by: ["layer", "factType"],
      where: { ...scope, changeSetId: reusableBaseline.changeSetId, status: "ACCEPTED" },
      _count: { _all: true }
    });
    const layerCounts = { BIZ: 0, SYS: 0, TECH: 0 };
    let assertionCount = 0;
    let relationshipCount = 0;
    for (const row of existingAssertions) {
      const count = row._count._all;
      assertionCount += count;
      if (row.factType === "typed-relationship") relationshipCount += count;
      else if (row.layer === "BIZ" || row.layer === "SYS" || row.layer === "TECH") layerCounts[row.layer] += count;
    }
    return {
      architectureScope: scope,
      baselineId: reusableBaseline.id,
      changeSetId: reusableBaseline.changeSetId,
      streamId: reusableBaseline.streamId,
      reconciliationReceiptId,
      sourceDigest,
      assertionCount: assertionCount - relationshipCount,
      relationshipCount,
      layerCounts,
      skippedRelationshipCount: 0,
      idempotent: true
    };
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.workingStream.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: streamId } },
      create: { ...scope, id: streamId, name: "Legacy authored design asset bootstrap", status: "ACTIVE" },
      update: { name: "Legacy authored design asset bootstrap", status: "ACTIVE" }
    });
    for (const assertion of assertions) {
      await transaction.knowledgeAssertion.upsert({
        where: { applicationServiceId_scopePath_id: { ...scope, id: assertion.id } },
        create: assertionRow(assertion),
        update: assertionRowUpdate(assertion)
      });
    }
    await transaction.knowledgeChangeSet.upsert({
      where: { applicationServiceId_scopePath_id: { ...scope, id: changeSetId } },
      create: { ...scope, id: changeSetId, streamId, sequence: 1, status: "COMMITTED", assetRevisionIds: jsonValue(sourceRevisionIds), relationshipRevisionIds: jsonValue(relationshipRevisionIds), evidenceRefs: jsonValue(evidenceRefs), digest, committedAt: new Date(now) },
      update: { status: "COMMITTED", assetRevisionIds: jsonValue(sourceRevisionIds), relationshipRevisionIds: jsonValue(relationshipRevisionIds), evidenceRefs: jsonValue(evidenceRefs), digest, committedAt: new Date(now) }
    });
    await transaction.workingStream.update({ where: { applicationServiceId_scopePath_id: { ...scope, id: streamId } }, data: { headChangeSetId: changeSetId } });
    await transaction.federationOutbox.upsert({
      where: { applicationServiceId_scopePath_idempotencyKey: { ...scope, idempotencyKey: reconciliationReceiptId } },
      create: { ...scope, eventType: "KNOWLEDGE_BASELINE_RECONCILED", payload: jsonValue({ result: reconciliation }), idempotencyKey: reconciliationReceiptId, status: "PENDING", designChangeSessionId: input.designChangeSessionId },
      update: { payload: jsonValue({ result: reconciliation }), status: "PENDING", designChangeSessionId: input.designChangeSessionId }
    });
  });

  const { publishKnowledgeBaseline } = await import("./persistence");
  await publishKnowledgeBaseline({
    id: baselineId,
    streamId,
    changeSetId,
    architectureScope: scope,
    sourceRevisionIds,
    relationshipVersion,
    reconciliationReceiptId
  });

  return {
    architectureScope: scope,
    baselineId,
    changeSetId,
    streamId,
    reconciliationReceiptId,
    sourceDigest,
    assertionCount: assetAssertions.length,
    relationshipCount: relationshipAssertions.length,
    layerCounts: {
      BIZ: assetAssertions.filter((assertion) => assertion.layer === "BIZ").length,
      SYS: assetAssertions.filter((assertion) => assertion.layer === "SYS").length,
      TECH: assetAssertions.filter((assertion) => assertion.layer === "TECH").length
    },
    skippedRelationshipCount,
    idempotent: Boolean(existingBaseline)
  };
}

function assertionForAsset(input: { type: AssetType; asset: Asset; scope: ArchitectureScopeRef; changeSetId: string; sourceDigest: string; now: string }): KnowledgeAssertion {
  const canonicalAsset = stripEnvelope(input.asset);
  const chineseAsset = stripEnvelope(localizeAsset(input.type, input.asset, "zh"));
  const canonicalContent = { ...canonicalAsset, acceptedAsset: { type: input.type, id: input.asset.id } };
  const semanticIdentity = assetKey(input.type, input.asset.id);
  const evidence = [`design-asset:${input.type}:${input.asset.id}`, `catalog-digest:${input.sourceDigest}`];
  return {
    id: `knowledge:${bootstrapPrefix}:asset:${input.type}:${input.asset.id}`,
    semanticIdentity,
    factType: factTypeFor(input.type),
    layer: layerFor(input.type),
    aspect: aspectFor(input.type),
    value: { canonicalContent, localizedContent: { zh: chineseAsset } },
    architectureScope: input.scope,
    status: "ACCEPTED",
    confidence: 1,
    matchingEvidence: evidence,
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: evidence,
    sourceObservationIds: [`legacy-design-asset:${input.type}:${input.asset.id}`],
    extractorId: sourceExtractor,
    riskTier: "T0",
    domainCluster: "domainId" in input.asset && typeof input.asset.domainId === "string" ? input.asset.domainId : undefined,
    revision: 1,
    changeSetId: input.changeSetId,
    createdAt: stringField(input.asset, "createdAt") ?? input.now,
    updatedAt: stringField(input.asset, "updatedAt") ?? input.now
  };
}

function assertionForLink(input: { link: { id: string; sourceType: string; sourceId: string; targetType: string; targetId: string; relationType: string; description?: string }; scope: ArchitectureScopeRef; changeSetId: string; sourceDigest: string; byAssetKey: Map<string, KnowledgeAssertion>; now: string }): KnowledgeAssertion {
  const source = input.byAssetKey.get(assetKey(input.link.sourceType as AssetType, input.link.sourceId));
  const target = input.byAssetKey.get(assetKey(input.link.targetType as AssetType, input.link.targetId));
  if (!source || !target) throw new Error(`LEGACY_RELATIONSHIP_ENDPOINT_MISSING:${input.link.id}`);
  const evidence = [`asset-link:${input.link.id}`, `catalog-digest:${input.sourceDigest}`];
  const summary = input.link.description ?? `${input.link.relationType} relationship`;
  return {
    id: `knowledge:${bootstrapPrefix}:relationship:${input.link.id}`,
    semanticIdentity: `relationship:${input.link.id}`,
    factType: "typed-relationship",
    layer: "TECH",
    aspect: "contract",
    value: {
      canonicalContent: {
        source: { semanticIdentity: source.semanticIdentity },
        target: { semanticIdentity: target.semanticIdentity },
        relationType: input.link.relationType,
        description: summary
      },
      localizedContent: { zh: { summary } }
    },
    architectureScope: input.scope,
    status: "ACCEPTED",
    confidence: 1,
    matchingEvidence: evidence,
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: evidence,
    sourceObservationIds: [`legacy-asset-link:${input.link.id}`],
    extractorId: sourceExtractor,
    riskTier: "T0",
    revision: 1,
    changeSetId: input.changeSetId,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function assertionRow(assertion: KnowledgeAssertion) {
  return {
    ...scopeFields(assertion.architectureScope),
    id: assertion.id,
    semanticIdentity: assertion.semanticIdentity,
    factType: assertion.factType,
    layer: assertion.layer,
    aspect: assertion.aspect,
    value: jsonValue(assertion.value),
    status: assertion.status,
    confidence: assertion.confidence,
    matchingEvidence: jsonValue(assertion.matchingEvidence),
    counterEvidence: jsonValue(assertion.counterEvidence),
    unresolvedQuestions: jsonValue(assertion.unresolvedQuestions),
    evidenceRefs: jsonValue(assertion.evidenceRefs),
    sourceObservationIds: jsonValue(assertion.sourceObservationIds),
    extractorId: assertion.extractorId,
    riskTier: assertion.riskTier ?? "T0",
    domainCluster: assertion.domainCluster ?? null,
    generatedByActorId: null,
    revision: assertion.revision,
    changeSetId: assertion.changeSetId ?? null,
    createdAt: new Date(assertion.createdAt),
    updatedAt: new Date(assertion.updatedAt)
  };
}

function assertionRowUpdate(assertion: KnowledgeAssertion) {
  const row = assertionRow(assertion);
  return {
    semanticIdentity: row.semanticIdentity,
    factType: row.factType,
    layer: row.layer,
    aspect: row.aspect,
    value: row.value,
    status: row.status,
    confidence: row.confidence,
    matchingEvidence: row.matchingEvidence,
    counterEvidence: row.counterEvidence,
    unresolvedQuestions: row.unresolvedQuestions,
    evidenceRefs: row.evidenceRefs,
    sourceObservationIds: row.sourceObservationIds,
    extractorId: row.extractorId,
    riskTier: row.riskTier,
    domainCluster: row.domainCluster,
    generatedByActorId: row.generatedByActorId,
    revision: row.revision,
    changeSetId: row.changeSetId,
    updatedAt: row.updatedAt
  };
}

function stripEnvelope(asset: Asset): Record<string, unknown> {
  const { localizedContent: _localizedContent, architectureScope: _architectureScope, ...content } = asset as unknown as Record<string, unknown>;
  return content;
}

function uniqueAssets(records: Array<{ type: AssetType; asset: Asset }>): Array<{ type: AssetType; asset: Asset }> {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = assetKey(record.type, record.asset.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assetKey(type: AssetType, id: string): string { return `${type}:${id}`; }

function layerFor(type: AssetType): "BIZ" | "SYS" | "TECH" {
  if (["domain", "businessRule", "proposal"].includes(type)) return "BIZ";
  if (["api", "event", "dataModel", "stateMachine", "integration", "quality"].includes(type)) return "SYS";
  return "TECH";
}

function aspectFor(type: AssetType): KnowledgeAssertion["aspect"] {
  if (["businessRule", "quality"].includes(type)) return "constraint";
  if (["api", "event", "integration"].includes(type)) return "contract";
  if (["dataModel"].includes(type)) return "information";
  if (["stateMachine"].includes(type)) return "behavior";
  return "structure";
}

function factTypeFor(type: AssetType): string {
  return {
    domain: "domain-concept",
    dataModel: "data-model",
    api: "api-contract",
    event: "event-contract",
    businessRule: "business-rule",
    stateMachine: "state-machine",
    integration: "integration-contract",
    quality: "quality-requirement",
    observability: "observability-design",
    adr: "architecture-decision",
    proposal: "change-proposal",
    contextPack: "agent-context-pack",
    evidence: "verification-evidence"
  }[type];
}

function stringField(value: Asset, field: string): string | undefined {
  const candidate = (value as unknown as Record<string, unknown>)[field];
  return typeof candidate === "string" && candidate ? candidate : undefined;
}

function scopeFields(scope: ArchitectureScopeRef): ArchitectureScopeRef { return scope; }
function jsonValue(value: unknown): Prisma.InputJsonValue { return value as Prisma.InputJsonValue; }
