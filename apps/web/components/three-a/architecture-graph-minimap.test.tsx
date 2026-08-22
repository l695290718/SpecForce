import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createArchitectureGraphStore, type GraphStoreIdentity } from "./architecture-graph-store";
import { ArchitectureGraphMinimap, graphExtent, viewportRect } from "./architecture-graph-minimap";

vi.mock("../language-provider", () => ({ T: ({ k }: { k: string }) => k }));

const identity: GraphStoreIdentity = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner", baselineId: "baseline-1", projectionManifestId: "projection-1" };

describe("architecture graph minimap", () => {
  it("computes the live bounding box of node positions", () => {
    expect(graphExtent([{ x: -5, y: 2 }, { x: 15, y: -8 }, { x: 0, y: 0 }])).toEqual({ minX: -5, minY: -8, maxX: 15, maxY: 2 });
    expect(graphExtent([])).toBeUndefined();
  });

  it("maps the normalized camera state to the minimap viewport rectangle", () => {
    expect(viewportRect({ x: 0.5, y: 0.25, ratio: 0.5 }, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 200, 100)).toEqual({ x: 50, y: 0, w: 100, h: 50 });
    const clamped = viewportRect({ x: 0, y: 0, ratio: 2 }, { minX: 0, minY: 0, maxX: 1, maxY: 1 }, 200, 100);
    expect(clamped.w).toBeGreaterThan(200);
  });

  it("renders the minimap canvas without requiring a live WebGL or 2d context", () => {
    const store = createArchitectureGraphStore(identity);
    store.graph.addNode("fact:one", { stableId: "fact:one", kind: "fact", label: "one", layer: "SYS", memberCount: 1, degree: 0, criticality: 0, x: 0, y: 0 });
    const markup = renderToStaticMarkup(<ArchitectureGraphMinimap store={store} cameraProvider={() => undefined} />);
    expect(markup).toContain('data-testid="architecture-graph-minimap"');
    expect(markup).toContain("<canvas");
  });
});
