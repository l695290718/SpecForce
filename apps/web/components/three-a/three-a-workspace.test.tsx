import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeProjectionNode } from "@specforge/core";
import { ThreeAWorkspace, type ThreeAWorkspaceData } from "./three-a-workspace";

vi.mock("../language-provider", () => ({ T: ({ k }: { k: string }) => k }));

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const nodes: KnowledgeProjectionNode[] = [
  { ...scope, generationId: "generation-1", baselineId: "baseline-1", assertionId: "biz-1", semanticIdentity: "orders.intent", layer: "BIZ", sortKey: "BIZ|orders.intent", contentDigest: "digest-biz" },
  { ...scope, generationId: "generation-1", baselineId: "baseline-1", assertionId: "sys-1", semanticIdentity: "orders.api", layer: "SYS", sortKey: "SYS|orders.api", contentDigest: "digest-sys" },
  { ...scope, generationId: "generation-1", baselineId: "baseline-1", assertionId: "tech-1", semanticIdentity: "orders.postgres", layer: "TECH", sortKey: "TECH|orders.postgres", contentDigest: "digest-tech" }
];
const data: ThreeAWorkspaceData = { state: { scope: scope.applicationServiceId, baseline: "baseline-1", projection: "projection-1", tab: "architecture", mode: "lanes", direction: "both" }, nodes, edges: [], alignmentEdges: [], baselines: [], manifests: [{ id: "projection-1", profileVersion: "1", publishedAt: "2026-08-10T00:00:00.000Z" }] };

describe("ThreeAWorkspace", () => {
  it("preserves the same node IDs in lanes and list mode", () => {
    const lanes = renderToStaticMarkup(<ThreeAWorkspace data={data} />);
    const list = renderToStaticMarkup(<ThreeAWorkspace data={{ ...data, state: { ...data.state, mode: "list" } }} />);
    for (const node of nodes) {
      expect(lanes).toContain(`three-a-node-${node.assertionId}`);
      expect(list).toContain(`three-a-node-${node.assertionId}`);
    }
  });

  it("does not render mutation controls", () => {
    const markup = renderToStaticMarkup(<ThreeAWorkspace data={data} />).toLowerCase();
    expect(markup).not.toMatch(/\b(edit|approve|promote|publish)\b/);
  });
});
