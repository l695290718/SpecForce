import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const persistence = vi.hoisted(() => ({
  isSeedMode: vi.fn(() => false),
  prisma: {},
  readableScope: vi.fn((applicationServiceId: string) => ({
    applicationServiceId,
    scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
  })),
  ensureMcpPersistenceSchema: vi.fn().mockResolvedValue(undefined),
  searchPersistedDesignAssets: vi.fn(),
  queryPersistedAssetLinks: vi.fn(),
  listPersistedAssets: vi.fn(),
  listPersistedProposals: vi.fn(),
  listPersistedContextPacks: vi.fn(),
  listPersistedAssetLinks: vi.fn(),
  archiveSeedGraphOutbox: vi.fn(),
  deletePersistedDesignData: vi.fn(),
  prepareDataModelUpgrade: vi.fn(),
  upsertAssetLink: vi.fn(),
  upsertContextPack: vi.fn(),
  upsertDesignAsset: vi.fn(),
  upsertProposal: vi.fn()
}));

vi.mock("./persistence", () => persistence);
vi.mock("./audit", () => ({ auditToolCall: vi.fn() }));
vi.mock("./auth", () => ({
  allowAllPolicy: { authorize: vi.fn().mockResolvedValue(undefined) },
  getDefaultActor: vi.fn(() => ({ actorType: "user", actorId: "test-user" })),
  principalFromAuthInfo: vi.fn(),
  withRequestPrincipal: vi.fn((_principal: unknown, execute: () => unknown) => execute())
}));

import { registerTools } from "./tools";

type RegisteredTool = {
  config: { inputSchema: Record<string, unknown> };
  handler: (input: unknown) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
};

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: RegisteredTool["config"], handler: RegisteredTool["handler"]) {
      tools.set(name, { config, handler });
    }
  } as unknown as McpServer;
  registerTools(server);
  return tools;
}

function parseInput(tool: RegisteredTool, input: unknown) {
  return z.object(tool.config.inputSchema as z.ZodRawShape).parse(input);
}

function resultJson(result: Awaited<ReturnType<RegisteredTool["handler"]>>) {
  return JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MCP read performance contracts", () => {
  it("accepts pageSize, cursor, and summaryOnly and returns bounded pagination metadata", async () => {
    const cursor = "signed-read-cursor";
    persistence.searchPersistedDesignAssets.mockResolvedValue({
      results: [{ id: "api-1", type: "api", name: "Policy API", summary: "Policy read API", relevanceReason: "matched" }],
      catalogVersion: "42",
      projectionVersion: "1",
      hasMore: true,
      nextCursor: "signed-next-cursor",
      resultDigest: "digest-42",
      truncated: false
    });

    const tool = captureTools().get("search_design_assets");
    expect(tool).toBeDefined();
    const input = parseInput(tool!, {
      query: "policy",
      applicationServiceId: scope.applicationServiceId,
      pageSize: 25,
      cursor,
      summaryOnly: true,
      assetTypes: ["api"],
      locale: "en"
    });

    const result = await tool!.handler(input);

    expect(result.isError).not.toBe(true);
    expect(persistence.searchPersistedDesignAssets).toHaveBeenCalledWith({
      ...input,
      limit: 25,
      pageSize: 25,
      cursor
    });
    expect(resultJson(result)).toMatchObject({
      catalogVersion: "42",
      projectionVersion: "1",
      hasMore: true,
      nextCursor: "signed-next-cursor",
      resultDigest: "digest-42",
      truncated: false
    });
    expect(persistence.listPersistedAssets).not.toHaveBeenCalled();
    expect(persistence.listPersistedProposals).not.toHaveBeenCalled();
    expect(persistence.listPersistedContextPacks).not.toHaveBeenCalled();
  });

  it("binds query_asset_links to the exact Scope, endpoint filters, and a hard limit", async () => {
    persistence.queryPersistedAssetLinks.mockResolvedValue({
      ...scope,
      links: [{
        id: "link-1",
        sourceType: "api",
        sourceId: "api-policy",
        targetType: "dataModel",
        targetId: "model-policy",
        relationType: "CONTRACT_USES_MODEL",
        architectureScope: scope,
        createdAt: "2026-08-27T00:00:00.000Z"
      }],
      hasMore: true,
      truncated: true
    });

    const tool = captureTools().get("query_asset_links");
    expect(tool).toBeDefined();
    const input = parseInput(tool!, {
      applicationServiceId: scope.applicationServiceId,
      sourceType: "api",
      sourceId: "api-policy",
      targetType: "dataModel",
      targetId: "model-policy",
      relationType: "CONTRACT_USES_MODEL",
      limit: 100
    });

    const result = await tool!.handler(input);

    expect(result.isError).not.toBe(true);
    expect(persistence.queryPersistedAssetLinks).toHaveBeenCalledWith(input);
    expect(resultJson(result)).toMatchObject({
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      hasMore: true,
      truncated: true
    });
    expect(() => parseInput(tool!, { applicationServiceId: scope.applicationServiceId, limit: 101 })).toThrow();
    expect(persistence.listPersistedAssetLinks).not.toHaveBeenCalled();
    expect(persistence.listPersistedAssets).not.toHaveBeenCalled();
  });
});
