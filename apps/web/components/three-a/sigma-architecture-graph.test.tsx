import { describe, expect, it, vi } from "vitest";
import { createArchitectureGraphStore, type GraphStoreIdentity } from "./architecture-graph-store";
import { applyLayoutPositions, createLayoutRequest, createSigmaSettings, focusSelectedNode } from "./sigma-architecture-graph";

const identity: GraphStoreIdentity = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner", baselineId: "baseline-1", projectionManifestId: "projection-1" };

describe("SigmaArchitectureGraph adapters", () => {
  it("keeps layout requests bounded, deterministic, and motion-aware", () => { const store = createArchitectureGraphStore(identity); store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 1, y: 2 }); const first = createLayoutRequest(store, "overview", true); expect(first).toEqual(createLayoutRequest(store, "overview", true)); expect(first.reducedMotion).toBe(true); expect(first.maxRuntimeMs).toBe(1_500); });
  it("applies worker positions without changing loaded graph identity", () => { const store = createArchitectureGraphStore(identity); store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 0, y: 0 }); applyLayoutPositions(store, [{ id: "fact:one", x: 42, y: -7 }]); expect(store.graph.getNodeAttributes("fact:one")).toMatchObject({ x: 42, y: -7 }); expect(store.identity).toEqual(identity); });
  it("uses a finite camera transition unless reduced motion is active", () => { const store = createArchitectureGraphStore(identity); store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 12, y: 20 }); const animate = vi.fn(); const setState = vi.fn(); const sigma = { getCamera: () => ({ animate, setState }), getNodeDisplayData: vi.fn() } as never; focusSelectedNode(sigma, store, "fact:one", false); expect(animate).toHaveBeenCalledWith({ x: 12, y: 20, ratio: 0.72 }, { duration: 180 }); focusSelectedNode(sigma, store, "fact:one", true); expect(setState).toHaveBeenCalledWith({ x: 12, y: 20, ratio: 0.72 }); });
  it("preserves Graphology coordinates and edge attributes in Sigma reducers", () => {
    const store = createArchitectureGraphStore(identity);
    const node = { stableId: "fact:one", kind: "fact" as const, label: "one", layer: "SYS" as const, memberCount: 1, degree: 1, criticality: 0, x: 12, y: -4 };
    store.graph.addNode("fact:one", node);
    store.graph.addNode("fact:two", { ...node, stableId: "fact:two", label: "two", x: 20, y: 8 });
    store.graph.addDirectedEdgeWithKey("relationship:one", "fact:one", "fact:two", { stableId: "relationship:one", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 });
    const settings = createSigmaSettings(store, { current: undefined }, { current: undefined }, { current: undefined });
    expect(settings.nodeReducer("fact:one", node)).toMatchObject({ x: 12, y: -4, kind: "fact", label: "one" });
    expect(settings.edgeReducer("relationship:one", store.graph.getEdgeAttributes("relationship:one"))).toMatchObject({ stableId: "relationship:one", relationCode: "CALLS" });
  });
});
