import { Prisma } from "@prisma/client";
import {
  contentDigest,
  localizeAsset,
  validateFeatureChangeSet,
  FeatureChangeSetError,
  type ArchitectureScopeRef,
  type FeatureAsset,
  type FeatureAssetType,
  type FeatureChangeSetCatalog,
  type FeatureChangeSetRequest,
  type ScopedActor
} from "@specforge/core";
import { appendAuthoredAssetRevision } from "../knowledge/catalog-revision";
import {
  configuredRelationshipScope,
  ensureMcpPersistenceSchema,
  prisma,
  relationshipService,
  resolveWritableScope,
  upsertAssetSearchProjection,
  writableActor
} from "../persistence";
import { PrismaRelationshipRepository } from "../relationships/repository";

export interface FeatureChangeSetReceipt extends ArchitectureScopeRef {
  requestDigest: string;
  catalogVersion: string;
  graphVersion: string;
  assetVersions: Record<string, string>;
  changedAssetIds: string[];
  changedRelationshipIds: string[];
  eventIds: string[];
  dryRun: boolean;
  replayed: boolean;
}

export async function applyFeatureChangeSet(input: FeatureChangeSetRequest): Promise<FeatureChangeSetReceipt> {
  const actor = writableActor();
  const scope = resolveWritableScope(actor, input.architectureScope);
  const requestDigest = contentDigest(input);
  await ensureMcpPersistenceSchema();

  try {
    return await prisma.$transaction(async (transaction) => {
      const relationshipScope = configuredRelationshipScope(scope);
      const repository = new PrismaRelationshipRepository(transaction);
      await repository.lockScope(relationshipScope);

      const existingReceipt = await repository.findReceipt(relationshipScope, input.idempotencyKey);
      if (existingReceipt) {
        if (existingReceipt.commandHash !== requestDigest || existingReceipt.commandType !== "APPLY_FEATURE_CHANGE_SET") {
          throw new FeatureChangeSetError("FEATURE_CHANGE_SET_REPLAY_MISMATCH");
        }
        if (existingReceipt.status !== "COMPLETED") throw new FeatureChangeSetError("FEATURE_TRANSACTION_FAILED");
        return receiptFromStored(existingReceipt.result, scope, true);
      }

      await requireOpenDesignSession(transaction, scope, input.designChangeSessionId);
      const catalog = await loadValidationCatalog(transaction, scope, input);
      const validated = validateFeatureChangeSet(input, catalog);
      if (input.dryRun) {
        const watermarks = await loadWatermarks(transaction, scope);
        return {
          ...scope,
          requestDigest: validated.requestDigest,
          ...watermarks,
          assetVersions: Object.fromEntries(catalog.assets.map((asset) => [asset.id, asset.version])),
          changedAssetIds: validated.assets.map((mutation) => mutation.asset.id),
          changedRelationshipIds: [],
          eventIds: [],
          dryRun: true,
          replayed: false
        };
      }

      const batchReceipt = await repository.createReceipt(relationshipScope, {
        idempotencyKey: input.idempotencyKey,
        commandHash: requestDigest,
        commandType: "APPLY_FEATURE_CHANGE_SET"
      });
      const assetVersions: Record<string, string> = {};
      const changedRelationshipIds: string[] = [];
      const eventIds: string[] = [];

      for (const [ordinal, mutation] of validated.assets.entries()) {
        const version = await persistFeature(transaction, scope, actor, mutation.assetType, mutation.asset, input, ordinal);
        assetVersions[mutation.asset.id] = version;
        const graphReceipt = await relationshipService(transaction, relationshipScope).upsertAssetGraph({
          channel: "mcp",
          correlationId: `${input.correlationId}:feature-graph:${ordinal}`,
          idempotencyKey: `${input.idempotencyKey}:feature-graph:${ordinal}`,
          assetType: mutation.assetType,
          asset: { ...mutation.asset, architectureScope: scope }
        });
        if (graphReceipt.relationshipId) changedRelationshipIds.push(graphReceipt.relationshipId);
        if (graphReceipt.eventId) eventIds.push(graphReceipt.eventId);
      }

      for (const [ordinal, relation] of validated.relationships.entries()) {
        const relationReceipt = await relationshipService(transaction, relationshipScope).upsertRelationship({
          channel: "mcp",
          correlationId: `${input.correlationId}:feature-relation:${ordinal}`,
          idempotencyKey: `${input.idempotencyKey}:feature-relation:${ordinal}`,
          source: { identity: relation.source },
          target: { identity: relation.target },
          relationType: relation.relationType,
          relationshipSource: "feature-change-set",
          sourceReference: `feature-change-set:${input.idempotencyKey}:${ordinal}`,
          confidence: relation.confidence,
          metadata: relation.metadata
        });
        if (relationReceipt.relationshipId) changedRelationshipIds.push(relationReceipt.relationshipId);
        if (relationReceipt.eventId) eventIds.push(relationReceipt.eventId);
      }

      const watermarks = await loadWatermarks(transaction, scope);
      const result: FeatureChangeSetReceipt = {
        ...scope,
        requestDigest: validated.requestDigest,
        ...watermarks,
        assetVersions,
        changedAssetIds: validated.assets.map((mutation) => mutation.asset.id),
        changedRelationshipIds: [...new Set(changedRelationshipIds)],
        eventIds: [...new Set(eventIds)],
        dryRun: false,
        replayed: false
      };
      await transaction.auditLog.create({
        data: {
          actorType: actor.actorType,
          actorId: actor.actorId,
          channel: "mcp",
          action: "apply_feature_change_set",
          targetType: "feature-change-set",
          targetId: input.idempotencyKey,
          inputSummary: `${validated.assets.length} assets, ${validated.relationships.length} relationships`,
          outputSummary: `${result.changedAssetIds.length} assets, ${result.changedRelationshipIds.length} relationships`,
          status: "success",
          applicationServiceId: scope.applicationServiceId,
          scopePath: scope.scopePath
        }
      });
      await repository.completeReceipt(relationshipScope, batchReceipt.dbId, {
        status: "COMPLETED",
        result: result as unknown as Record<string, unknown>,
        graphVersion: BigInt(result.graphVersion),
        primaryEventId: result.eventIds[0] ?? null
      });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof FeatureChangeSetError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/could not serialize|deadlock|VERSION_MISMATCH/u.test(message)) {
      throw new FeatureChangeSetError("FEATURE_VERSION_CONFLICT");
    }
    throw new FeatureChangeSetError("FEATURE_TRANSACTION_FAILED");
  }
}

async function requireOpenDesignSession(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef, sessionId: string): Promise<void> {
  const session = await transaction.designChangeSession.findUnique({
    where: { applicationServiceId_scopePath_id: { ...scope, id: sessionId } },
    select: { status: true }
  });
  if (!session || session.status !== "OPEN") throw new FeatureChangeSetError("FEATURE_DESIGN_SESSION_INVALID");
}

async function loadValidationCatalog(
  transaction: Prisma.TransactionClient,
  scope: ArchitectureScopeRef,
  input: FeatureChangeSetRequest
): Promise<FeatureChangeSetCatalog> {
  const assetIds = [...new Set(input.assets.map((mutation) => mutation.asset.id))];
  const existingAssets = assetIds.length
    ? await transaction.designAsset.findMany({ where: { ...scope, id: { in: assetIds } }, select: { id: true, type: true } })
    : [];
  const revisions = assetIds.length
    ? await transaction.authoredAssetRevision.findMany({
        where: { ...scope, assetId: { in: assetIds } },
        select: { assetId: true, catalogVersion: true },
        orderBy: [{ catalogVersion: "desc" }]
      })
    : [];
  const versionById = new Map<string, string>();
  for (const revision of revisions) if (!versionById.has(revision.assetId)) versionById.set(revision.assetId, revision.catalogVersion.toString());

  const requestedEndpoints = [...input.relationships.flatMap((relation) => [relation.source, relation.target])];
  const nodeTypes = [...new Set(requestedEndpoints.map((endpoint) => endpoint.nodeType))];
  const logicalIds = [...new Set(requestedEndpoints.map((endpoint) => endpoint.logicalId))];
  const nodes = requestedEndpoints.length
    ? await transaction.assetNode.findMany({
        where: { ...configuredRelationshipScope(scope), nodeType: { in: nodeTypes }, logicalId: { in: logicalIds }, lifecycleStatus: "ACTIVE" },
        select: { nodeType: true, logicalId: true, rootAssetType: true, rootAssetId: true }
      })
    : [];
  const requestedKeys = new Set(requestedEndpoints.map((endpoint) => `${endpoint.nodeType}:${endpoint.logicalId}`));
  return {
    assets: existingAssets.map((asset) => ({ id: asset.id, assetType: asset.type, version: versionById.get(asset.id) ?? "0" })),
    endpoints: nodes
      .filter((node) => requestedKeys.has(`${node.nodeType}:${node.logicalId}`))
      .map((node) => ({ ...scope, nodeType: node.nodeType as never, logicalId: node.logicalId, rootAssetType: node.rootAssetType as never, rootAssetId: node.rootAssetId }))
  };
}

async function persistFeature(
  transaction: Prisma.TransactionClient,
  scope: ArchitectureScopeRef,
  actor: ScopedActor,
  assetType: FeatureAssetType,
  asset: FeatureAsset,
  input: FeatureChangeSetRequest,
  ordinal: number
): Promise<string> {
  const localized = { ...asset, architectureScope: scope } as FeatureAsset;
  const canonical = localizeAsset(assetType, localized as never, "en") as FeatureAsset;
  const createdAt = new Date(canonical.createdAt);
  const updatedAt = new Date(canonical.updatedAt);
  await transaction.designAsset.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: canonical.id } },
    create: { id: canonical.id, type: assetType, name: canonical.name, description: canonical.description, domainId: canonical.domainId, ...scope, payload: JSON.stringify(canonical), createdAt, updatedAt },
    update: { type: assetType, name: canonical.name, description: canonical.description, domainId: canonical.domainId, payload: JSON.stringify(canonical), updatedAt }
  });
  const revision = await appendAuthoredAssetRevision(transaction, {
    architectureScope: scope,
    assetType,
    assetId: canonical.id,
    operation: "UPSERT",
    payload: localized,
    actorType: actor.actorType,
    actorId: actor.actorId,
    channel: "mcp",
    correlationId: `${input.correlationId}:feature:${ordinal}`,
    idempotencyKey: `${input.idempotencyKey}:feature:${ordinal}`
  });
  await upsertAssetSearchProjection(transaction, { architectureScope: scope, assetType, asset: localized, catalogVersion: revision.catalogVersion, updatedAt });
  return revision.catalogVersion.toString();
}

async function loadWatermarks(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef): Promise<{ catalogVersion: string; graphVersion: string }> {
  const [catalog, graph] = await Promise.all([
    transaction.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope }, select: { nextVersion: true } }),
    transaction.relationshipEvent.aggregate({ where: configuredRelationshipScope(scope), _max: { graphVersion: true } })
  ]);
  return { catalogVersion: (catalog?.nextVersion ?? 0n).toString(), graphVersion: (graph._max.graphVersion ?? 0n).toString() };
}

function receiptFromStored(result: Record<string, unknown>, scope: ArchitectureScopeRef, replayed: boolean): FeatureChangeSetReceipt {
  return {
    ...scope,
    requestDigest: String(result.requestDigest ?? ""),
    catalogVersion: String(result.catalogVersion ?? "0"),
    graphVersion: String(result.graphVersion ?? "0"),
    assetVersions: stringRecord(result.assetVersions),
    changedAssetIds: stringArray(result.changedAssetIds),
    changedRelationshipIds: stringArray(result.changedRelationshipIds),
    eventIds: stringArray(result.eventIds),
    dryRun: result.dryRun === true,
    replayed
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, String(nested)]));
}
