import { describe, expect, it } from "vitest";
import { easeOutCubic, interpolateGraphPositions } from "./architecture-graph-motion";

describe("architecture graph motion", () => {
  it("clamps the easing curve to a stable range", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("interpolates every target from its current position", () => {
    const current = [{ id: "one", x: 0, y: 10 }];
    const target = [{ id: "one", x: 100, y: -10 }, { id: "two", x: 40, y: 20 }];

    expect(interpolateGraphPositions(current, target, 0)).toEqual([
      { id: "one", x: 0, y: 10 },
      { id: "two", x: 40, y: 20 }
    ]);
    expect(interpolateGraphPositions(current, target, 1)).toEqual(target);
    expect(interpolateGraphPositions(current, target, 0.5)[0]).toEqual({ id: "one", x: 87.5, y: -7.5 });
  });

  it("honors reduced motion by applying the final layout immediately", () => {
    const target = [{ id: "one", x: 100, y: -10 }];
    expect(interpolateGraphPositions([{ id: "one", x: 0, y: 10 }], target, 0, true)).toEqual(target);
  });
});
