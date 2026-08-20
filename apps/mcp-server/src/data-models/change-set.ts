import { Prisma } from "@prisma/client";
import {
  contentDigest,
  isStructuredDataModel,
  localizeAsset,
  upgradeLegacyDataModel,
  validateAssetLocalization,
  validateDataModelV2,
  DataModelV2ValidationError,
  type ArchitectureScopeRef,
  type DataModel,
  type DataModelV2,
  type ScopedActor
} from "@specforge/core";
import {
  configuredRelationshipScope,
  ensureMcpPersistenceSchema,
  prisma,
  resolveWritableScope,
  relationshipService,
  writableActor
} from "../persistence";
import { appendAuthoredAssetRevision } from "../knowledge/catalog-revision";
import { PrismaRelationshipRepository } from "../relationships/repository";

export interface DataModelChangeSetInput {
  architectureScope: ArchitectureScopeRef;
  models?: DataModel[];
  changes?: Array<{ operation: "UPSERT" | "DELETE"; asset?: DataModel; assetId?: string }>;
  idempotencyKey: string;
  correlationId: string;
}

export interface DataModelChangeSetReceipt extends ArchitectureScopeRef {
  catalogVersion: string;
  catalogDigest: string;
  relationshipVersion: string;
  relationshipDigest: string;
  graphVersion: string;
  changedAssetIds: string[];
  changedRelationIds: string[];
  eventIds: string[];
  replayed: boolean;
}

export async function applyDataModelChangeSet(input: DataModelChangeSetInput): Promise<DataModelChangeSetReceipt> {
  if (!input.idempotencyKey?.trim()) throw new Error("IDEMPOTENCY_KEY_REQUIRED");
  if (!input.correlationId?.trim()) throw new Error("CORRELATION_ID_REQUIRED");

  const actor = writableActor();
  const scope = resolveWritableScope(actor, input.architectureScope);
  const models = normalizeModels(input);
  const commandHash = contentDigest({ architectureScope: scope, models, changes: input.changes ?? [] });
  await ensureMcpPersistenceSchema();

  return prisma.$transaction(async (transaction) => {
    const relationshipScope = configuredRelationshipScope(scope);
    const repository = new PrismaRelationshipRepository(transaction);
    await repository.lockScope(relationshipScope);

    const existing = await repository.findReceipt(relationshipScope, input.idempotencyKey);
    if (existing) {
      if (existing.commandHash !== commandHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
      if (existing.commandType !== "APPLY_DATA_MODEL_CHANGE_SET" || existing.status !== "COMPLETED") {
        throw new Error("IDEMPOTENCY_RECEIPT_INCOMPLETE");
      }
      return receiptFromStoredResult(existing.result, scope, true);
    }

    const receipt = await repository.createReceipt(relationshipScope, {
      idempotencyKey: input.idempotencyKey,
      commandHash,
      commandType: "APPLY_DATA_MODEL_CHANGE_SET"
    });

    const changedAssetIds: string[] = [];
    const childCorrelations: string[] = [];
    for (const model of models) {
      validateDataModelChangeScope(model, scope);
      validateAssetLocalization("dataModel", model);
      assertDataModelMutationReady(model);
      await rejectRemovedReferencedNodes(transaction, scope, model);
      await persistDataModel(transaction, scope, actor, model, input.correlationId);
      changedAssetIds.push(model.id);
      const childCorrelation = `${input.correlationId}:model:${model.id}`;
      childCorrelations.push(childCorrelation);
      await relationshipService(transaction, relationshipScope).upsertAssetGraph({
        channel: "mcp",
        correlationId: childCorrelation,
        idempotencyKey: `${input.idempotencyKey}:model:${model.id}`,
        assetType: "dataModel",
        asset: model
      });
    }

    for (const change of input.changes ?? []) {
      if (change.operation !== "DELETE") continue;
      const assetId = change.assetId ?? change.asset?.id;
      if (!assetId) throw new Error("DATA_MODEL_ID_REQUIRED");
      await rejectDataModelDelete(transaction, scope, assetId);
      await deleteDataModel(transaction, scope, actor, assetId);
      changedAssetIds.push(assetId);
    }

    const events = childCorrelations.length
      ? await transaction.relationshipEvent.findMany({
        where: { ...relationshipScope, correlationId: { in: childCorrelations } },
        select: { dbId: true, relationshipId: true, graphVersion: true },
        orderBy: [{ graphVersion: "asc" }, { createdAt: "asc" }, { dbId: "asc" }]
      })
      : [];
    const changedRelationIds = [...new Set(events.flatMap((event) => event.relationshipId ? [event.relationshipId] : []))];
    const eventIds = events.map((event) => event.dbId);
    const catalog = await catalogWatermark(transaction, scope);
    const relationship = await relationshipWatermark(transaction, scope);
    const graphVersion = relationship.version;
    const result: DataModelChangeSetReceipt = {
      ...scope,
      catalogVersion: catalog.version,
      catalogDigest: catalog.digest,
      relationshipVersion: relationship.version,
      relationshipDigest: relationship.digest,
      graphVersion,
      changedAssetIds: [...new Set(changedAssetIds)],
      changedRelationIds,
      eventIds,
      replayed: false
    };
    await repository.completeReceipt(relationshipScope, receipt.dbId, {
      status: "COMPLETED",
      result: resultForStorage(result),
      graphVersion: BigInt(relationship.version),
      primaryEventId: eventIds[0] ?? null
    });
    return result;
  });
}

function normalizeModels(input: DataModelChangeSetInput): DataModel[] {
  const models = [...(input.models ?? [])];
  for (const change of input.changes ?? []) {
    if (change.operation === "UPSERT" && change.asset) models.push(change.asset);
  }
  if (!models.length && !(input.changes ?? []).some((change) => change.operation === "DELETE")) {
    throw new Error("DATA_MODEL_CHANGE_SET_EMPTY");
  }
  return models;
}

function validateDataModelChangeScope(model: DataModel, scope: ArchitectureScopeRef): void {
  if (!model.architectureScope || model.architectureScope.applicationServiceId !== scope.applicationServiceId || model.architectureScope.scopePath !== scope.scopePath) {
    throw new Error("SCOPE_MISMATCH");
  }
}

function assertDataModelMutationReady(model: DataModel): void {
  if (!isStructuredDataModel(model)) {
    try {
      upgradeLegacyDataModel(model);
    } catch (error) {
      if (error instanceof DataModelV2ValidationError && error.code === "FIELD_OWNERSHIP_AMBIGUOUS") {
        throw new Error("FIELD_OWNERSHIP_AMBIGUOUS");
      }
      throw error;
    }
    throw new Error("DATA_MODEL_UPGRADE_REQUIRED");
  }
  validateDataModelV2(model);
}

async function persistDataModel(
  transaction: Prisma.TransactionClient,
  scope: ArchitectureScopeRef,
  actor: ScopedActor,
  model: DataModel,
  correlationId: string
): Promise<void> {
  const localized = { ...model, architectureScope: scope } as DataModel;
  const canonical = localizeAsset("dataModel", localized, "en") as DataModel;
  await transaction.designAsset.upsert({
    where: { applicationServiceId_scopePath_id: { ...scope, id: model.id } },
    create: {
      id: model.id,
      type: "dataModel",
      name: canonical.name,
      code: canonical.code,
      description: canonical.description,
      domainId: canonical.domainId,
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      payload: JSON.stringify(canonical),
      createdAt: new Date(canonical.createdAt),
      updatedAt: new Date(canonical.updatedAt)
    },
    update: {
      type: "dataModel",
      name: canonical.name,
      code: canonical.code,
      description: canonical.description,
      domainId: canonical.domainId,
      payload: JSON.stringify(canonical),
      updatedAt: new Date(canonical.updatedAt)
    }
  });
  await appendAuthoredAssetRevision(transaction, {
    architectureScope: scope,
    assetType: "dataModel",
    assetId: model.id,
    operation: "UPSERT",
    payload: localized,
    actorType: actor.actorType,
    actorId: actor.actorId,
    channel: "mcp",
    correlationId: `${correlationId}:model:${model.id}`,
    idempotencyKey: `data-model-change:${model.id}:${contentDigest(localized)}`
  });
}

async function deleteDataModel(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef, actor: ScopedActor, assetId: string): Promise<void> {
  const existing = await transaction.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: assetId } } });
  if (!existing) return;
  await transaction.designAsset.delete({ where: { applicationServiceId_scopePath_id: { ...scope, id: assetId } } });
  await appendAuthoredAssetRevision(transaction, {
    architectureScope: scope,
    assetType: "dataModel",
    assetId,
    operation: "DELETE",
    payload: { id: assetId },
    actorType: actor.actorType,
    actorId: actor.actorId,
    channel: "mcp",
    correlationId: `data-model-delete:${assetId}`,
    idempotencyKey: `data-model-delete:${assetId}:${contentDigest(existing.payload)}`
  });
}

async function rejectRemovedReferencedNodes(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef, next: DataModel): Promise<void> {
  const current = await transaction.designAsset.findUnique({ where: { applicationServiceId_scopePath_id: { ...scope, id: next.id } }, select: { payload: true } });
  if (!current) return;
  let previous: DataModel;
  try { previous = JSON.parse(current.payload) as DataModel; } catch { return; }
  if (!isStructuredDataModel(previous) || !isStructuredDataModel(next)) return;
  const nextEntityIds = new Set((next.entityDefinitions ?? []).map((entity) => entity.id));
  const nextFieldIds = new Set((next.fields as DataModelV2["fields"]).map((field) => field.id));
  const removedLogicalIds = [
    ...(previous.entityDefinitions ?? []).filter((entity) => !nextEntityIds.has(entity.id)).map((entity) => `${next.id}.entity.${entity.id}`),
    ...((previous.fields as DataModelV2["fields"]) ?? []).filter((field) => !nextFieldIds.has(field.id)).map((field) => `${next.id}.entity.${field.entityId}.field.${field.id}`)
  ];
  if (!removedLogicalIds.length) return;
  const nodes = await transaction.assetNode.findMany({ where: { ...configuredRelationshipScope(scope), logicalId: { in: removedLogicalIds } }, select: { dbId: true } });
  await rejectActiveIncomingReferences(transaction, scope, nodes.map((node) => node.dbId));
}

async function rejectDataModelDelete(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef, assetId: string): Promise<void> {
  const nodes = await transaction.assetNode.findMany({
    where: { ...configuredRelationshipScope(scope), rootAssetType: "dataModel", rootAssetId: assetId },
    select: { dbId: true }
  });
  await rejectActiveIncomingReferences(transaction, scope, nodes.map((node) => node.dbId));
}

async function rejectActiveIncomingReferences(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef, nodeIds: string[]): Promise<void> {
  if (!nodeIds.length) return;
  const active = await transaction.relationshipCurrent.findFirst({ where: { ...configuredRelationshipScope(scope), targetNodeId: { in: nodeIds }, relationType: "REFERENCES", lifecycleStatus: "ACTIVE" }, select: { dbId: true } });
  if (active) throw new Error("ACTIVE_REFERENCE_EXISTS");
}

async function catalogWatermark(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef): Promise<{ version: string; digest: string }> {
  const cursor = await transaction.authoredCatalogCursor.findUnique({ where: { applicationServiceId_scopePath: scope } });
  const version = cursor?.nextVersion ?? 0n;
  const revisions = await transaction.authoredAssetRevision.findMany({ where: { ...scope, catalogVersion: { lte: version } }, select: { assetType: true, assetId: true, catalogVersion: true, operation: true, contentDigest: true }, orderBy: [{ assetType: "asc" }, { assetId: "asc" }, { catalogVersion: "asc" }] });
  return { version: version.toString(), digest: contentDigest({ scope, catalogVersion: version, revisions }) };
}

async function relationshipWatermark(transaction: Prisma.TransactionClient, scope: ArchitectureScopeRef): Promise<{ version: string; digest: string }> {
  const events = await transaction.relationshipEvent.findMany({ where: configuredRelationshipScope(scope), select: { dbId: true, relationshipId: true, assetNodeId: true, action: true, newVersion: true, graphVersion: true, source: true, snapshot: true }, orderBy: [{ graphVersion: "asc" }, { dbId: "asc" }] });
  const version = events.reduce((max, event) => event.graphVersion > max ? event.graphVersion : max, 0n);
  return { version: version.toString(), digest: contentDigest({ scope, relationshipVersion: version, events }) };
}

function resultForStorage(result: DataModelChangeSetReceipt): Record<string, unknown> {
  return { ...result };
}

function receiptFromStoredResult(result: Record<string, unknown>, scope: ArchitectureScopeRef, replayed: boolean): DataModelChangeSetReceipt {
  return {
    ...scope,
    catalogVersion: String(result.catalogVersion ?? "0"),
    catalogDigest: String(result.catalogDigest ?? ""),
    relationshipVersion: String(result.relationshipVersion ?? result.graphVersion ?? "0"),
    relationshipDigest: String(result.relationshipDigest ?? ""),
    graphVersion: String(result.graphVersion ?? result.relationshipVersion ?? "0"),
    changedAssetIds: stringArray(result.changedAssetIds),
    changedRelationIds: stringArray(result.changedRelationIds),
    eventIds: stringArray(result.eventIds),
    replayed
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
