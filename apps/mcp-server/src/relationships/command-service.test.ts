import { defaultHuaweiActor, scopeById, type ArchitectureScopeRef, type AssetNodeIdentity, type AssetNodeType, type AssetType, type DataModel } from "@specforge/core";
import { describe, expect, it } from "vitest";
import {
  RelationshipCommandService,
  type RelationshipCommandRepository,
  type RelationshipCurrentRecord,
  type RelationshipEventRecord,
  type RelationshipNodeInput,
  type RelationshipNodeRecord,
  type RelationshipOutboxRecord,
  type RelationshipScope
} from "./command-service";

const applicationService = scopeById("com.huawei.celon.desiner")!;
const scope: RelationshipScope = {
  enterpriseId: "enterprise-test",
  applicationServiceId: applicationService.id,
  scopePath: applicationService.scopePath
};
const authorizedScope: ArchitectureScopeRef = {
  applicationServiceId: scope.applicationServiceId,
  scopePath: scope.scopePath
};

describe("RelationshipCommandService", () => {
  it("replays a relationship receipt for the same idempotency key without duplicate ledger rows", async () => {
    const repository = new InMemoryRelationshipRepository();
    const service = new RelationshipCommandService(repository);
    await seedEndpoints(repository);

    const first = await service.upsertRelationship(validRelationshipCommand());
    const replay = await service.upsertRelationship(validRelationshipCommand());

    expect(replay).toMatchObject({ ...first, replayed: true });
    expect(repository.currentRows()).toHaveLength(1);
    expect(repository.events).toHaveLength(1);
    expect(repository.outbox).toHaveLength(1);
    expect(first.graphVersion).toBe(1n);
  });

  it("requires exact writable Scope and rejects cross-Scope endpoints before persistence", async () => {
    const repository = new InMemoryRelationshipRepository();
    const service = new RelationshipCommandService(repository);
    await seedEndpoints(repository);

    await expect(service.upsertRelationship({
      ...validRelationshipCommand(),
      authorizedScope: { ...authorizedScope, scopePath: `${authorizedScope.scopePath}/mismatch` }
    })).rejects.toThrow("SCOPE_MISMATCH");

    await expect(service.upsertRelationship({
      ...validRelationshipCommand(),
      target: {
        identity: {
          ...nodeIdentity("event", "foreign-event"),
          applicationServiceId: "com.huawei.celon.runtime",
          scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-runtime/com.huawei.celon.runtime"
        }
      }
    })).rejects.toThrow("SCOPE_MISMATCH");

    expect(repository.currentRows()).toHaveLength(0);
  });

  it("rejects an ontology-invalid endpoint pair before writes", async () => {
    const repository = new InMemoryRelationshipRepository();
    const service = new RelationshipCommandService(repository);
    await seedEndpoints(repository);

    await expect(service.upsertRelationship({
      ...validRelationshipCommand(),
      relationType: "CARRIES"
    })).rejects.toThrow("RELATIONSHIP_ENDPOINT_INVALID");

    expect(repository.currentRows()).toHaveLength(0);
  });

  it("assigns one incremented Scope graph version to every effective parser reconciliation event", async () => {
    const repository = new InMemoryRelationshipRepository();
    const service = new RelationshipCommandService(repository);
    const asset = dataModelAsset();

    const receipt = await service.upsertAssetGraph({
      enterpriseId: scope.enterpriseId,
      authorizedScope,
      actor: defaultHuaweiActor,
      channel: "mcp",
      correlationId: "asset-graph-1",
      idempotencyKey: "asset-graph-1",
      assetType: "dataModel",
      asset
    });

    expect(receipt.graphVersion).toBe(1n);
    expect(repository.events).toHaveLength(2);
    expect(repository.events.map((event) => event.graphVersion)).toEqual([1n, 1n]);
    expect(repository.outbox).toHaveLength(2);
  });

  it("invalidates obsolete parser relationships while preserving manual relationships", async () => {
    const repository = new InMemoryRelationshipRepository();
    const service = new RelationshipCommandService(repository);
    const asset = dataModelAsset();
    await service.upsertAssetGraph(assetGraphCommand(asset));

    const root = await repository.findNode(scope, nodeIdentity("dataModel", asset.id));
    const manualTarget = await repository.upsertNode(scope, nodeIdentity("dataEntity", "manual-target"));
    await repository.writeCurrent(scope, {
      sourceNodeId: root!.dbId,
      targetNodeId: manualTarget.dbId,
      relationType: "CONTAINS",
      strength: "strong",
      confidence: 1,
      source: "manual",
      sourceReference: "manual:keep",
      lifecycleStatus: "ACTIVE",
      metadata: {}
    }, 1n);

    await service.upsertAssetGraph(assetGraphCommand({ ...asset, entities: [], fields: [] }, "asset-graph-2"));

    expect(repository.currentRows().filter((row) => row.source === "asset-parser" && row.lifecycleStatus === "INVALIDATED")).toHaveLength(2);
    expect(repository.currentRows().find((row) => row.source === "manual")).toMatchObject({ lifecycleStatus: "ACTIVE" });
  });

  it("rolls back current state, graph version, event, and outbox when a write fails after the current mutation", async () => {
    const repository = new InMemoryRelationshipRepository();
    const service = new RelationshipCommandService(repository);
    await seedEndpoints(repository);
    repository.failAfterCurrentWrite = true;

    await expect(service.upsertRelationship(validRelationshipCommand())).rejects.toThrow("FORCED_FAILURE");

    expect(repository.currentRows()).toHaveLength(0);
    expect(repository.events).toHaveLength(0);
    expect(repository.outbox).toHaveLength(0);
    expect(repository.graphVersion).toBe(0n);
  });
});

function validRelationshipCommand() {
  return {
    enterpriseId: scope.enterpriseId,
    authorizedScope,
    actor: defaultHuaweiActor,
    channel: "mcp",
    correlationId: "relationship-1",
    idempotencyKey: "relationship-1",
    source: { identity: nodeIdentity("api", "source-api"), expectedVersion: 1n },
    target: { identity: nodeIdentity("event", "target-event"), expectedVersion: 1n },
    relationType: "EMITS" as const,
    sourceReference: "mcp:relationship-1"
  };
}

function assetGraphCommand(asset: DataModel, idempotencyKey = "asset-graph-1") {
  return {
    enterpriseId: scope.enterpriseId,
    authorizedScope,
    actor: defaultHuaweiActor,
    channel: "mcp",
    correlationId: idempotencyKey,
    idempotencyKey,
    assetType: "dataModel" as const,
    asset
  };
}

function nodeIdentity(nodeType: AssetNodeType, logicalId: string): AssetNodeIdentity {
  return {
    applicationServiceId: scope.applicationServiceId,
    scopePath: scope.scopePath,
    nodeType,
    logicalId,
    rootAssetType: rootAssetType(nodeType),
    rootAssetId: nodeType === "dataEntity" ? "data-model" : logicalId
  };
}

function rootAssetType(nodeType: AssetNodeType): AssetType {
  if (nodeType === "dataEntity" || nodeType === "dataField") return "dataModel";
  if (nodeType === "apiOperation") return "api";
  if (nodeType === "applicationService") return "integration";
  return nodeType;
}

async function seedEndpoints(repository: InMemoryRelationshipRepository) {
  await repository.upsertNode(scope, nodeIdentity("api", "source-api"));
  await repository.upsertNode(scope, nodeIdentity("event", "target-event"));
}

function dataModelAsset(): DataModel {
  return {
    id: "data-model",
    name: "Customer model",
    description: "Customer records.",
    code: "customer",
    modelType: "logical",
    domainId: "customer-domain",
    tables: ["customer"],
    entities: ["Customer"],
    fields: [{ fieldName: "id", displayName: "ID", dataType: "uuid", nullable: false, owner: "Customer Team" }],
    relationships: [],
    constraints: [],
    dataClassification: "internal",
    lifecycle: "active",
    lineage: "source",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    architectureScope: authorizedScope
  };
}

class InMemoryRelationshipRepository implements RelationshipCommandRepository {
  nodes: RelationshipNodeRecord[] = [];
  current: RelationshipCurrentRecord[] = [];
  events: RelationshipEventRecord[] = [];
  outbox: RelationshipOutboxRecord[] = [];
  graphVersion = 0n;
  failAfterCurrentWrite = false;

  async transaction<T>(operation: (repository: RelationshipCommandRepository) => Promise<T>): Promise<T> {
    const snapshot = structuredClone({
      nodes: this.nodes,
      current: this.current,
      events: this.events,
      outbox: this.outbox,
      graphVersion: this.graphVersion
    });
    try {
      return await operation(this);
    } catch (error) {
      this.nodes = snapshot.nodes;
      this.current = snapshot.current;
      this.events = snapshot.events;
      this.outbox = snapshot.outbox;
      this.graphVersion = snapshot.graphVersion;
      throw error;
    }
  }

  async findEvent(scopeInput: RelationshipScope, idempotencyKey: string) {
    return this.events.find((event) => sameScope(event, scopeInput) && event.idempotencyKey === idempotencyKey);
  }

  async lockScope() {
    // The fake transaction already excludes concurrent writes for this test.
  }

  async reserveNextGraphVersion() {
    this.graphVersion += 1n;
    return this.graphVersion;
  }

  async currentGraphVersion() {
    return this.graphVersion;
  }

  async findNode(scopeInput: RelationshipScope, identity: Pick<RelationshipNodeRecord, "nodeType" | "logicalId">) {
    return this.nodes.find((node) => sameScope(node, scopeInput) && node.nodeType === identity.nodeType && node.logicalId === identity.logicalId);
  }

  async upsertNode(scopeInput: RelationshipScope, node: RelationshipNodeInput) {
    const existing = await this.findNode(scopeInput, node);
    if (existing) return existing;
    const created: RelationshipNodeRecord = {
      ...scopeInput,
      ...node,
      dbId: `node-${this.nodes.length + 1}`,
      nodePath: node.nodePath ?? `${node.nodeType}/${node.logicalId}`,
      displayName: node.displayName ?? node.logicalId,
      metadata: node.metadata ?? {},
      version: 1n,
      lifecycleStatus: "ACTIVE"
    };
    this.nodes.push(created);
    return created;
  }

  async findCurrent(scopeInput: RelationshipScope, identity: Pick<RelationshipCurrentRecord, "sourceNodeId" | "targetNodeId" | "relationType" | "source" | "sourceReference">) {
    return this.current.find((row) => sameScope(row, scopeInput) && row.sourceNodeId === identity.sourceNodeId && row.targetNodeId === identity.targetNodeId && row.relationType === identity.relationType && row.source === identity.source && row.sourceReference === identity.sourceReference);
  }

  async writeCurrent(scopeInput: RelationshipScope, input: Omit<RelationshipCurrentRecord, "dbId" | "version" | keyof RelationshipScope>, version: bigint) {
    const existing = await this.findCurrent(scopeInput, input);
    const row: RelationshipCurrentRecord = existing
      ? { ...existing, ...input, version }
      : { ...scopeInput, ...input, dbId: `relationship-${this.current.length + 1}`, version };
    if (existing) this.current.splice(this.current.indexOf(existing), 1, row);
    else this.current.push(row);
    if (this.failAfterCurrentWrite) throw new Error("FORCED_FAILURE");
    return row;
  }

  async listParserRelationships(scopeInput: RelationshipScope, rootAssetType: string, rootAssetId: string) {
    const nodeIds = new Set(this.nodes.filter((node) => sameScope(node, scopeInput) && node.rootAssetType === rootAssetType && node.rootAssetId === rootAssetId).map((node) => node.dbId));
    return this.current.filter((row) => sameScope(row, scopeInput) && row.source === "asset-parser" && nodeIds.has(row.sourceNodeId));
  }

  async appendEvent(event: RelationshipEventRecord) {
    this.events.push(event);
    return event;
  }

  async enqueueOutbox(record: RelationshipOutboxRecord) {
    this.outbox.push(record);
    return record;
  }

  currentRows() {
    return this.current;
  }
}

function sameScope(row: RelationshipScope, expected: RelationshipScope): boolean {
  return row.enterpriseId === expected.enterpriseId && row.applicationServiceId === expected.applicationServiceId && row.scopePath === expected.scopePath;
}
