import { describe, expect, it } from "vitest";
import { runForceArchitectureLayout, type ForceLayoutRequest } from "./architecture-graph-layout-force";

const request: ForceLayoutRequest = {
  nodes: [
    { id: "b", x: 80, y: 0, degree: 2 },
    { id: "a", x: -80, y: 0, degree: 2 },
    { id: "c", x: 0, y: 80, degree: 1 }
  ],
  edges: [
    { source: "a", target: "b", weight: 1 },
    { source: "b", target: "c", weight: 0.5 }
  ],
  seed: 42,
  maxRuntimeMs: 1_500,
  runNoverlap: true
};

describe("architecture graph force layout adapter", () => {
  it("keeps the deterministic seed stable for the same identity and input", () => {
    const first = runForceArchitectureLayout(request, () => 0);
    const shuffled = runForceArchitectureLayout({ ...request, nodes: [...request.nodes].reverse(), edges: [...request.edges].reverse() }, () => 0);
    expect(first).toEqual(shuffled);
    expect(first.lifecycle).toBe("settled");
  });

  it("moves connected nodes toward a settled force layout without NaN coordinates", () => {
    const result = runForceArchitectureLayout(request, () => 0);
    const initial = new Map(request.nodes.map((node) => [node.id, `${node.x}:${node.y}`]));
    expect(result.positions).toHaveLength(request.nodes.length);
    expect(result.positions.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    expect(result.positions.some(({ id, x, y }) => initial.get(id) !== `${x}:${y}`)).toBe(true);
  });

  it("runs Noverlap cleanup without dropping nodes or edges", () => {
    const collisionRequest = {
      ...request,
      nodes: request.nodes.map((node) => ({ ...node, x: 0, y: 0 })),
      edges: [...request.edges, { source: "a", target: "c", weight: 1 }]
    } satisfies ForceLayoutRequest;
    const result = runForceArchitectureLayout(collisionRequest, () => 0);
    const repeated = runForceArchitectureLayout(collisionRequest, () => 0);
    expect(result.positions.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(new Set(result.positions.map(({ x, y }) => `${x}:${y}`)).size).toBe(result.positions.length);
    expect(repeated).toEqual(result);
  });

  it("returns deterministic positions when reduced motion or the time budget disables force", () => {
    const reduced = runForceArchitectureLayout({ ...request, reducedMotion: true }, () => 0);
    const timeout = runForceArchitectureLayout({ ...request, maxRuntimeMs: 0 }, () => 0);
    expect(reduced).toMatchObject({ lifecycle: "stopped" });
    expect(timeout).toMatchObject({ lifecycle: "failed", reason: "TIMEOUT" });
    expect(reduced.positions).toEqual(timeout.positions);
  });

  it("returns failed lifecycle with deterministic positions when the runtime budget expires", () => {
    let calls = 0;
    const result = runForceArchitectureLayout(request, () => {
      calls += 1;
      return calls === 1 ? 0 : 2_000;
    });
    expect(result).toMatchObject({ lifecycle: "failed", reason: "TIMEOUT" });
    expect(result.positions).toEqual(runForceArchitectureLayout({ ...request, reducedMotion: true }, () => 0).positions);
  });
});
