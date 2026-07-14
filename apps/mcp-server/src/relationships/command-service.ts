import { createHash } from "node:crypto";
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
  RelationshipCommandReceiptRecord,
  RelationshipCommandRepository,
  RelationshipCurrentRecord,
  RelationshipEventRecord,
  RelationshipNodeInput,
  RelationshipNodeRecord,
  RelationshipOutboxRecord,
  RelationshipScope
} from "./repository";

export type {
  RelationshipCommandReceiptRecord,
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

export function createTrustedRelationshipExecutionContext(input: { enterpriseId: string; scope: ArchitectureScopeRef; actor: Pick<ScopedActor, "actorType" | "actorId"> }): TrustedRelationshipExecutionContext {
  return Object.freeze({ scope: Object.freeze({ enterpriseId: input.enterpriseId, ...input.scope }), actorType: input.actor.actorType, actorId: input.actor.actorId, [trustedExecutionContext]: true as const });
}

interface CommandMetadata { channel: string; correlationId: string; idempotencyKey: string; }
export interface RelationshipEndpointInput { identity: AssetNodeIdentity; expectedVersion?: bigint; }
export interface UpsertRelationshipCommand extends CommandMetadata { source: RelationshipEndpointInput; target: RelationshipEndpointInput; relationType: RelationshipCode; sourceReference?: string; relationshipSource?: string; confidence?: number; metadata?: Record<string, unknown>; }
export interface DeleteRelationshipCommand extends CommandMetadata { source: RelationshipEndpointInput; target: RelationshipEndpointInput; relationType: RelationshipCode; sourceReference?: string; relationshipSource?: string; expectedRelationshipVersion?: bigint; }
export interface DeleteLegacyRelationshipCommand extends Omit<DeleteRelationshipCommand, "relationType"> { relationType: string; }
export interface UpsertAssetGraphCommand extends CommandMetadata { assetType: AssetType; asset: Asset; }
export interface RelationshipCommandReceipt { relationshipId?: string; assetNodeId?: string; eventId?: string; graphVersion: bigint; replayed: boolean; }

interface PendingRelationshipChange { kind: "relationship"; current: Omit<RelationshipCurrentRecord, "dbId" | "version" | keyof RelationshipScope>; existing?: RelationshipCurrentRecord; action: "UPSERT" | "INVALIDATE" | "DELETE"; }
interface PendingNodeChange { kind: "node"; node: RelationshipNodeRecord; priorVersion?: bigint; }
type PendingGraphChange = PendingRelationshipChange | PendingNodeChange;

export class RelationshipCommandService {
  constructor(private readonly repository: RelationshipCommandRepository, private readonly context: TrustedRelationshipExecutionContext) {
    if (!context[trustedExecutionContext]) throw new Error("TRUSTED_EXECUTION_CONTEXT_REQUIRED");
  }

  async upsertRelationship(command: UpsertRelationshipCommand): Promise<RelationshipCommandReceipt> { return this.upsertRelationshipInternal(command, false, "UPSERT_RELATIONSHIP"); }
  async upsertLegacyRelationship(command: UpsertRelationshipCommand): Promise<RelationshipCommandReceipt> { return this.upsertRelationshipInternal(command, true, "UPSERT_LEGACY_RELATIONSHIP"); }

  private async upsertRelationshipInternal(command: UpsertRelationshipCommand, createLegacyEndpoints: boolean, commandType: string): Promise<RelationshipCommandReceipt> {
    return this.executeCommand(commandType, command, async (repository, receipt) => {
      const scope = this.context.scope;
      validateEndpointScope(scope, command.source.identity);
      validateEndpointScope(scope, command.target.identity);
      const sourceNode = await requireEndpoint(repository, scope, command.source, createLegacyEndpoints);
      const targetNode = await requireEndpoint(repository, scope, command.target, createLegacyEndpoints);
      validateRelationshipEndpoints(command.relationType, sourceNode.nodeType, targetNode.nodeType);
      const definition = relationshipOntology.get(command.relationType)!;
      const source = command.relationshipSource ?? "mcp";
      const sourceReference = command.sourceReference ?? `${command.channel}:${command.correlationId}`;
      const current = await repository.findCurrent(scope, { sourceNodeId: sourceNode.dbId, targetNodeId: targetNode.dbId, relationType: command.relationType, source, sourceReference });
      const change: PendingRelationshipChange = { kind: "relationship", existing: current, action: "UPSERT", current: { sourceNodeId: sourceNode.dbId, targetNodeId: targetNode.dbId, relationType: command.relationType, strength: definition.strength, confidence: command.confidence ?? definition.defaultConfidence, source, sourceReference, lifecycleStatus: "ACTIVE", validTo: null, metadata: command.metadata ?? {} } };
      if (!isEffectiveRelationshipChange(change)) return noOpReceipt(current?.dbId, await repository.currentGraphVersion(scope));
      return persistChanges(repository, this.context, command, receipt, [change]);
    });
  }

  async deleteRelationship(command: DeleteRelationshipCommand): Promise<RelationshipCommandReceipt> { return this.deleteRelationshipInternal(command, false, "DELETE_RELATIONSHIP"); }
  async deleteLegacyRelationship(command: DeleteLegacyRelationshipCommand): Promise<RelationshipCommandReceipt> { return this.deleteRelationshipInternal(command, true, "DELETE_LEGACY_RELATIONSHIP"); }

  private async deleteRelationshipInternal(command: DeleteLegacyRelationshipCommand, bypassOntologyValidation: boolean, commandType: string): Promise<RelationshipCommandReceipt> {
    return this.executeCommand(commandType, command, async (repository, receipt) => {
      const scope = this.context.scope;
      validateEndpointScope(scope, command.source.identity);
      validateEndpointScope(scope, command.target.identity);
      const sourceNode = await requireEndpoint(repository, scope, command.source);
      const targetNode = await requireEndpoint(repository, scope, command.target);
      if (!bypassOntologyValidation) validateRelationshipEndpoints(command.relationType as RelationshipCode, sourceNode.nodeType, targetNode.nodeType);
      const source = command.relationshipSource ?? "mcp";
      const sourceReference = command.sourceReference ?? `${command.channel}:${command.correlationId}`;
      const current = await repository.findCurrent(scope, { sourceNodeId: sourceNode.dbId, targetNodeId: targetNode.dbId, relationType: command.relationType, source, sourceReference });
      if (!current || current.lifecycleStatus === "DELETED") return noOpReceipt(current?.dbId, await repository.currentGraphVersion(scope));
      if (command.expectedRelationshipVersion !== undefined && command.expectedRelationshipVersion !== current.version) throw new Error("RELATIONSHIP_VERSION_MISMATCH");
      const result = await persistChanges(repository, this.context, command, receipt, [{ kind: "relationship", existing: current, action: "DELETE", current: { ...current, lifecycleStatus: "DELETED", validTo: new Date() } }]);
      if (current.source === "legacy-asset-link") await repository.deleteLegacyAssetLink(scope, current.sourceReference);
      return result;
    });
  }

  async upsertAssetGraph(command: UpsertAssetGraphCommand): Promise<RelationshipCommandReceipt> {
    return this.executeCommand("UPSERT_ASSET_GRAPH", command, async (repository, receipt) => {
      const scope = this.context.scope;
      if (!command.asset.architectureScope) throw new Error("ASSET_SCOPE_REQUIRED");
      validateEndpointScope(scope, command.asset.architectureScope);
      const graph = extractAssetGraph(command.assetType, command.asset);
      const nodes = new Map<string, RelationshipNodeRecord>();
      const changes: PendingGraphChange[] = [];
      for (const node of graph.nodes) {
        validateEndpointScope(scope, node);
        const parentNode = node.parentLogicalId ? nodes.get(node.parentLogicalId) : undefined;
        const input = nodeInput(node, parentNode?.dbId, assetUpdatedAt(command.asset));
        const existing = await repository.findNode(scope, node);
        const persisted = existing && !isEffectiveNodeChange(existing, input) ? existing : await repository.upsertNode(scope, input);
        nodes.set(node.logicalId, persisted);
        if (!existing || persisted !== existing) changes.push({ kind: "node", node: persisted, priorVersion: existing?.version });
      }
      const expectedParserKeys = new Set<string>();
      for (const relationship of graph.relationships) {
        const sourceNode = nodes.get(relationship.sourceLogicalId);
        const targetNode = nodes.get(relationship.targetLogicalId);
        if (!sourceNode || !targetNode) throw new Error("GRAPH_NODE_MISSING");
        const currentInput = { sourceNodeId: sourceNode.dbId, targetNodeId: targetNode.dbId, relationType: relationship.code, strength: relationshipOntology.get(relationship.code)!.strength, confidence: relationshipOntology.get(relationship.code)!.defaultConfidence, source: relationship.source, sourceReference: relationship.sourceReference, lifecycleStatus: "ACTIVE", validTo: null, metadata: {} } as const;
        expectedParserKeys.add(currentKey(currentInput));
        const existing = await repository.findCurrent(scope, currentInput);
        const change: PendingRelationshipChange = { kind: "relationship", current: currentInput, existing, action: "UPSERT" };
        if (isEffectiveRelationshipChange(change)) changes.push(change);
      }
      for (const existing of await repository.listParserRelationships(scope, command.assetType, command.asset.id)) {
        if (existing.lifecycleStatus === "ACTIVE" && !expectedParserKeys.has(currentKey(existing))) changes.push({ kind: "relationship", existing, action: "INVALIDATE", current: { ...existing, lifecycleStatus: "INVALIDATED", validTo: new Date() } });
      }
      if (!changes.length) return noOpReceipt(undefined, await repository.currentGraphVersion(scope));
      return persistChanges(repository, this.context, command, receipt, changes);
    });
  }

  private async executeCommand(commandType: string, command: CommandMetadata, operation: (repository: RelationshipCommandRepository, receipt: RelationshipCommandReceiptRecord) => Promise<RelationshipCommandReceipt>): Promise<RelationshipCommandReceipt> {
    const scope = this.context.scope;
    const commandHash = hashCommand(scope, commandType, command);
    return this.repository.transaction(async (repository) => {
      await repository.lockScope(scope);
      const existing = await repository.findReceipt(scope, command.idempotencyKey);
      if (existing) {
        if (existing.commandHash !== commandHash) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        if (existing.status !== "COMPLETED") throw new Error("IDEMPOTENCY_RECEIPT_INCOMPLETE");
        return replayReceipt(existing);
      }
      const receipt = await repository.createReceipt(scope, { idempotencyKey: command.idempotencyKey, commandHash, commandType });
      const result = await operation(repository, receipt);
      await repository.completeReceipt(scope, receipt.dbId, { status: "COMPLETED", result: receiptResult(result), graphVersion: result.graphVersion, primaryEventId: result.eventId });
      return result;
    });
  }
}

function validateEndpointScope(scope: RelationshipScope, identity: ArchitectureScopeRef): void { if (identity.applicationServiceId !== scope.applicationServiceId || identity.scopePath !== scope.scopePath) throw new Error("SCOPE_MISMATCH"); }
async function requireEndpoint(repository: RelationshipCommandRepository, scope: RelationshipScope, endpoint: RelationshipEndpointInput, createLegacyEndpoint = false): Promise<RelationshipNodeRecord> {
  const node = await repository.findNode(scope, endpoint.identity) ?? (createLegacyEndpoint ? await repository.upsertNode(scope, nodeInput(endpoint.identity)) : undefined);
  if (!node) throw new Error("RELATIONSHIP_ENDPOINT_NOT_FOUND");
  if (endpoint.expectedVersion !== undefined && endpoint.expectedVersion !== node.version) throw new Error("ENDPOINT_VERSION_MISMATCH");
  return node;
}
async function persistChanges(repository: RelationshipCommandRepository, context: TrustedRelationshipExecutionContext, command: CommandMetadata, receipt: RelationshipCommandReceiptRecord, changes: PendingGraphChange[]): Promise<RelationshipCommandReceipt> {
  const graphVersion = await repository.reserveNextGraphVersion(context.scope);
  let primaryEvent: RelationshipEventRecord | undefined;
  let relationshipId: string | undefined;
  let assetNodeId: string | undefined;
  for (const [ordinal, change] of changes.entries()) {
    if (change.kind === "relationship") {
      const relationship = await repository.writeCurrent(context.scope, change.current, (change.existing?.version ?? 0n) + 1n);
      const event = await appendGraphEvent(repository, context, command, receipt, ordinal, graphVersion, { relationshipId: relationship.dbId, action: change.action, priorVersion: change.existing?.version, newVersion: relationship.version, source: relationship.source, snapshot: relationshipSnapshot(relationship), eventType: change.action === "UPSERT" ? "RELATIONSHIP_UPSERT" : "RELATIONSHIP_DELETE" });
      primaryEvent ??= event; relationshipId ??= relationship.dbId;
    } else {
      const event = await appendGraphEvent(repository, context, command, receipt, ordinal, graphVersion, { assetNodeId: change.node.dbId, action: "NODE_UPSERT", priorVersion: change.priorVersion, newVersion: change.node.version, source: "asset-parser", snapshot: nodeSnapshot(change.node), eventType: "ASSET_NODE_UPSERT" });
      primaryEvent ??= event; assetNodeId ??= change.node.dbId;
    }
  }
  return { relationshipId, assetNodeId, eventId: primaryEvent?.dbId, graphVersion, replayed: false };
}
async function appendGraphEvent(repository: RelationshipCommandRepository, context: TrustedRelationshipExecutionContext, command: CommandMetadata, receipt: RelationshipCommandReceiptRecord, ordinal: number, graphVersion: bigint, input: { relationshipId?: string; assetNodeId?: string; action: string; priorVersion?: bigint; newVersion: bigint; source: string; snapshot: Record<string, unknown>; eventType: string; }): Promise<RelationshipEventRecord> {
  const eventIdempotencyKey = internalIdempotencyKey(receipt.dbId, "event", ordinal);
  const event = await repository.appendEvent({ dbId: "", ...context.scope, relationshipId: input.relationshipId, assetNodeId: input.assetNodeId, action: input.action, priorVersion: input.priorVersion, newVersion: input.newVersion, graphVersion, actorType: context.actorType, actorId: context.actorId, channel: command.channel, correlationId: command.correlationId, idempotencyKey: eventIdempotencyKey, source: input.source, snapshot: input.snapshot });
  await repository.enqueueOutbox({ dbId: "", ...context.scope, relationshipEventId: event.dbId, graphVersion, eventType: input.eventType, payload: { eventId: event.dbId, action: input.action, subject: input.snapshot }, status: "PENDING", idempotencyKey: internalIdempotencyKey(receipt.dbId, "outbox", ordinal) });
  return event;
}
function noOpReceipt(relationshipId: string | undefined, graphVersion: bigint): RelationshipCommandReceipt { return { relationshipId, graphVersion, replayed: false }; }
function internalIdempotencyKey(receiptId: string, kind: "event" | "outbox", ordinal: number): string { return `relationship-command:${receiptId}:${kind}:${ordinal}`; }
function hashCommand(scope: RelationshipScope, commandType: string, command: CommandMetadata): string {
  const { channel: _channel, correlationId: _correlationId, idempotencyKey: _idempotencyKey, ...business } = command as CommandMetadata & Record<string, unknown>;
  return createHash("sha256").update(stableStringify({ scope, commandType, command: business })).digest("hex");
}
function stableStringify(value: unknown): string { return JSON.stringify(canonicalize(value)); }
function canonicalize(value: unknown): unknown {
  if (typeof value === "bigint") return { $bigint: value.toString() };
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, nested]) => nested !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, canonicalize(nested)]));
  return value;
}
function nodeInput(node: AssetNodeIdentity, parentNodeId?: string, assetUpdatedAt?: string): RelationshipNodeInput { return { ...node, parentNodeId, nodePath: `${node.nodeType}/${node.logicalId}`, displayName: node.logicalId, metadata: assetUpdatedAt ? { assetUpdatedAt } : {} }; }
function assetUpdatedAt(asset: Asset): string | undefined { return "updatedAt" in asset && typeof asset.updatedAt === "string" ? asset.updatedAt : undefined; }
function currentKey(row: Pick<RelationshipCurrentRecord, "sourceNodeId" | "targetNodeId" | "relationType" | "source" | "sourceReference">): string { return `${row.sourceNodeId}:${row.targetNodeId}:${row.relationType}:${row.source}:${row.sourceReference}`; }
function isEffectiveRelationshipChange(change: PendingRelationshipChange): boolean { const existing = change.existing; return !existing || existing.lifecycleStatus !== change.current.lifecycleStatus || existing.strength !== change.current.strength || existing.confidence !== change.current.confidence || existing.validTo?.getTime() !== change.current.validTo?.getTime() || JSON.stringify(existing.metadata) !== JSON.stringify(change.current.metadata); }
function isEffectiveNodeChange(existing: RelationshipNodeRecord, input: RelationshipNodeInput): boolean { return existing.rootAssetType !== input.rootAssetType || existing.rootAssetId !== input.rootAssetId || existing.parentNodeId !== (input.parentNodeId ?? null) || existing.nodePath !== (input.nodePath ?? `${input.nodeType}/${input.logicalId}`) || existing.displayName !== (input.displayName ?? input.logicalId) || JSON.stringify(existing.metadata) !== JSON.stringify(input.metadata ?? {}); }
function relationshipSnapshot(relationship: RelationshipCurrentRecord): Record<string, unknown> { return { relationshipId: relationship.dbId, sourceNodeId: relationship.sourceNodeId, targetNodeId: relationship.targetNodeId, relationType: relationship.relationType, strength: relationship.strength, confidence: relationship.confidence, source: relationship.source, sourceReference: relationship.sourceReference, lifecycleStatus: relationship.lifecycleStatus, version: relationship.version.toString(), metadata: relationship.metadata }; }
function nodeSnapshot(node: RelationshipNodeRecord): Record<string, unknown> { return { assetNodeId: node.dbId, nodeType: node.nodeType, logicalId: node.logicalId, rootAssetType: node.rootAssetType, rootAssetId: node.rootAssetId, version: node.version.toString(), lifecycleStatus: node.lifecycleStatus, metadata: node.metadata }; }
function receiptResult(receipt: RelationshipCommandReceipt): Record<string, unknown> { return { relationshipId: receipt.relationshipId ?? null, assetNodeId: receipt.assetNodeId ?? null, eventId: receipt.eventId ?? null }; }
function replayReceipt(receipt: RelationshipCommandReceiptRecord): RelationshipCommandReceipt { return { relationshipId: optionalString(receipt.result.relationshipId), assetNodeId: optionalString(receipt.result.assetNodeId), eventId: optionalString(receipt.result.eventId) ?? receipt.primaryEventId ?? undefined, graphVersion: receipt.graphVersion, replayed: true }; }
function optionalString(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
