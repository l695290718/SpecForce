import { Prisma, PrismaClient } from "@prisma/client";
import type { AssetNodeIdentity, AssetNodeType, AssetType, RelationshipStrength } from "@specforge/core";

export interface RelationshipScope {
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
}

export interface RelationshipNodeInput extends AssetNodeIdentity {
  parentNodeId?: string | null;
  nodePath?: string;
  displayName?: string;
  metadata?: Record<string, unknown>;
}

export interface RelationshipNodeRecord extends RelationshipScope {
  dbId: string;
  nodeType: AssetNodeType;
  logicalId: string;
  rootAssetType: AssetType;
  rootAssetId: string;
  parentNodeId?: string | null;
  nodePath: string;
  displayName: string;
  metadata: Record<string, unknown>;
  version: bigint;
  lifecycleStatus: string;
}

export interface RelationshipCurrentRecord extends RelationshipScope {
  dbId: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  strength: RelationshipStrength;
  confidence: number;
  source: string;
  sourceReference: string;
  validTo?: Date | null;
  lifecycleStatus: string;
  metadata: Record<string, unknown>;
  version: bigint;
}

export interface RelationshipEventRecord extends RelationshipScope {
  dbId: string;
  relationshipId?: string | null;
  assetNodeId?: string | null;
  action: string;
  priorVersion?: bigint | null;
  newVersion: bigint;
  graphVersion: bigint;
  actorType: string;
  actorId: string;
  channel: string;
  correlationId: string;
  idempotencyKey: string;
  source: string;
  snapshot: Record<string, unknown>;
}

export interface RelationshipOutboxRecord extends RelationshipScope {
  dbId: string;
  relationshipEventId: string;
  graphVersion: bigint;
  eventType: string;
  payload: Record<string, unknown>;
  status: string;
  idempotencyKey: string;
}

export interface RelationshipCommandRepository {
  transaction<T>(operation: (repository: RelationshipCommandRepository) => Promise<T>): Promise<T>;
  lockScope(scope: RelationshipScope): Promise<void>;
  findEvent(scope: RelationshipScope, idempotencyKey: string): Promise<RelationshipEventRecord | undefined>;
  reserveNextGraphVersion(scope: RelationshipScope): Promise<bigint>;
  currentGraphVersion(scope: RelationshipScope): Promise<bigint>;
  findNode(scope: RelationshipScope, identity: Pick<RelationshipNodeRecord, "nodeType" | "logicalId">): Promise<RelationshipNodeRecord | undefined>;
  upsertNode(scope: RelationshipScope, node: RelationshipNodeInput): Promise<RelationshipNodeRecord>;
  findCurrent(scope: RelationshipScope, identity: Pick<RelationshipCurrentRecord, "sourceNodeId" | "targetNodeId" | "relationType" | "source" | "sourceReference">): Promise<RelationshipCurrentRecord | undefined>;
  writeCurrent(scope: RelationshipScope, input: Omit<RelationshipCurrentRecord, "dbId" | "version" | keyof RelationshipScope>, version: bigint): Promise<RelationshipCurrentRecord>;
  listParserRelationships(scope: RelationshipScope, rootAssetType: AssetType, rootAssetId: string): Promise<RelationshipCurrentRecord[]>;
  deleteLegacyAssetLink(scope: RelationshipScope, sourceReference: string): Promise<void>;
  appendEvent(event: RelationshipEventRecord): Promise<RelationshipEventRecord>;
  enqueueOutbox(record: RelationshipOutboxRecord): Promise<RelationshipOutboxRecord>;
}

type PrismaTransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
type PrismaRepositoryClient = PrismaClient | PrismaTransactionClient;

export class PrismaRelationshipRepository implements RelationshipCommandRepository {
  constructor(private readonly client: PrismaRepositoryClient) {}

  async transaction<T>(operation: (repository: RelationshipCommandRepository) => Promise<T>): Promise<T> {
    if ("$transaction" in this.client) {
      return this.client.$transaction(async (transaction) => operation(new PrismaRelationshipRepository(transaction)));
    }
    return operation(this);
  }

  async lockScope(scope: RelationshipScope): Promise<void> {
    await this.client.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      graphLockKey(scope)
    );
  }

  async findEvent(scope: RelationshipScope, idempotencyKey: string): Promise<RelationshipEventRecord | undefined> {
    const event = await this.client.relationshipEvent.findUnique({
      where: {
        enterpriseId_applicationServiceId_scopePath_idempotencyKey: {
          ...scope,
          idempotencyKey
        }
      }
    });
    return event ? eventRecord(event) : undefined;
  }

  async reserveNextGraphVersion(scope: RelationshipScope): Promise<bigint> {
    const latest = await this.client.relationshipEvent.aggregate({
      where: scope,
      _max: { graphVersion: true }
    });
    return (latest._max.graphVersion ?? 0n) + 1n;
  }

  async currentGraphVersion(scope: RelationshipScope): Promise<bigint> {
    const latest = await this.client.relationshipEvent.aggregate({
      where: scope,
      _max: { graphVersion: true }
    });
    return latest._max.graphVersion ?? 0n;
  }

  async findNode(scope: RelationshipScope, identity: Pick<RelationshipNodeRecord, "nodeType" | "logicalId">): Promise<RelationshipNodeRecord | undefined> {
    const node = await this.client.assetNode.findUnique({
      where: {
        enterpriseId_applicationServiceId_scopePath_nodeType_logicalId: {
          enterpriseId: scope.enterpriseId,
          applicationServiceId: scope.applicationServiceId,
          scopePath: scope.scopePath,
          nodeType: identity.nodeType,
          logicalId: identity.logicalId
        }
      }
    });
    return node ? nodeRecord(node) : undefined;
  }

  async upsertNode(scope: RelationshipScope, node: RelationshipNodeInput): Promise<RelationshipNodeRecord> {
    const existing = await this.findNode(scope, node);
    const parentNodeId = node.parentNodeId ?? null;
    const data = {
      rootAssetType: node.rootAssetType,
      rootAssetId: node.rootAssetId,
      parentNodeId,
      nodePath: node.nodePath ?? `${node.nodeType}/${node.logicalId}`,
      displayName: node.displayName ?? node.logicalId,
      metadata: toInputJson(node.metadata ?? {}),
      lifecycleStatus: "ACTIVE"
    };
    const persisted = existing
      ? await this.client.assetNode.update({
        where: { dbId: existing.dbId },
        data: { ...data, version: { increment: 1 } }
      })
      : await this.client.assetNode.create({
        data: { ...scope, nodeType: node.nodeType, logicalId: node.logicalId, ...data, version: 1n }
      });
    return nodeRecord(persisted);
  }

  async findCurrent(scope: RelationshipScope, identity: Pick<RelationshipCurrentRecord, "sourceNodeId" | "targetNodeId" | "relationType" | "source" | "sourceReference">): Promise<RelationshipCurrentRecord | undefined> {
    const relationship = await this.client.relationshipCurrent.findUnique({
      where: {
        enterpriseId_applicationServiceId_scopePath_sourceNodeId_targetNodeId_relationType_source_sourceReference: {
          ...scope,
          ...identity
        }
      }
    });
    return relationship ? currentRecord(relationship) : undefined;
  }

  async writeCurrent(scope: RelationshipScope, input: Omit<RelationshipCurrentRecord, "dbId" | "version" | keyof RelationshipScope>, version: bigint): Promise<RelationshipCurrentRecord> {
    const identity = {
      sourceNodeId: input.sourceNodeId,
      targetNodeId: input.targetNodeId,
      relationType: input.relationType,
      source: input.source,
      sourceReference: input.sourceReference
    };
    const data = {
      strength: input.strength,
      confidence: input.confidence,
      lifecycleStatus: input.lifecycleStatus,
      validTo: input.validTo ?? null,
      metadata: toInputJson(input.metadata),
      version
    };
    const relationship = await this.client.relationshipCurrent.upsert({
      where: {
        enterpriseId_applicationServiceId_scopePath_sourceNodeId_targetNodeId_relationType_source_sourceReference: {
          ...scope,
          ...identity
        }
      },
      create: { ...scope, ...identity, ...data },
      update: data
    });
    return currentRecord(relationship);
  }

  async listParserRelationships(scope: RelationshipScope, rootAssetType: AssetType, rootAssetId: string): Promise<RelationshipCurrentRecord[]> {
    const relationships = await this.client.relationshipCurrent.findMany({
      where: {
        ...scope,
        source: "asset-parser",
        sourceNode: { rootAssetType, rootAssetId }
      }
    });
    return relationships.map(currentRecord);
  }

  async deleteLegacyAssetLink(scope: RelationshipScope, sourceReference: string): Promise<void> {
    const prefix = "legacy-asset-link:";
    if (!sourceReference.startsWith(prefix)) return;
    await this.client.assetLink.deleteMany({
      where: { ...scopeWithoutEnterprise(scope), id: sourceReference.slice(prefix.length) }
    });
  }

  async appendEvent(event: RelationshipEventRecord): Promise<RelationshipEventRecord> {
    const { dbId: _dbId, ...data } = event;
    const persisted = await this.client.relationshipEvent.create({
      data: {
        ...data,
        priorVersion: data.priorVersion ?? null,
        relationshipId: data.relationshipId ?? null,
        assetNodeId: data.assetNodeId ?? null,
        snapshot: toInputJson(data.snapshot)
      }
    });
    return eventRecord(persisted);
  }

  async enqueueOutbox(record: RelationshipOutboxRecord): Promise<RelationshipOutboxRecord> {
    const { dbId: _dbId, ...data } = record;
    const persisted = await this.client.relationshipOutbox.create({
      data: { ...data, payload: toInputJson(data.payload) }
    });
    return outboxRecord(persisted);
  }
}

function graphLockKey(scope: RelationshipScope): string {
  return `${scope.enterpriseId}:${scope.applicationServiceId}:${scope.scopePath}`;
}

function scopeWithoutEnterprise(scope: RelationshipScope) {
  return { applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath };
}

function toInputJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function nodeRecord(node: Awaited<ReturnType<PrismaClient["assetNode"]["findUnique"]>> extends infer T ? NonNullable<T> : never): RelationshipNodeRecord {
  return {
    ...node,
    nodeType: node.nodeType as AssetNodeType,
    rootAssetType: node.rootAssetType as AssetType,
    metadata: node.metadata as Record<string, unknown>
  };
}

function currentRecord(relationship: Awaited<ReturnType<PrismaClient["relationshipCurrent"]["findUnique"]>> extends infer T ? NonNullable<T> : never): RelationshipCurrentRecord {
  return {
    ...relationship,
    strength: relationship.strength as RelationshipStrength,
    metadata: relationship.metadata as Record<string, unknown>
  };
}

function eventRecord(event: Awaited<ReturnType<PrismaClient["relationshipEvent"]["findUnique"]>> extends infer T ? NonNullable<T> : never): RelationshipEventRecord {
  return { ...event, snapshot: event.snapshot as Record<string, unknown> };
}

function outboxRecord(record: Awaited<ReturnType<PrismaClient["relationshipOutbox"]["findUnique"]>> extends infer T ? NonNullable<T> : never): RelationshipOutboxRecord {
  return { ...record, payload: record.payload as Record<string, unknown> };
}
