import type { DataModel } from "@specforge/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const state = vi.hoisted(() => {
  const data = {
    assets: [] as Array<Record<string, any>>,
    nodes: [] as Array<Record<string, any>>,
    current: [] as Array<Record<string, any>>,
    events: [] as Array<Record<string, any>>,
    receipts: [] as Array<Record<string, any>>,
    revisions: [] as Array<Record<string, any>>
  };
  const transaction = {
    designAsset: {
      findUnique: vi.fn(async ({ where }: any) => data.assets.find((asset) => asset.applicationServiceId === where.applicationServiceId_scopePath_id.applicationServiceId && asset.scopePath === where.applicationServiceId_scopePath_id.scopePath && asset.id === where.applicationServiceId_scopePath_id.id) ?? null),
      upsert: vi.fn(async ({ create, update, where }: any) => {
        const key = where.applicationServiceId_scopePath_id;
        const existing = data.assets.find((asset) => asset.applicationServiceId === key.applicationServiceId && asset.scopePath === key.scopePath && asset.id === key.id);
        if (existing) Object.assign(existing, update);
        else data.assets.push({ ...create });
        return existing ?? data.assets.at(-1);
      }),
      delete: vi.fn(async ({ where }: any) => {
        const key = where.applicationServiceId_scopePath_id;
        const index = data.assets.findIndex((asset) => asset.applicationServiceId === key.applicationServiceId && asset.scopePath === key.scopePath && asset.id === key.id);
        if (index >= 0) return data.assets.splice(index, 1)[0];
        return null;
      })
    },
    assetNode: {
      findMany: vi.fn(async ({ where }: any) => data.nodes.filter((node) => (!where.rootAssetId || node.rootAssetId === where.rootAssetId) && (!where.logicalId || where.logicalId.in.includes(node.logicalId))))
    },
    relationshipCurrent: {
      findFirst: vi.fn(async ({ where }: any) => data.current.find((row) => row.targetNodeId && where.targetNodeId.in.includes(row.targetNodeId) && row.relationType === where.relationType && row.lifecycleStatus === where.lifecycleStatus) ?? null)
    },
    relationshipEvent: {
      findMany: vi.fn(async () => data.events)
    },
    authoredCatalogCursor: {
      findUnique: vi.fn(async () => ({ nextVersion: BigInt(data.revisions.length) }))
    },
    authoredAssetRevision: {
      findMany: vi.fn(async () => data.revisions)
    }
  };
  return { data, transaction };
});

vi.mock("../persistence", () => ({
  prisma: {
    $transaction: vi.fn(async (operation: (transaction: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(state.data);
      try {
        return await operation(state.transaction);
      } catch (error) {
        Object.assign(state.data, snapshot);
        throw error;
      }
    })
  },
  ensureMcpPersistenceSchema: vi.fn().mockResolvedValue(undefined),
  configuredRelationshipScope: vi.fn((input: typeof scope) => ({ enterpriseId: "enterprise-test", ...input })),
  resolveWritableScope: vi.fn((_actor: unknown, input: typeof scope) => input),
  writableActor: vi.fn(() => ({ actorType: "agent", actorId: "test-agent" })),
  relationshipService: vi.fn(() => ({
    upsertAssetGraph: vi.fn(async ({ asset }: { asset: DataModel }) => {
      const event = { dbId: `event-${state.data.events.length + 1}`, relationshipId: `relationship-${asset.id}`, graphVersion: BigInt(state.data.events.length + 1) };
      state.data.events.push(event);
      return { graphVersion: event.graphVersion, replayed: false };
    })
  }))
}));

vi.mock("../knowledge/catalog-revision", () => ({
  appendAuthoredAssetRevision: vi.fn(async (_transaction: unknown, input: Record<string, unknown>) => {
    state.data.revisions.push({ ...input, catalogVersion: BigInt(state.data.revisions.length + 1) });
    return { ...input, catalogVersion: BigInt(state.data.revisions.length), idempotent: false };
  })
}));

vi.mock("../relationships/repository", () => ({
  PrismaRelationshipRepository: class {
    async lockScope() {}
    async findReceipt(_scope: typeof scope, idempotencyKey: string) {
      return state.data.receipts.find((receipt) => receipt.idempotencyKey === idempotencyKey);
    }
    async createReceipt(inputScope: typeof scope, input: Record<string, unknown>) {
      const receipt = { dbId: `receipt-${state.data.receipts.length + 1}`, ...inputScope, ...input, status: "PENDING", result: {}, graphVersion: 0n, primaryEventId: null };
      state.data.receipts.push(receipt);
      return receipt;
    }
    async completeReceipt(_scope: typeof scope, receiptId: string, input: Record<string, unknown>) {
      const receipt = state.data.receipts.find((item) => item.dbId === receiptId)!;
      Object.assign(receipt, input);
      return receipt;
    }
  }
}));

vi.mock("../relationships/command-service", () => ({}));

const { applyDataModelChangeSet } = await import("./change-set");

describe("apply_data_model_change_set", () => {
  beforeEach(() => {
    state.data.assets.length = 0;
    state.data.nodes.length = 0;
    state.data.current.length = 0;
    state.data.events.length = 0;
    state.data.receipts.length = 0;
    state.data.revisions.length = 0;
  });

  it("rolls back a cross-Scope change before any authored or relationship state remains", async () => {
    const model = dataModel({ architectureScope: { applicationServiceId: "com.huawei.celon.other", scopePath: "other" } });

    await expect(applyDataModelChangeSet({ ...command(), models: [model] })).rejects.toThrow("SCOPE_MISMATCH");
    expect(state.data.assets).toHaveLength(0);
    expect(state.data.revisions).toHaveLength(0);
    expect(state.data.receipts).toHaveLength(0);
  });

  it("rejects removal of an entity with an active incoming reference", async () => {
    const previous = dataModel();
    state.data.assets.push({ id: previous.id, applicationServiceId: scope.applicationServiceId, scopePath: scope.scopePath, type: "dataModel", payload: JSON.stringify(previous) });
    state.data.nodes.push({ dbId: "entity-node", logicalId: "order-model.entity.customer", rootAssetId: previous.id });
    state.data.current.push({ dbId: "reference-1", targetNodeId: "entity-node", relationType: "REFERENCES", lifecycleStatus: "ACTIVE" });
    const next = dataModel({
      entityDefinitions: [{ id: "account", name: "Account", ordinal: 0 }],
      localizedContent: {
        zh: {
          name: "订单模型",
          description: "订单。",
          relationships: [],
          constraints: [],
          lifecycle: "有效",
          lineage: "订单服务",
          entities: { account: { displayName: "账户" } },
          fields: {}
        }
      }
    });

    await expect(applyDataModelChangeSet({ ...command(), models: [next] })).rejects.toThrow("ACTIVE_REFERENCE_EXISTS");
    expect(state.data.assets[0]?.payload).toBe(JSON.stringify(previous));
    expect(state.data.events).toHaveLength(0);
  });

  it("replays the same idempotency key without duplicate revisions or events", async () => {
    const first = await applyDataModelChangeSet({ ...command(), models: [dataModel()] });
    const replay = await applyDataModelChangeSet({ ...command(), models: [dataModel()] });

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ ...first, replayed: true });
    expect(state.data.revisions).toHaveLength(1);
    expect(state.data.events).toHaveLength(1);
    expect(state.data.receipts).toHaveLength(1);
  });

  it("fails closed for v1 mutation and reports ambiguous legacy ownership", async () => {
    await expect(applyDataModelChangeSet({ ...command(), models: [legacyModel()] })).rejects.toThrow("DATA_MODEL_UPGRADE_REQUIRED");
    await expect(applyDataModelChangeSet({ ...command(), idempotencyKey: "ambiguous", models: [legacyModel({ entities: ["Customer", "Profile"] })] })).rejects.toThrow("FIELD_OWNERSHIP_AMBIGUOUS");
  });
});

function command() {
  return { architectureScope: scope, idempotencyKey: "change-set-1", correlationId: "correlation-1" };
}

function dataModel(overrides: Partial<DataModel> = {}): DataModel {
  return {
    id: "order-model",
    name: "Order model",
    description: "Orders.",
    code: "ORDER_MODEL",
    modelType: "conceptual",
    domainId: "commerce",
    tables: [],
    entities: ["Customer"],
    fields: [],
    relationships: [],
    constraints: [],
    dataClassification: "internal",
    lifecycle: "active",
    lineage: "Orders service",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    architectureScope: scope,
    schemaVersion: 2,
    entityDefinitions: [{ id: "customer", name: "Customer", ordinal: 0 }],
    dataRelations: [],
    localizedContent: {
      zh: {
        name: "订单模型",
        description: "订单。",
        relationships: [],
        constraints: [],
        lifecycle: "有效",
        lineage: "订单服务",
        entities: { customer: { displayName: "客户" } },
        fields: {}
      }
    },
    ...overrides
  } as DataModel;
}

function legacyModel(overrides: Partial<DataModel> = {}): DataModel {
  return {
    ...dataModel({ schemaVersion: undefined, entityDefinitions: undefined, dataRelations: undefined }),
    fields: [{ fieldName: "email", displayName: "Email", dataType: "string", nullable: false, owner: "Customer Team" }],
    localizedContent: {
      zh: {
        name: "旧模型",
        description: "旧模型。",
        relationships: [],
        constraints: [],
        lifecycle: "有效",
        lineage: "旧服务",
        fields: { email: { displayName: "邮箱" } }
      }
    },
    ...overrides
  } as DataModel;
}
