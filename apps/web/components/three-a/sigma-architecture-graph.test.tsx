import { describe, expect, it, vi } from "vitest";
import { createArchitectureGraphStore, oneHopNeighborhood, type GraphStoreIdentity } from "./architecture-graph-store";
import { applyLayoutPositions, createEdgeVisualState, createLayoutRequest, createNodeVisualState, createSigmaArchitectureGraphController, createSigmaSettings, drawArchitectureNodeHover, focusSelectedNode } from "./sigma-architecture-graph";

const identity: GraphStoreIdentity = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner", baselineId: "baseline-1", projectionManifestId: "projection-1" };

describe("SigmaArchitectureGraph adapters", () => {
  it("keeps layout requests bounded, deterministic, and motion-aware", () => { const store = createArchitectureGraphStore(identity); store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 1, y: 2 }); const first = createLayoutRequest(store, "overview", "force", true); expect(first).toEqual(createLayoutRequest(store, "impact", "force", true)); expect(first.layout).toBe("force"); expect(first.reducedMotion).toBe(true); expect(first.maxRuntimeMs).toBe(1_500); });
  it.each(["force", "tree", "circles"] as const)("passes the independent %s layout mode to the worker", (layoutMode) => { const store = createArchitectureGraphStore(identity); const request = createLayoutRequest(store, "overview", layoutMode, false); expect(request.layout).toBe(layoutMode); });
  it("applies worker positions without changing loaded graph identity", () => { const store = createArchitectureGraphStore(identity); store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 0, y: 0 }); applyLayoutPositions(store, [{ id: "fact:one", x: 42, y: -7 }]); expect(store.graph.getNodeAttributes("fact:one")).toMatchObject({ x: 42, y: -7 }); expect(store.identity).toEqual(identity); });
  it("uses a finite camera transition unless reduced motion is active", () => { const store = createArchitectureGraphStore(identity); store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 12, y: 20 }); const animate = vi.fn(); const setState = vi.fn(); const sigma = { getCamera: () => ({ animate, setState }), getNodeDisplayData: vi.fn() } as never; focusSelectedNode(sigma, store, "fact:one", false); expect(animate).toHaveBeenCalledWith({ x: 12, y: 20, ratio: 0.72 }, { duration: 180 }); focusSelectedNode(sigma, store, "fact:one", true); expect(setState).toHaveBeenCalledWith({ x: 12, y: 20, ratio: 0.72 }); });
  it("preserves Graphology coordinates and edge attributes in Sigma reducers", () => {
    const store = createArchitectureGraphStore(identity);
    const node = { stableId: "fact:one", kind: "fact" as const, label: "one", layer: "SYS" as const, memberCount: 1, degree: 1, criticality: 0, x: 12, y: -4 };
    store.graph.addNode("fact:one", node);
    store.graph.addNode("fact:two", { ...node, stableId: "fact:two", label: "two", x: 20, y: 8 });
    store.graph.addDirectedEdgeWithKey("relationship:one", "fact:one", "fact:two", { stableId: "relationship:one", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 });
    const settings = createSigmaSettings(store, { current: undefined }, { current: undefined }, { current: undefined });
    expect(settings.nodeReducer("fact:one", node)).toMatchObject({ x: 12, y: -4, kind: "fact", label: null });
    expect(settings.nodeReducer("fact:one", node).label).toBeNull();
    expect(settings.edgeReducer("relationship:one", store.graph.getEdgeAttributes("relationship:one"))).toMatchObject({ stableId: "relationship:one", relationCode: "CALLS" });
  });

  it("emphasizes the selected neighborhood and keeps edges visible while layout runs", () => {
    const store = createArchitectureGraphStore(identity);
    const node = { stableId: "fact:one", kind: "fact" as const, label: "one", layer: "SYS" as const, memberCount: 1, degree: 1, criticality: 0, x: 12, y: -4 };
    store.graph.addNode("fact:one", node);
    store.graph.addNode("fact:two", { ...node, stableId: "fact:two", label: "two", x: 20, y: 8 });
    store.graph.addNode("fact:three", { ...node, stableId: "fact:three", label: "three", x: 30, y: 18 });
    store.graph.addDirectedEdgeWithKey("relationship:one", "fact:one", "fact:two", { stableId: "relationship:one", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 });
    store.graph.addDirectedEdgeWithKey("relationship:two", "fact:two", "fact:three", { stableId: "relationship:two", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 });

    const settings = createSigmaSettings(store, { current: "fact:one" }, { current: undefined }, { current: undefined }, { current: false });
    const selected = settings.nodeReducer("fact:one", node);
    const connected = settings.nodeReducer("fact:two", store.graph.getNodeAttributes("fact:two"));
    const unrelated = settings.nodeReducer("fact:three", store.graph.getNodeAttributes("fact:three"));
    expect(selected.size).toBeGreaterThan(connected.size);
    expect(unrelated.color).toBe("rgba(100,116,139,0.24)");
    expect(settings.edgeReducer("relationship:one", store.graph.getEdgeAttributes("relationship:one")).size).toBeGreaterThan(settings.edgeReducer("relationship:two", store.graph.getEdgeAttributes("relationship:two")).size);

    const movingSettings = createSigmaSettings(store, { current: undefined }, { current: undefined }, { current: undefined }, { current: true });
    const stillSettings = createSigmaSettings(store, { current: undefined }, { current: undefined }, { current: undefined }, { current: false });
    const movingEdge = movingSettings.edgeReducer("relationship:one", store.graph.getEdgeAttributes("relationship:one"));
    const stillEdge = stillSettings.edgeReducer("relationship:one", store.graph.getEdgeAttributes("relationship:one"));
    expect(movingEdge.hidden).toBe(false);
    expect(stillEdge.hidden).toBe(false);
    expect(movingEdge.opacity).toBeLessThan(stillEdge.opacity);
  });

  it("derives one-hop visual states without replacing the Graphology graph", () => {
    const store = createArchitectureGraphStore(identity);
    const graph = store.graph;
    const node = { stableId: "fact:one", kind: "fact" as const, label: "one", layer: "SYS" as const, memberCount: 1, degree: 1, criticality: 0, x: 12, y: -4, size: 10 };
    graph.addNode("fact:one", node);
    graph.addNode("fact:two", { ...node, stableId: "fact:two", label: "two", x: 20, y: 8 });
    graph.addNode("fact:three", { ...node, stableId: "fact:three", label: "three", x: 30, y: 18 });
    graph.addDirectedEdgeWithKey("relationship:one", "fact:one", "fact:two", { stableId: "relationship:one", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 });

    expect(oneHopNeighborhood(graph, "fact:one")).toEqual(new Set(["fact:one", "fact:two"]));
    store.select("fact:one");
    expect(store.graph).toBe(graph);
    expect(graph.getNodeAttributes("fact:two").highlighted).toBe(true);
    expect(graph.getNodeAttributes("fact:three").dimmed).toBe(true);
    store.select(undefined);
    expect(graph.getNodeAttributes("fact:two")).toMatchObject({ highlighted: false, dimmed: false, opacity: 1 });
    expect(graph.getNodeAttributes("fact:three")).toMatchObject({ highlighted: false, dimmed: false, opacity: 1 });
  });

  it("keeps selected, neighbor, and unrelated visual states distinguishable", () => {
    const node = { stableId: "fact:one", kind: "fact" as const, label: "one", layer: "SYS" as const, memberCount: 1, degree: 1, criticality: 0, x: 12, y: -4, size: 10 };
    const state = { selectedId: "fact:one", neighborhoodIds: new Set(["fact:one", "fact:two"]) };
    const selected = createNodeVisualState("fact:one", node, state);
    const neighbor = createNodeVisualState("fact:two", { ...node, stableId: "fact:two" }, state);
    const unrelated = createNodeVisualState("fact:three", { ...node, stableId: "fact:three" }, state);
    expect(selected.zIndex).toBe(3);
    expect(selected.forceLabel).toBe(true);
    expect(neighbor.size).toBeGreaterThan(node.size);
    expect(unrelated.opacity).toBeLessThan(0.5);
    expect(unrelated.size).toBeLessThan(node.size);

    const connectedEdge = { source: "fact:one", target: "fact:two", attributes: { stableId: "edge:connected", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 } };
    const unrelatedEdge = { source: "fact:three", target: "fact:four", attributes: { stableId: "edge:unrelated", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 } };
    expect(createEdgeVisualState(connectedEdge, { selectedId: "fact:one" }).size).toBeGreaterThan(createEdgeVisualState(unrelatedEdge, { selectedId: "fact:one" }).size);
  });

  it("draws a dark hover label and color-matched halo", () => {
    const context = {
      save: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn(() => ({ width: 40 })),
      rect: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    drawArchitectureNodeHover(context, { x: 10, y: 20, size: 8, label: "orders.api", color: "#356ea8" }, { labelSize: 11, labelFont: "sans-serif", labelWeight: "500" });
    expect(context.arc).toHaveBeenCalledWith(10, 20, 12, 0, Math.PI * 2);
    expect(context.fillText).toHaveBeenCalledWith("orders.api", 10, expect.any(Number));
    expect(context.restore).toHaveBeenCalledTimes(1);
  });

  it("registers the curved edge program when available and keeps a safe test fallback", () => {
    const store = createArchitectureGraphStore(identity);
    const edgeCurveProgram = vi.fn() as never;
    const settings = createSigmaSettings(store, { current: undefined }, { current: undefined }, { current: undefined }, { current: false }, { current: undefined }, { current: undefined }, edgeCurveProgram);
    expect(settings.defaultEdgeType).toBe("curved");
    expect(settings.edgeProgramClasses.curved).toBe(edgeCurveProgram);
    expect(createSigmaSettings(store, { current: undefined }, { current: undefined }, { current: undefined }).defaultEdgeType).toBe("line");
  });

  it("keeps controller layout actions live after a layout mode change", () => {
    const store = createArchitectureGraphStore(identity);
    const first = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const second = { start: vi.fn(), stop: vi.fn(), restart: vi.fn() };
    const layoutActions = { current: first };
    const controller = createSigmaArchitectureGraphController({
      sigma: { getCamera: () => ({}) } as never,
      store,
      selectedRef: { current: undefined },
      reducedMotion: true,
      lifecycleRef: { current: "settled" },
      layoutActions,
      clearSelection: vi.fn()
    });
    controller.startLayout();
    layoutActions.current = second;
    controller.restartLayout();
    expect(first.start).toHaveBeenCalledOnce();
    expect(second.restart).toHaveBeenCalledOnce();
  });
});
