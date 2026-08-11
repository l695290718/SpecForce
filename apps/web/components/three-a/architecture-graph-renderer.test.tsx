import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ArchitectureGraphListFallback, rendererFailureDescription } from "./architecture-graph-renderer";
import type { GraphSemanticEdge, GraphSemanticNode } from "./architecture-graph-store";

vi.mock("../language-provider", () => ({ T: ({ k }: { k: string }) => k }));
const nodes: GraphSemanticNode[] = [{ id: "fact:one", attributes: { stableId: "fact:one", kind: "fact", label: "Order API", layer: "SYS", memberCount: 1, degree: 1, criticality: 0, x: 0, y: 0 } }];
const edges: GraphSemanticEdge[] = [{ id: "relationship:one", source: "fact:one", target: "fact:two", attributes: { stableId: "relationship:one", relationCode: "CALLS", confidence: 1, bridge: false, weight: 1 } }];
describe("ArchitectureGraphRenderer fallback", () => {
  it("keeps a fixed-height semantic fallback with retry and relationship details", () => { const markup = renderToStaticMarkup(<ArchitectureGraphListFallback reason="WEBGL_CONTEXT_LOST" nodes={nodes} edges={edges} onNodeSelect={() => undefined} onEdgeSelect={() => undefined} onRetry={() => undefined} />); expect(markup).toContain("h-[clamp(36rem,calc(100dvh-12rem),52rem)]"); expect(markup).toContain("Retry renderer"); expect(markup).toContain("Order API"); expect(markup).toContain("CALLS"); });
  it("reports concrete failure descriptions", () => { expect(rendererFailureDescription("WEBGL_UNAVAILABLE")).toContain("WebGL"); expect(rendererFailureDescription("WORKER_ERROR")).toContain("deterministic"); });
});
