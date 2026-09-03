import { describe, expect, it } from "vitest";
import { buildFeatureGraphModel, highlightImpactPath } from "./feature-graph-model";

describe("Feature graph model", () => {
  const response = { architectureScope: { applicationServiceId: "service-a", scopePath: "f/p/s/m/service-a" }, nodes: [{ id: "sf", logicalId: "sf-a", nodeType: "serviceFeature", label: "服务特性 A" }, { id: "ff", logicalId: "ff-a", nodeType: "functionalFeature", label: "功能特性 A" }, { id: "api", logicalId: "api-a", nodeType: "api", label: "API A" }], edges: [{ id: "ff-sf", source: "ff", target: "sf", relationType: "CONTRIBUTES_TO" }, { id: "api-ff", source: "api", target: "ff", relationType: "EXPOSES" }], partial: false, graphVersion: "2" };
  it("builds a bounded localized graph", () => { const graph = buildFeatureGraphModel(response); expect(graph.order).toBe(3); expect(graph.getNodeAttribute("sf", "label")).toBe("服务特性 A"); expect(graph.getEdgeAttribute("ff-sf", "relationType")).toBe("CONTRIBUTES_TO"); });
  it("finds an impact path in either traversal direction", () => { expect(highlightImpactPath(buildFeatureGraphModel(response), "sf", "api")).toEqual(["ff-sf", "api-ff"]); });
  it("filters nodes and their edges", () => { const graph = buildFeatureGraphModel(response, { visibleTypes: new Set(["serviceFeature", "functionalFeature"]) }); expect(graph.getNodeAttribute("api", "hidden")).toBe(true); expect(graph.getEdgeAttribute("api-ff", "hidden")).toBe(true); });
});
