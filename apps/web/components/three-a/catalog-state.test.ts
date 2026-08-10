import { describe, expect, it } from "vitest";
import { catalogReducer, catalogRequestKey, initialCatalogState, type CatalogPage, type ThreeAQueryIdentity } from "./catalog-state";
import type { KnowledgeProjectionNode } from "@specforge/core";

const identity: ThreeAQueryIdentity = { scope: "com.huawei.celon.desiner", baselineId: "b1", projectionManifestId: "p1" };
const node = (layer: "BIZ" | "SYS" | "TECH", assertionId: string) => ({ assertionId, layer, sortKey: `${layer}|${assertionId}`, semanticIdentity: assertionId, contentDigest: assertionId } as KnowledgeProjectionNode);
const initialPages = { BIZ: { nodes: [node("BIZ", "biz-1")] }, SYS: { nodes: [node("SYS", "sys-1")] }, TECH: { nodes: [node("TECH", "tech-1")] } };
const page = (nodes: KnowledgeProjectionNode[], nextCursor?: string): CatalogPage => ({ nodes, ...(nextCursor ? { nextCursor } : {}) });

describe("catalogReducer", () => {
  it("appends only the requested layer page", () => {
    const before = initialCatalogState(initialPages, identity);
    const after = catalogReducer(before, { type: "pageLoaded", layer: "TECH", requestKey: before.layers.TECH.requestKey, page: page([node("TECH", "tech-2")], "next-tech") });
    expect(after.layers.BIZ.nodes).toEqual(before.layers.BIZ.nodes);
    expect(after.layers.SYS.nodes).toEqual(before.layers.SYS.nodes);
    expect(after.layers.TECH.nodes.map((item) => item.assertionId)).toEqual(["tech-1", "tech-2"]);
    expect(after.layers.TECH.nextCursor).toBe("next-tech");
  });

  it("ignores a stale search response", () => {
    const searching = catalogReducer(initialCatalogState(initialPages, identity), { type: "queryChanged", query: "orders", requestKey: "scope:b1:p1:orders" });
    const after = catalogReducer(searching, { type: "pageLoaded", layer: "BIZ", requestKey: catalogRequestKey(identity, "old"), page: page([node("BIZ", "old")]) });
    expect(after.layers.BIZ.nodes).toEqual([]);
  });

  it("resets all layers when Scope Baseline or Projection identity changes", () => {
    const nextIdentity = { ...identity, baselineId: "b2" };
    const after = catalogReducer(initialCatalogState(initialPages, identity), { type: "identityChanged", identity: nextIdentity, requestKey: catalogRequestKey(nextIdentity, "") });
    expect(after.query).toBe("");
    expect(after.layers.BIZ.nodes).toEqual([]);
    expect(after.layers.SYS.nodes).toEqual([]);
    expect(after.layers.TECH.nodes).toEqual([]);
  });
});
