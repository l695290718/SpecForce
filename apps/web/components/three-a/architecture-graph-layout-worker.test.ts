import { describe, expect, it } from "vitest";
import { deterministicLayout, refineArchitectureGraphLayout, shouldTerminateLayout, type LayoutIdentity, type LayoutWorkerRequest } from "./architecture-graph-layout-worker";

const request: LayoutWorkerRequest = {
  type: "refine",
  layout: "explore",
  nodes: [
    { id: "b", x: 80, y: 10, degree: 2 },
    { id: "a", x: -80, y: -10, degree: 1 },
    { id: "c", x: 0, y: 60, degree: 1 }
  ],
  edges: [
    { source: "a", target: "b", weight: 1 },
    { source: "b", target: "c", weight: 0.5 }
  ],
  seed: 42,
  maxRuntimeMs: 1_500
};

const identity: LayoutIdentity = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope/path", baselineId: "baseline-1", projectionManifestId: "manifest-1" };

describe("architecture graph layout worker", () => {
  it("produces deterministic positions for shuffled input and a fixed seed", () => {
    const first = refineArchitectureGraphLayout(request, () => 0);
    const shuffled = refineArchitectureGraphLayout({ ...request, nodes: [...request.nodes].reverse(), edges: [...request.edges].reverse() }, () => 0);
    const repeated = refineArchitectureGraphLayout(request, () => 0);
    expect(first.type).toBe("complete");
    expect(shuffled).toEqual(first);
    expect(repeated).toEqual(first);
    expect(first.positions.map((position) => position.id)).toEqual(["a", "b", "c"]);
  });

  it("returns stable fallback positions on timeout and bypasses refinement for reduced motion", () => {
    const timeout = refineArchitectureGraphLayout({ ...request, maxRuntimeMs: 0 }, () => 0);
    const reduced = refineArchitectureGraphLayout({ ...request, reducedMotion: true }, () => 0);
    expect(timeout).toMatchObject({ type: "failed", reason: "TIMEOUT" });
    expect(timeout.positions).toEqual(deterministicLayout(request));
    expect(reduced.type).toBe("complete");
    expect(reduced.positions).toEqual(deterministicLayout(request));
  });

  it("expands unit-scale overview seeds into separated architecture-layer bands", () => {
    const collapsed: LayoutWorkerRequest = {
      ...request,
      layout: "overview",
      nodes: [
        ...Array.from({ length: 4 }, (_, index) => ({ id: `biz-${index}`, x: Math.cos(index), y: Math.sin(index), degree: 1, layer: "BIZ" as const })),
        ...Array.from({ length: 4 }, (_, index) => ({ id: `sys-${index}`, x: Math.cos(index), y: Math.sin(index), degree: 1, layer: "SYS" as const })),
        ...Array.from({ length: 4 }, (_, index) => ({ id: `tech-${index}`, x: Math.cos(index), y: Math.sin(index), degree: 1, layer: "TECH" as const }))
      ]
    };
    const positions = deterministicLayout(collapsed);
    const byId = new Map(positions.map((position) => [position.id, position]));
    expect(new Set(positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(positions.length);
    expect(Math.max(...positions.map(({ x, y }) => Math.hypot(x, y)))).toBeGreaterThan(300);
    expect(byId.get("biz-0")!.y).toBeLessThan(-200);
    expect(byId.get("sys-0")!.y).toBeGreaterThan(-200);
    expect(byId.get("sys-0")!.y).toBeLessThan(200);
    expect(byId.get("tech-0")!.y).toBeGreaterThan(200);
  });

  it("keeps the refined overview from collapsing a connected cluster", () => {
    const collapsed: LayoutWorkerRequest = {
      ...request,
      layout: "overview",
      nodes: Array.from({ length: 12 }, (_, index) => ({ id: `node-${index}`, x: 1, y: 1, degree: 11, layer: index < 4 ? "BIZ" as const : index < 8 ? "SYS" as const : "TECH" as const })),
      edges: Array.from({ length: 12 }, (_, index) => ({ source: `node-${index}`, target: `node-${(index + 1) % 12}`, weight: 1 }))
    };
    const refined = refineArchitectureGraphLayout(collapsed, () => 0);
    const positions = refined.positions;
    expect(Math.max(...positions.map(({ x, y }) => Math.hypot(x, y))) - Math.min(...positions.map(({ x, y }) => Math.hypot(x, y)))).toBeGreaterThan(100);
    expect(new Set(positions.map(({ x, y }) => `${Math.round(x)}:${Math.round(y)}`)).size).toBeGreaterThan(8);
  });

  it("terminates layout when Scope, Baseline, or Projection identity changes", () => {
    expect(shouldTerminateLayout(identity, identity)).toBe(false);
    expect(shouldTerminateLayout(identity, { ...identity, projectionManifestId: "manifest-2" })).toBe(true);
    expect(shouldTerminateLayout(identity, { ...identity, applicationServiceId: "sibling-service" })).toBe(true);
  });
});
