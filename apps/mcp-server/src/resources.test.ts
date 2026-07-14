import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scopedDerived = vi.hoisted(() => ({
  buildScopedAssetGraph: vi.fn().mockResolvedValue({
    graph: {
      nodes: [{ id: "shared-domain", label: "策略领域", type: "domain", summary: "中文说明" }],
      edges: []
    }
  }),
  renderScopedAssetMarkdown: vi.fn().mockResolvedValue({ content: "# 策略领域" }),
  renderScopedCollectionMarkdown: vi.fn().mockResolvedValue({ content: "# 设计资产目录" })
}));

vi.mock("./scoped-derived", () => scopedDerived);

import { registerResources } from "./resources";

type ResourceHandler = (uri: URL, variables: Record<string, string>) => Promise<{ contents: Array<{ text: string }> }>;

function captureResources(): Map<string, ResourceHandler> {
  const resources = new Map<string, ResourceHandler>();
  const server = {
    registerResource(name: string, _uri: unknown, _config: unknown, handler: ResourceHandler) {
      resources.set(name, handler);
    }
  } as unknown as McpServer;
  registerResources(server);
  return resources;
}

beforeEach(() => vi.clearAllMocks());

describe("scoped localized MCP resources", () => {
  it("registers explicit scoped collection, detail, and graph templates", () => {
    const resources = captureResources();
    expect(resources.has("scoped-assets")).toBe(true);
    expect(resources.has("scoped-asset-detail")).toBe(true);
    expect(resources.has("scoped-graph")).toBe(true);
  });

  it("routes resource variables through the scoped derived boundary", async () => {
    const resources = captureResources();
    const variables = { applicationServiceId: "com.huawei.celon.policyhub", locale: "zh", assetType: "domain", id: "shared-domain" };

    const collection = await resources.get("scoped-assets")!(new URL("specforge://scope/assets"), variables);
    const detail = await resources.get("scoped-asset-detail")!(new URL("specforge://scope/detail"), variables);
    const graph = await resources.get("scoped-graph")!(new URL("specforge://scope/graph"), variables);

    expect(collection.contents[0]!.text).toContain("设计资产目录");
    expect(detail.contents[0]!.text).toContain("策略领域");
    expect(graph.contents[0]!.text).toContain("策略领域");
    expect(scopedDerived.renderScopedCollectionMarkdown).toHaveBeenCalledWith(expect.objectContaining({ applicationServiceId: variables.applicationServiceId, locale: "zh" }));
    expect(scopedDerived.renderScopedAssetMarkdown).toHaveBeenCalledWith(expect.objectContaining({ assetId: "shared-domain" }));
    expect(scopedDerived.buildScopedAssetGraph).toHaveBeenCalledWith(expect.objectContaining({ applicationServiceId: variables.applicationServiceId, locale: "zh" }));
  });

  it("rejects an invalid locale before reading persisted data", async () => {
    const handler = captureResources().get("scoped-graph")!;
    await expect(handler(new URL("specforge://scope/graph"), {
      applicationServiceId: "com.huawei.celon.policyhub",
      locale: "fr"
    })).rejects.toThrow("Unsupported locale");
    expect(scopedDerived.buildScopedAssetGraph).not.toHaveBeenCalled();
  });
});
