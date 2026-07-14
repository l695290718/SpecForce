import {
  extractAssetGraph,
  hasScopeAccess,
  relationshipOntology,
  scopeById,
  validateRelationshipEndpoints,
  type ArchitectureScopeRef,
  type Asset,
  type AssetNodeIdentity,
  type AssetType,
  type RelationshipCode,
  type ScopedActor
} from "@specforge/core";
import type {
  RelationshipCommandRepository,
  RelationshipCurrentRecord,
  RelationshipEventRecord,
  RelationshipNodeInput,
  RelationshipNodeRecord,
  RelationshipOutboxRecord,
  RelationshipScope
} from "./repository";

export type {
  RelationshipCommandRepository,
  RelationshipCurrentRecord,
  RelationshipEventRecord,
  RelationshipNodeInput,
  RelationshipNodeRecord,
  RelationshipOutboxRecord,
  RelationshipScope
} from "./repository";

interface CommandProvenance {
  enterpriseId: string;
  authorizedScope: ArchitectureScopeRef;
  actor: ScopedActor;
  channel: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface RelationshipEndpointInput {
  identity: AssetNodeIdentity;
  expectedVersion?: bigint;
}

export interface UpsertRelationshipCommand extends CommandProvenance {
  source: RelationshipEndpointInput;
  target: RelationshipEndpointInput;
  relationType: RelationshipCode;
  sourceReference?: string;
  relationshipSource?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface DeleteRelationshipCommand extends CommandProvenance {
  source: RelationshipEndpointInput;
  target: RelationshipEndpointInput;
  relationType: RelationshipCode;
  sourceReference?: string;
  relationshipSource?: string;
  expectedRelationshipVersion?: bigint;
}

export interface UpsertAssetGraphCommand extends CommandProvenance {
  assetType: AssetType;
  asset: Asset;
}

export interface RelationshipCommandReceipt {
  relationshipId?: string;
  eventId?: string;
  graphVersion: bigint;
  replayed: boolean;
}

interface PendingRelationshipChange {
  current: Omit<RelationshipCurrentRecord, "dbId" | "version" | keyof RelationshipScope>;
  existing?: RelationshipCurrentRecord;
  action: "UPSERT" | "INVALIDATE" | "DELETE";
}

export class RelationshipCommandService {
  constructor(private readonly repository: RelationshipCommandRepository) {}

  async upsertRelationship(command: UpsertRelationshipCommand): Promise<RelationshipCommandReceipt> {
    return this.upsertRelationshipInternal(command, false);
  }

  async upsertLegacyRelationship(command: UpsertRelationshipCommand): Promise<RelationshipCommandReceipt> {
    return this.upsertRelationshipInternal(command, true);
  }

  private async upsertRelationshipInternal(command: UpsertRelationshipCommand, createLegacyEndpoints: boolean): Promise<RelationshipCommandReceipt> {
    const scope = validateCommandScope(command);
    validateEndpointScope(scope, command.source.identity);
    validateEndpointScope(scope, command.target.identity);

    return this.repository.transaction(async (repository) => {
      await repository.lockScope(scope);
      const replay = await repository.findEvent(scope, command.idempotencyKey);
      if (replay) return replayReceipt(replay);

      const sourceNode = await requireEndpoint(repository, scope, command.source, createLegacyEndpoints);
      const targetNode = await requireEndpoint(repository, scope, command.target, createLegacyEndpoints);
      validateRelationshipEndpoints(command.relationType, sourceNode.nodeType, targetNode.nodeType);
      const definition = relationshipOntology.get(command.relationType)!;
      const source = command.relationshipSource ?? "mcp";
      const sourceReference = command.sourceReference ?? `${command.channel}:${command.correlationId}`;
      const current = await repository.findCurrent(scope, {
        sourceNodeId: sourceNode.dbId,
        targetNodeId: targetNode.dbId,
        relationType: command.relationType,
        source,
        sourceReference
      });
      const next: PendingRelationshipChange = {
        existing: current,
        action: "UPSERT",
        current: {
          sourceNodeId: sourceNode.dbId,
          targetNodeId: targetNode.dbId,
          relationType: command.relationType,
          strength: definition.strength,
          confidence: command.confidence ?? definition.defaultConfidence,
          source,
          sourceReference,
          lifecycleStatus: "ACTIVE",
          validTo: null,
          metadata: command.metadata ?? {}
        }
      };
      if (!isEffectiveChange(next)) return { relationshipId: current?.dbId, graphVersion: await repository.currentGraphVersion(scope), replayed: false };

      return persistChanges(repository, scope, command, [next]);
    });
  }

  async deleteRelationship(command: DeleteRelationshipCommand): Promise<RelationshipCommandReceipt> {
    const scope = validateCommandScope(command);
    validateEndpointScope(scope, command.source.identity);
    validateEndpointScope(scope, command.target.identity);

    return this.repository.transaction(async (repository) => {
      await repository.lockScope(scope);
      const replay = await repository.findEvent(scope, command.idempotencyKey);
      if (replay) return replayReceipt(replay);

      const sourceNode = await requireEndpoint(repository, scope, command.source);
      const targetNode = await requireEndpoint(repository, scope, command.target);
      validateRelationshipEndpoints(command.relationType, sourceNode.nodeType, targetNode.nodeType);
      const source = command.relationshipSource ?? "mcp";
      const sourceReference = command.sourceReference ?? `${command.channel}:${command.correlationId}`;
      const current = await repository.findCurrent(scope, {
        sourceNodeId: sourceNode.dbId,
        targetNodeId: targetNode.dbId,
        relationType: command.relationType,
        source,
        sourceReference
      });
      if (!current || current.lifecycleStatus === "DELETED") {
        return { relationshipId: current?.dbId, graphVersion: await repository.currentGraphVersion(scope), replayed: false };
      }
      if (command.expectedRelationshipVersion !== undefined && command.expectedRelationshipVersion !== current.version) {
        throw new Error("RELATIONSHIP_VERSION_MISMATCH");
      }

      return persistChanges(repository, scope, command, [{
        existing: current,
        action: "DELETE",
        current: { ...current, lifecycleStatus: "DELETED", validTo: new Date() }
      }]);
    });
  }

  async upsertAssetGraph(command: UpsertAssetGraphCommand): Promise<RelationshipCommandReceipt> {
    const scope = validateCommandScope(command);
    const graph = extractAssetGraph(command.assetType, command.asset);
    if (!command.asset.architectureScope) throw new Error("ASSET_SCOPE_REQUIRED");
    validateEndpointScope(scope, command.asset.architectureScope);

    return this.repository.transaction(async (repository) => {
      await repository.lockScope(scope);
      const replay = await repository.findEvent(scope, command.idempotencyKey);
      if (replay) return replayReceipt(replay);

      const nodes = new Map<string, RelationshipNodeRecord>();
      for (const node of graph.nodes) {
        validateEndpointScope(scope, node);
        const parentNode = node.parentLogicalId ? nodes.get(node.parentLogicalId) : undefined;
        const persisted = await repository.upsertNode(scope, nodeInput(node, parentNode?.dbId));
        nodes.set(node.logicalId, persisted);
      }

      const changes: PendingRelationshipChange[] = [];
      const expectedParserKeys = new Set<string>();
      for (const relationship of graph.relationships) {
        const sourceNode = nodes.get(relationship.sourceLogicalId);
        const targetNode = nodes.get(relationship.targetLogicalId);
        if (!sourceNode || !targetNode) throw new Error("GRAPH_NODE_MISSING");
        const currentInput = {
          sourceNodeId: sourceNode.dbId,
          targetNodeId: targetNode.dbId,
          relationType: relationship.code,
          strength: relationshipOntology.get(relationship.code)!.strength,
          confidence: relationshipOntology.get(relationship.code)!.defaultConfidence,
          source: relationship.source,
          sourceReference: relationship.sourceReference,
          lifecycleStatus: "ACTIVE",
          validTo: null,
          metadata: {}
        } as const;
        expectedParserKeys.add(currentKey(currentInput));
        const existing = await repository.findCurrent(scope, currentInput);
        const change: PendingRelationshipChange = { current: currentInput, existing, action: "UPSERT" };
        if (isEffectiveChange(change)) changes.push(change);
      }

      const parserRows = await repository.listParserRelationships(scope, command.assetType, command.asset.id);
      for (const existing of parserRows) {
        if (existing.lifecycleStatus !== "ACTIVE" || expectedParserKeys.has(currentKey(existing))) continue;
        changes.push({
          existing,
          action: "INVALIDATE",
          current: { ...existing, lifecycleStatus: "INVALIDATED", validTo: new Date() }
        });
      }

      if (!changes.length) return { graphVersion: await repository.currentGraphVersion(scope), replayed: false };
      return persistChanges(repository, scope, command, changes);
    });
  }
}

function validateCommandScope(command: CommandProvenance): RelationshipScope {
  const applicationService = scopeById(command.authorizedScope.applicationServiceId);
  if (
    !applicationService ||
    applicationService.level !== "applicationService" ||
    applicationService.scopePath !== command.authorizedScope.scopePath
  ) {
    throw new Error("SCOPE_MISMATCH");
  }
  if (!hasScopeAccess(command.actor, applicationService, "write")) throw new Error("SCOPE_NOT_AUTHORIZED");
  return { enterpriseId: command.enterpriseId, ...command.authorizedScope };
}

function validateEndpointScope(scope: RelationshipScope, identity: ArchitectureScopeRef): void {
  if (identity.applicationServiceId !== scope.applicationServiceId || identity.scopePath !== scope.scopePath) {
    throw new Error("SCOPE_MISMATCH");
  }
}

async function requireEndpoint(
  repository: RelationshipCommandRepository,
  scope: RelationshipScope,
  endpoint: RelationshipEndpointInput,
  createLegacyEndpoint = false
): Promise<RelationshipNodeRecord> {
  const node = await repository.findNode(scope, endpoint.identity) ?? (
    createLegacyEndpoint ? await repository.upsertNode(scope, nodeInput(endpoint.identity)) : undefined
  );
  if (!node) throw new Error("RELATIONSHIP_ENDPOINT_NOT_FOUND");
  if (endpoint.expectedVersion !== undefined && endpoint.expectedVersion !== node.version) {
    throw new Error("ENDPOINT_VERSION_MISMATCH");
  }
  return node;
}

async function persistChanges(
  repository: RelationshipCommandRepository,
  scope: RelationshipScope,
  command: CommandProvenance,
  changes: PendingRelationshipChange[]
): Promise<RelationshipCommandReceipt> {
  const graphVersion = await repository.reserveNextGraphVersion(scope);
  let primaryEvent: RelationshipEventRecord | undefined;
  let primaryRelationship: RelationshipCurrentRecord | undefined;

  for (const [index, change] of changes.entries()) {
    const relationship = await repository.writeCurrent(scope, change.current, (change.existing?.version ?? 0n) + 1n);
    const event = await repository.appendEvent({
      dbId: "",
      ...scope,
      relationshipId: relationship.dbId,
      action: change.action,
      priorVersion: change.existing?.version,
      newVersion: relationship.version,
      graphVersion,
      actorType: command.actor.actorType,
      actorId: command.actor.actorId,
      channel: command.channel,
      correlationId: command.correlationId,
      idempotencyKey: index === 0 ? command.idempotencyKey : `${command.idempotencyKey}:${index}`,
      source: relationship.source,
      snapshot: relationshipSnapshot(relationship)
    });
    await repository.enqueueOutbox({
      dbId: "",
      ...scope,
      relationshipEventId: event.dbId,
      graphVersion,
      eventType: change.action === "UPSERT" ? "RELATIONSHIP_UPSERT" : "RELATIONSHIP_DELETE",
      payload: { eventId: event.dbId, action: change.action, relationship: relationshipSnapshot(relationship) },
      status: "PENDING",
      idempotencyKey: event.idempotencyKey
    });
    primaryEvent ??= event;
    primaryRelationship ??= relationship;
  }

  return {
    relationshipId: primaryRelationship?.dbId,
    eventId: primaryEvent?.dbId,
    graphVersion,
    replayed: false
  };
}

function nodeInput(node: AssetNodeIdentity, parentNodeId?: string): RelationshipNodeInput {
  return {
    ...node,
    parentNodeId,
    nodePath: `${node.nodeType}/${node.logicalId}`,
    displayName: node.logicalId,
    metadata: {}
  };
}

function currentKey(row: Pick<RelationshipCurrentRecord, "sourceNodeId" | "targetNodeId" | "relationType" | "source" | "sourceReference">): string {
  return `${row.sourceNodeId}:${row.targetNodeId}:${row.relationType}:${row.source}:${row.sourceReference}`;
}

function isEffectiveChange(change: PendingRelationshipChange): boolean {
  const existing = change.existing;
  if (!existing) return true;
  return existing.lifecycleStatus !== change.current.lifecycleStatus ||
    existing.strength !== change.current.strength ||
    existing.confidence !== change.current.confidence ||
    existing.validTo?.getTime() !== change.current.validTo?.getTime() ||
    JSON.stringify(existing.metadata) !== JSON.stringify(change.current.metadata);
}

function relationshipSnapshot(relationship: RelationshipCurrentRecord): Record<string, unknown> {
  return {
    relationshipId: relationship.dbId,
    sourceNodeId: relationship.sourceNodeId,
    targetNodeId: relationship.targetNodeId,
    relationType: relationship.relationType,
    strength: relationship.strength,
    confidence: relationship.confidence,
    source: relationship.source,
    sourceReference: relationship.sourceReference,
    lifecycleStatus: relationship.lifecycleStatus,
    version: relationship.version.toString(),
    metadata: relationship.metadata
  };
}

function replayReceipt(event: RelationshipEventRecord): RelationshipCommandReceipt {
  return {
    relationshipId: event.relationshipId,
    eventId: event.dbId,
    graphVersion: event.graphVersion,
    replayed: true
  };
}
