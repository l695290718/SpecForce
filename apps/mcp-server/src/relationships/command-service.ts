import {
  extractAssetGraph,
  relationshipOntology,
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

const trustedExecutionContext = Symbol("trustedRelationshipExecutionContext");

export interface TrustedRelationshipExecutionContext {
  readonly scope: RelationshipScope;
  readonly actorType: ScopedActor["actorType"];
  readonly actorId: string;
  readonly [trustedExecutionContext]: true;
}

export function createTrustedRelationshipExecutionContext(input: {
  enterpriseId: string;
  scope: ArchitectureScopeRef;
  actor: Pick<ScopedActor, "actorType" | "actorId">;
}): TrustedRelationshipExecutionContext {
  return Object.freeze({
    scope: Object.freeze({ enterpriseId: input.enterpriseId, ...input.scope }),
    actorType: input.actor.actorType,
    actorId: input.actor.actorId,
    [trustedExecutionContext]: true as const
  });
}

interface CommandMetadata {
  channel: string;
  correlationId: string;
  idempotencyKey: string;
}

export interface RelationshipEndpointInput {
  identity: AssetNodeIdentity;
  expectedVersion?: bigint;
}

export interface UpsertRelationshipCommand extends CommandMetadata {
  source: RelationshipEndpointInput;
  target: RelationshipEndpointInput;
  relationType: RelationshipCode;
  sourceReference?: string;
  relationshipSource?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface DeleteRelationshipCommand extends CommandMetadata {
  source: RelationshipEndpointInput;
  target: RelationshipEndpointInput;
  relationType: RelationshipCode;
  sourceReference?: string;
  relationshipSource?: string;
  expectedRelationshipVersion?: bigint;
}

export interface DeleteLegacyRelationshipCommand extends Omit<DeleteRelationshipCommand, "relationType"> {
  relationType: string;
}

export interface UpsertAssetGraphCommand extends CommandMetadata {
  assetType: AssetType;
  asset: Asset;
}

export interface RelationshipCommandReceipt {
  relationshipId?: string;
  assetNodeId?: string;
  eventId?: string;
  graphVersion: bigint;
  replayed: boolean;
}

interface PendingRelationshipChange {
  kind: "relationship";
  current: Omit<RelationshipCurrentRecord, "dbId" | "version" | keyof RelationshipScope>;
  existing?: RelationshipCurrentRecord;
  action: "UPSERT" | "INVALIDATE" | "DELETE";
}

interface PendingNodeChange {
  kind: "node";
  node: RelationshipNodeRecord;
  priorVersion?: bigint;
}

type PendingGraphChange = PendingRelationshipChange | PendingNodeChange;

export class RelationshipCommandService {
  constructor(
    private readonly repository: RelationshipCommandRepository,
    private readonly context: TrustedRelationshipExecutionContext
  ) {
    if (!context[trustedExecutionContext]) throw new Error("TRUSTED_EXECUTION_CONTEXT_REQUIRED");
  }

  async upsertRelationship(command: UpsertRelationshipCommand): Promise<RelationshipCommandReceipt> {
    return this.upsertRelationshipInternal(command, false);
  }

  async upsertLegacyRelationship(command: UpsertRelationshipCommand): Promise<RelationshipCommandReceipt> {
    return this.upsertRelationshipInternal(command, true);
  }

  private async upsertRelationshipInternal(command: UpsertRelationshipCommand, createLegacyEndpoints: boolean): Promise<RelationshipCommandReceipt> {
    const scope = this.context.scope;
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
      const change: PendingRelationshipChange = {
        kind: "relationship",
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
      if (!isEffectiveRelationshipChange(change)) return { relationshipId: current?.dbId, graphVersion: await repository.currentGraphVersion(scope), replayed: false };
      return persistChanges(repository, this.context, command, [change]);
    });
  }

  async deleteRelationship(command: DeleteRelationshipCommand): Promise<RelationshipCommandReceipt> {
    return this.deleteRelationshipInternal(command, false);
  }

  async deleteLegacyRelationship(command: DeleteLegacyRelationshipCommand): Promise<RelationshipCommandReceipt> {
    return this.deleteRelationshipInternal(command, true);
  }

  private async deleteRelationshipInternal(command: DeleteLegacyRelationshipCommand, bypassOntologyValidation: boolean): Promise<RelationshipCommandReceipt> {
    const scope = this.context.scope;
    validateEndpointScope(scope, command.source.identity);
    validateEndpointScope(scope, command.target.identity);
    return this.repository.transaction(async (repository) => {
      await repository.lockScope(scope);
      const replay = await repository.findEvent(scope, command.idempotencyKey);
      if (replay) return replayReceipt(replay);
      const sourceNode = await requireEndpoint(repository, scope, command.source);
      const targetNode = await requireEndpoint(repository, scope, command.target);
      if (!bypassOntologyValidation) validateRelationshipEndpoints(command.relationType as RelationshipCode, sourceNode.nodeType, targetNode.nodeType);
      const source = command.relationshipSource ?? "mcp";
      const sourceReference = command.sourceReference ?? `${command.channel}:${command.correlationId}`;
      const current = await repository.findCurrent(scope, {
        sourceNodeId: sourceNode.dbId,
        targetNodeId: targetNode.dbId,
        relationType: command.relationType,
        source,
        sourceReference
      });
      if (!current || current.lifecycleStatus === "DELETED") return { relationshipId: current?.dbId, graphVersion: await repository.currentGraphVersion(scope), replayed: false };
      if (command.expectedRelationshipVersion !== undefined && command.expectedRelationshipVersion !== current.version) throw new Error("RELATIONSHIP_VERSION_MISMATCH");
      const receipt = await persistChanges(repository, this.context, command, [{
        kind: "relationship",
        existing: current,
        action: "DELETE",
        current: { ...current, lifecycleStatus: "DELETED", validTo: new Date() }
      }]);
      if (current.source === "legacy-asset-link") await repository.deleteLegacyAssetLink(scope, current.sourceReference);
      return receipt;
    });
  }

  async upsertAssetGraph(command: UpsertAssetGraphCommand): Promise<RelationshipCommandReceipt> {
    const scope = this.context.scope;
    const graph = extractAssetGraph(command.assetType, command.asset);
    if (!command.asset.architectureScope) throw new Error("ASSET_SCOPE_REQUIRED");
    validateEndpointScope(scope, command.asset.architectureScope);

    return this.repository.transaction(async (repository) => {
      await repository.lockScope(scope);
      const replay = await repository.findEvent(scope, command.idempotencyKey);
      if (replay) return replayReceipt(replay);
      const nodes = new Map<string, RelationshipNodeRecord>();
      const changes: PendingGraphChange[] = [];
      for (const node of graph.nodes) {
        validateEndpointScope(scope, node);
        const parentNode = node.parentLogicalId ? nodes.get(node.parentLogicalId) : undefined;
        const input = nodeInput(node, parentNode?.dbId, assetUpdatedAt(command.asset));
        const existing = await repository.findNode(scope, node);
        const persisted = existing && !isEffectiveNodeChange(existing, input)
          ? existing
          : await repository.upsertNode(scope, input);
        nodes.set(node.logicalId, persisted);
        if (!existing || persisted !== existing) changes.push({ kind: "node", node: persisted, priorVersion: existing?.version });
      }

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
        const change: PendingRelationshipChange = { kind: "relationship", current: currentInput, existing, action: "UPSERT" };
        if (isEffectiveRelationshipChange(change)) changes.push(change);
      }
      const parserRows = await repository.listParserRelationships(scope, command.assetType, command.asset.id);
      for (const existing of parserRows) {
        if (existing.lifecycleStatus !== "ACTIVE" || expectedParserKeys.has(currentKey(existing))) continue;
        changes.push({ kind: "relationship", existing, action: "INVALIDATE", current: { ...existing, lifecycleStatus: "INVALIDATED", validTo: new Date() } });
      }
      if (!changes.length) return { graphVersion: await repository.currentGraphVersion(scope), replayed: false };
      return persistChanges(repository, this.context, command, changes);
    });
  }
}

function validateEndpointScope(scope: RelationshipScope, identity: ArchitectureScopeRef): void {
  if (identity.applicationServiceId !== scope.applicationServiceId || identity.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH");
}

async function requireEndpoint(repository: RelationshipCommandRepository, scope: RelationshipScope, endpoint: RelationshipEndpointInput, createLegacyEndpoint = false): Promise<RelationshipNodeRecord> {
  const node = await repository.findNode(scope, endpoint.identity) ?? (createLegacyEndpoint ? await repository.upsertNode(scope, nodeInput(endpoint.identity)) : undefined);
  if (!node) throw new Error("RELATIONSHIP_ENDPOINT_NOT_FOUND");
  if (endpoint.expectedVersion !== undefined && endpoint.expectedVersion !== node.version) throw new Error("ENDPOINT_VERSION_MISMATCH");
  return node;
}

async function persistChanges(repository: RelationshipCommandRepository, context: TrustedRelationshipExecutionContext, command: CommandMetadata, changes: PendingGraphChange[]): Promise<RelationshipCommandReceipt> {
  const graphVersion = await repository.reserveNextGraphVersion(context.scope);
  let primaryEvent: RelationshipEventRecord | undefined;
  let relationshipId: string | undefined;
  let assetNodeId: string | undefined;
  for (const [index, change] of changes.entries()) {
    const idempotencyKey = index === 0 ? command.idempotencyKey : `${command.idempotencyKey}:${index}`;
    if (change.kind === "relationship") {
      const relationship = await repository.writeCurrent(context.scope, change.current, (change.existing?.version ?? 0n) + 1n);
      const event = await appendGraphEvent(repository, context, command, idempotencyKey, graphVersion, {
        relationshipId: relationship.dbId,
        action: change.action,
        priorVersion: change.existing?.version,
        newVersion: relationship.version,
        source: relationship.source,
        snapshot: relationshipSnapshot(relationship),
        eventType: change.action === "UPSERT" ? "RELATIONSHIP_UPSERT" : "RELATIONSHIP_DELETE"
      });
      primaryEvent ??= event;
      relationshipId ??= relationship.dbId;
    } else {
      const event = await appendGraphEvent(repository, context, command, idempotencyKey, graphVersion, {
        assetNodeId: change.node.dbId,
        action: "NODE_UPSERT",
        priorVersion: change.priorVersion,
        newVersion: change.node.version,
        source: "asset-parser",
        snapshot: nodeSnapshot(change.node),
        eventType: "ASSET_NODE_UPSERT"
      });
      primaryEvent ??= event;
      assetNodeId ??= change.node.dbId;
    }
  }
  return { relationshipId, assetNodeId, eventId: primaryEvent?.dbId, graphVersion, replayed: false };
}

async function appendGraphEvent(repository: RelationshipCommandRepository, context: TrustedRelationshipExecutionContext, command: CommandMetadata, idempotencyKey: string, graphVersion: bigint, input: {
  relationshipId?: string;
  assetNodeId?: string;
  action: string;
  priorVersion?: bigint;
  newVersion: bigint;
  source: string;
  snapshot: Record<string, unknown>;
  eventType: string;
}): Promise<RelationshipEventRecord> {
  const event = await repository.appendEvent({
    dbId: "", ...context.scope, relationshipId: input.relationshipId, assetNodeId: input.assetNodeId,
    action: input.action, priorVersion: input.priorVersion, newVersion: input.newVersion, graphVersion,
    actorType: context.actorType, actorId: context.actorId, channel: command.channel,
    correlationId: command.correlationId, idempotencyKey, source: input.source, snapshot: input.snapshot
  });
  await repository.enqueueOutbox({
    dbId: "", ...context.scope, relationshipEventId: event.dbId, graphVersion, eventType: input.eventType,
    payload: { eventId: event.dbId, action: input.action, subject: input.snapshot }, status: "PENDING", idempotencyKey
  });
  return event;
}

function nodeInput(node: AssetNodeIdentity, parentNodeId?: string, assetUpdatedAt?: string): RelationshipNodeInput {
  return { ...node, parentNodeId, nodePath: `${node.nodeType}/${node.logicalId}`, displayName: node.logicalId, metadata: assetUpdatedAt ? { assetUpdatedAt } : {} };
}

function assetUpdatedAt(asset: Asset): string | undefined {
  return "updatedAt" in asset && typeof asset.updatedAt === "string" ? asset.updatedAt : undefined;
}

function currentKey(row: Pick<RelationshipCurrentRecord, "sourceNodeId" | "targetNodeId" | "relationType" | "source" | "sourceReference">): string {
  return `${row.sourceNodeId}:${row.targetNodeId}:${row.relationType}:${row.source}:${row.sourceReference}`;
}

function isEffectiveRelationshipChange(change: PendingRelationshipChange): boolean {
  const existing = change.existing;
  if (!existing) return true;
  return existing.lifecycleStatus !== change.current.lifecycleStatus || existing.strength !== change.current.strength || existing.confidence !== change.current.confidence || existing.validTo?.getTime() !== change.current.validTo?.getTime() || JSON.stringify(existing.metadata) !== JSON.stringify(change.current.metadata);
}

function isEffectiveNodeChange(existing: RelationshipNodeRecord, input: RelationshipNodeInput): boolean {
  return existing.rootAssetType !== input.rootAssetType || existing.rootAssetId !== input.rootAssetId || existing.parentNodeId !== (input.parentNodeId ?? null) || existing.nodePath !== (input.nodePath ?? `${input.nodeType}/${input.logicalId}`) || existing.displayName !== (input.displayName ?? input.logicalId) || JSON.stringify(existing.metadata) !== JSON.stringify(input.metadata ?? {});
}

function relationshipSnapshot(relationship: RelationshipCurrentRecord): Record<string, unknown> {
  return { relationshipId: relationship.dbId, sourceNodeId: relationship.sourceNodeId, targetNodeId: relationship.targetNodeId, relationType: relationship.relationType, strength: relationship.strength, confidence: relationship.confidence, source: relationship.source, sourceReference: relationship.sourceReference, lifecycleStatus: relationship.lifecycleStatus, version: relationship.version.toString(), metadata: relationship.metadata };
}

function nodeSnapshot(node: RelationshipNodeRecord): Record<string, unknown> {
  return { assetNodeId: node.dbId, nodeType: node.nodeType, logicalId: node.logicalId, rootAssetType: node.rootAssetType, rootAssetId: node.rootAssetId, version: node.version.toString(), lifecycleStatus: node.lifecycleStatus, metadata: node.metadata };
}

function replayReceipt(event: RelationshipEventRecord): RelationshipCommandReceipt {
  return { relationshipId: event.relationshipId ?? undefined, assetNodeId: event.assetNodeId ?? undefined, eventId: event.dbId, graphVersion: event.graphVersion, replayed: true };
}
