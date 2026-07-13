import { listAuditLogs } from "@specforge/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const persistence = vi.hoisted(() => ({
  isSeedMode: vi.fn(() => process.env.SPECFORGE_MCP_SEED === "1"),
  deletePersistedDesignData: vi.fn().mockResolvedValue({ status: "deleted" }),
  getPersistedAsset: vi.fn(),
  listPersistedContextPacks: vi.fn().mockResolvedValue([]),
  renderPersistedAssetAsMarkdown: vi.fn(),
  searchPersistedDesignAssets: vi.fn(),
  upsertAssetLink: vi.fn(),
  upsertContextPack: vi.fn(),
  upsertDesignAsset: vi.fn(),
  upsertProposal: vi.fn()
}));

vi.mock("./persistence", () => persistence);

import { registerTools } from "./tools";

type RegisteredTool = {
  config: Record<string, unknown>;
  handler: (input: unknown) => Promise<{ isError?: boolean; content: Array<{ type: string; text: string }> }>;
};

function captureTools(): Map<string, RegisteredTool> {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool(name: string, config: Record<string, unknown>, handler: RegisteredTool["handler"]) {
      tools.set(name, { config, handler });
    }
  } as unknown as McpServer;
  registerTools(server);
  return tools;
}

beforeEach(() => {
  delete process.env.SPECFORGE_MCP_SEED;
  persistence.deletePersistedDesignData.mockClear();
});

afterEach(() => {
  delete process.env.SPECFORGE_MCP_SEED;
});

describe("seed cleanup MCP boundary", () => {
  it("does not register the destructive cleanup tool for normal MCP servers", () => {
    expect(captureTools().has("delete_seed_design_data")).toBe(false);
  });

  it("rejects a captured cleanup handler when seed mode is no longer active", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const cleanup = captureTools().get("delete_seed_design_data");
    expect(cleanup).toBeDefined();
    delete process.env.SPECFORGE_MCP_SEED;

    const result = await cleanup!.handler({
      architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" },
      assetIds: ["legacy"]
    });

    expect(result.isError).toBe(true);
    expect(persistence.deletePersistedDesignData).not.toHaveBeenCalled();
  });

  it("audits successful seed cleanup as the dedicated seed system actor", async () => {
    process.env.SPECFORGE_MCP_SEED = "1";
    const cleanup = captureTools().get("delete_seed_design_data");
    const before = listAuditLogs().length;

    const result = await cleanup!.handler({
      architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "designer" },
      assetIds: ["legacy"]
    });

    expect(result.isError).not.toBe(true);
    expect(persistence.deletePersistedDesignData).toHaveBeenCalledOnce();
    expect(listAuditLogs().slice(before)).toContainEqual(expect.objectContaining({
      actorType: "system",
      actorId: "specforge-seed",
      action: "delete_seed_design_data",
      status: "success"
    }));
  });
});
