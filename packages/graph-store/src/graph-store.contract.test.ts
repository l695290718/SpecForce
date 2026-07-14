import { describe, expect, it } from "vitest";
import type {
  AssetNodeIdentity,
  GraphRelationship,
  GraphStore,
  GraphTraversalPlan,
  RelationshipCode
} from "@specforge/core";
import { InMemoryGraphStore } from "./index";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "enterprise/huawei/domain/celon/application-service/designer"
};

const siblingScope = {
  applicationServiceId: "com.huawei.celon.runtime",
  scopePath: "enterprise/huawei/domain/celon/application-service/runtime"
};

function node(logicalId: string, nodeType: AssetNodeIdentity["nodeType"] = "dataModel"): AssetNodeIdentity {
  return { ...scope, nodeType, logicalId, rootAssetType: "dataModel", rootAssetId: logicalId };
}

function siblingNode(logicalId: string): AssetNodeIdentity {
  return { ...siblingScope, nodeType: "dataModel", logicalId, rootAssetType: "dataModel", rootAssetId: logicalId };
}

const api = node("customer-api", "api");
const entity = node("customer-entity", "dataEntity");
const event = node("customer-event", "event");
const sibling = siblingNode("runtime-model");

function edge(id: string, code: RelationshipCode, source: AssetNodeIdentity, target: AssetNodeIdentity): GraphRelationship {
  return { id, code, source, target, strength: "strong", confidence: 1, version: 7n };
}

const graph = {
  nodes: [event, sibling, entity, api],
  edges: [
    edge("2", "CARRIES", entity, event),
    edge("1", "READS", api, entity),
    edge("3", "REFERENCES", event, api),
    edge("4", "READS", api, sibling)
  ],
  graphVersion: 7n
};

function plan(overrides: Partial<GraphTraversalPlan> = {}): GraphTraversalPlan {
  return {
    startNodes: [api],
    authorizedScope: scope,
    relationRules: [
      { code: "READS", forwardPropagation: true },
      { code: "CARRIES", forwardPropagation: true },
      { code: "REFERENCES", forwardPropagation: true }
    ],
    maxDepth: 4,
    maxNodes: 20,
    maxPaths: 20,
    timeoutMs: 60_000,
    ...overrides
  };
}

export interface GraphStoreTestOptions {
  now?: () => number;
}

export type StoreFactory = (options?: GraphStoreTestOptions) => Promise<GraphStore>;

export function graphStoreContractSuite(name: string, createStore: StoreFactory) {
  describe(name, () => {
    it("traverses allowed directions through a cycle without repeating nodes", async () => {
      const result = await (await createStore()).traverse(plan());

      expect(result.status).toBe("COMPLETE");
      expect(result.nodes.map((item) => item.logicalId)).toEqual(["customer-api", "customer-entity", "customer-event"]);
      expect(result.edges.map((item) => item.code)).toEqual(["READS", "CARRIES"]);
      expect(result.paths.map((path) => path.nodes.map((item) => item.logicalId))).toEqual([
        ["customer-api"],
        ["customer-api", "customer-entity"],
        ["customer-api", "customer-entity", "customer-event"]
      ]);
      expect(result.paths.every((path) => new Set(path.nodes.map((item) => item.logicalId)).size === path.nodes.length)).toBe(true);
    });

    it("applies relation direction filters", async () => {
      const result = await (await createStore()).traverse(plan({ relationRules: [{ code: "READS", reversePropagation: true }] }));

      expect(result.status).toBe("COMPLETE");
      expect(result.nodes.map((item) => item.logicalId)).toEqual(["customer-api"]);
      expect(result.edges).toEqual([]);
    });

    it("never returns nodes or edges outside the one authorized Scope", async () => {
      const result = await (await createStore()).traverse(plan());

      expect(result.nodes.every((item) => item.applicationServiceId === scope.applicationServiceId && item.scopePath === scope.scopePath)).toBe(true);
      expect(result.edges.every((item) => item.source.applicationServiceId === scope.applicationServiceId && item.target.applicationServiceId === scope.applicationServiceId)).toBe(true);
    });

    it("returns deterministic partial result and frontier when the depth budget is exhausted", async () => {
      const result = await (await createStore()).traverse(plan({ maxDepth: 1 }));

      expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_DEPTH"] });
      expect(result.frontier.map((item) => item.logicalId)).toEqual(["customer-entity"]);
      expect(result.nodes.map((item) => item.logicalId)).toEqual(["customer-api", "customer-entity"]);
    });

    it("returns deterministic partial result and frontier when the node budget is exhausted", async () => {
      const result = await (await createStore()).traverse(plan({ maxNodes: 2 }));

      expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_NODES"] });
      expect(result.frontier.map((item) => item.logicalId)).toEqual(["customer-entity"]);
      expect(result.nodes.map((item) => item.logicalId)).toEqual(["customer-api", "customer-entity"]);
    });

    it("enforces the node budget across multiple start nodes", async () => {
      const result = await (await createStore()).traverse(plan({ startNodes: [api, entity], maxNodes: 1 }));

      expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_NODES"] });
      expect(result.nodes.map((item) => item.logicalId)).toEqual(["customer-api"]);
      expect(result.frontier.map((item) => item.logicalId)).toEqual(["customer-entity"]);
    });

    it("returns deterministic partial result and frontier when the path budget is exhausted", async () => {
      const result = await (await createStore()).traverse(plan({ maxPaths: 2 }));

      expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_PATHS"] });
      expect(result.frontier.map((item) => item.logicalId)).toEqual(["customer-entity"]);
      expect(result.paths).toHaveLength(2);
    });

    it("returns a timeout partial result with an unexplored frontier", async () => {
      const result = await (await createStore({ now: tickingClock() })).traverse(plan({ timeoutMs: 1 }));

      expect(result.status).toBe("PARTIAL");
      expect(result.truncationReasons).toContain("TIMEOUT");
      expect(result.frontier.length).toBeGreaterThan(0);
    });
  });
}

function tickingClock(): () => number {
  let value = 0;
  return () => {
    value += 2;
    return value;
  };
}

graphStoreContractSuite("InMemoryGraphStore", async (options) => new InMemoryGraphStore(graph, options));

export { graph, plan, scope, siblingScope };
