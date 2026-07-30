import { describe, expect, it, vi } from "vitest";
import { PrismaProjectionRepository } from "./repository.js";
import type { ClaimedProjection } from "./projector.js";

const scope = {
  enterpriseId: "enterprise-1",
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

describe("PrismaProjectionRepository projection payload", () => {
  it("maps the current asset-node outbox envelope", async () => {
    const repository = new PrismaProjectionRepository({} as never);

    await expect(repository.projectionPayload(event({
      eventType: "ASSET_NODE_UPSERT",
      payload: {
        eventId: "event-1",
        action: "NODE_UPSERT",
        subject: {
          assetNodeId: "node-1",
          nodeType: "api",
          logicalId: "api-1",
          rootAssetType: "apiContract",
          rootAssetId: "api-1",
          version: "3",
          lifecycleStatus: "ACTIVE",
          metadata: {}
        }
      }
    }))).resolves.toEqual({
      nodes: [{
        nodeType: "api",
        logicalId: "api-1",
        rootAssetType: "apiContract",
        rootAssetId: "api-1"
      }],
      edges: []
    });
  });

  it("hydrates the current relationship outbox envelope within exact scope", async () => {
    const findMany = vi.fn(async () => [
      assetNode("source-node", "api", "api-1"),
      assetNode("target-node", "dataModel", "model-1")
    ]);
    const repository = new PrismaProjectionRepository({
      assetNode: { findMany }
    } as never);

    await expect(repository.projectionPayload(event({
      eventType: "RELATIONSHIP_UPSERT",
      payload: {
        eventId: "event-1",
        action: "UPSERT",
        subject: {
          relationshipId: "relationship-1",
          sourceNodeId: "source-node",
          targetNodeId: "target-node",
          relationType: "API_USES_MODEL",
          strength: "STRONG",
          confidence: 0.9,
          version: "5",
          lifecycleStatus: "ACTIVE"
        }
      }
    }))).resolves.toEqual({
      nodes: [
        {
          nodeType: "api",
          logicalId: "api-1",
          rootAssetType: "api",
          rootAssetId: "api-1"
        },
        {
          nodeType: "dataModel",
          logicalId: "model-1",
          rootAssetType: "dataModel",
          rootAssetId: "model-1"
        }
      ],
      edges: [{
        id: "relationship-1",
        code: "API_USES_MODEL",
        source: {
          nodeType: "api",
          logicalId: "api-1",
          rootAssetType: "api",
          rootAssetId: "api-1"
        },
        target: {
          nodeType: "dataModel",
          logicalId: "model-1",
          rootAssetType: "dataModel",
          rootAssetId: "model-1"
        },
        strength: "STRONG",
        confidence: 0.9,
        version: "5"
      }]
    });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        ...scope,
        dbId: { in: ["source-node", "target-node"] }
      }
    }));
  });
});

function event(overrides: Partial<ClaimedProjection>): ClaimedProjection {
  return {
    id: "outbox-1",
    ...scope,
    relationshipEventId: "event-1",
    graphVersion: 8n,
    eventType: "GRAPH_PROJECTION",
    payload: {},
    idempotencyKey: "relationship-command:outbox-1",
    status: "PENDING",
    attemptCount: 0,
    ...overrides
  };
}

function assetNode(dbId: string, nodeType: string, logicalId: string) {
  return {
    dbId,
    nodeType,
    logicalId,
    rootAssetType: nodeType,
    rootAssetId: logicalId,
    parent: null
  };
}
