import { describe, expect, it } from "vitest";
import { buildErPositionStorageKey, createErPositionStore, type ErPositionKey, type ErPositionStorage } from "./er-position-store";

function memoryStorage(): ErPositionStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
  };
}

const designerScope = "com.huawei.celon.desiner";
const designerPath = "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner";
const policyScope = "com.huawei.celon.policyhub";
const policyPath = "pf-huawei/product-celon/subproduct-platform/module-policyhub/com.huawei.celon.policyhub";

function keyFor(applicationServiceId: string, scopePath: string, rootModelId = "model-a", topologyDigest = "digest-a", mode = "MODEL"): ErPositionKey {
  return { applicationServiceId, scopePath, mode, rootModelId, topologyDigest, schemaVersion: 1 };
}

describe("ErPositionStore", () => {
  it("does not reuse positions between Scope, root model, or topology digest", () => {
    const store = createErPositionStore(memoryStorage());
    store.save(keyFor(designerScope, designerPath), { "entity:one": { x: 10, y: 20 } });

    expect(store.load(keyFor(policyScope, policyPath))).toEqual({});
    expect(store.load(keyFor(designerScope, designerPath, "model-b"))).toEqual({});
    expect(store.load(keyFor(designerScope, designerPath, "model-a", "digest-b"))).toEqual({});
    expect(store.load(keyFor(designerScope, designerPath))).toEqual({ "entity:one": { x: 10, y: 20 } });
  });

  it("includes every identity dimension in the exact storage key", () => {
    const key = keyFor(designerScope, designerPath);
    const storageKey = buildErPositionStorageKey(key);
    expect(storageKey).toContain(designerScope);
    expect(storageKey).toContain(designerPath);
    expect(storageKey).toContain("MODEL");
    expect(storageKey).toContain("model-a");
    expect(storageKey).toContain("digest-a");
    expect(storageKey).toContain('"schemaVersion":1');
  });

  it("filters unknown entities and invalid coordinates", () => {
    const storage = memoryStorage();
    const store = createErPositionStore(storage);
    const key = keyFor(designerScope, designerPath);
    store.save(key, {
      "entity:known": { x: 1, y: 2 },
      "entity:unknown": { x: 3, y: 4 },
      "entity:nan": { x: Number.NaN, y: 5 },
      "entity:infinity": { x: Number.POSITIVE_INFINITY, y: 6 }
    }, new Set(["entity:known", "entity:nan", "entity:infinity"]));
    expect(store.load(key, new Set(["entity:known", "entity:unknown", "entity:nan", "entity:infinity"]))).toEqual({ "entity:known": { x: 1, y: 2 } });
  });

  it("rejects malformed, stale, and schema-mismatched payloads", () => {
    const storage = memoryStorage();
    const store = createErPositionStore(storage);
    const key = keyFor(designerScope, designerPath);
    const storageKey = buildErPositionStorageKey(key);
    storage.values.set(storageKey, "{malformed");
    expect(store.load(key)).toEqual({});
    storage.values.set(storageKey, JSON.stringify({ schemaVersion: 99, architectureScope: { applicationServiceId: designerScope, scopePath: designerPath }, mode: "MODEL", rootModelId: "model-a", topologyDigest: "digest-a", positions: { "entity:one": { x: 1, y: 2 } } }));
    expect(store.load(key)).toEqual({});
    storage.values.set(storageKey, JSON.stringify({ schemaVersion: 1, architectureScope: { applicationServiceId: policyScope, scopePath: policyPath }, mode: "MODEL", rootModelId: "model-a", topologyDigest: "digest-a", positions: { "entity:one": { x: 1, y: 2 } } }));
    expect(store.load(key)).toEqual({});
  });

  it("clears only the exact Scope and topology entry", () => {
    const storage = memoryStorage();
    const store = createErPositionStore(storage);
    const current = keyFor(designerScope, designerPath);
    const other = keyFor(designerScope, designerPath, "model-b");
    store.save(current, { "entity:one": { x: 1, y: 2 } });
    store.save(other, { "entity:two": { x: 3, y: 4 } });
    store.clear(current);
    expect(store.load(current)).toEqual({});
    expect(store.load(other)).toEqual({ "entity:two": { x: 3, y: 4 } });
  });
});

