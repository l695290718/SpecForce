import { describe, expect, it, vi } from "vitest";

import { synchronizeDesignFacts } from "./sync-design-facts";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

describe("synchronizeDesignFacts", () => {
  it("writes every manifest ADR with exact scope and bilingual payload", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    const receipt = await synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          id: "adr-scope",
          repositoryAdr: "docs/adr/0001-scope.md",
          mcpAdrId: "adr-scope",
          scope,
          proposalId: "proposal-scope",
          contextPackId: "ctx-scope",
          relatedAssetIds: ["api-specforge-mcp-tools"],
          evidence: []
        }]
      },
      readAdr: async () => ({
        title: "Scope isolation",
        english: "English canonical decision.",
        chinese: "中文决策内容。"
      })
    });

    expect(receipt).toEqual([{ id: "adr-scope", mcpAdrId: "adr-scope", status: "complete" }]);
    expect(callTool).toHaveBeenCalledWith("create_adr", expect.objectContaining({
      applicationServiceId: scope.applicationServiceId,
      architectureScope: scope,
      adr: expect.objectContaining({
        id: "adr-scope",
        localizedContent: expect.objectContaining({ zh: expect.objectContaining({ title: expect.stringContaining("中文") }) })
      })
    }));
  });

  it("preserves existing proposal and Context Pack payloads before linking ADR evidence", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    await synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          id: "adr-scope",
          repositoryAdr: "docs/adr/0001-scope.md",
          mcpAdrId: "adr-scope",
          scope,
          proposalId: "proposal-scope",
          contextPackId: "ctx-scope",
          relatedAssetIds: ["api-specforge-mcp-tools"],
          evidence: [{ command: "pnpm test", result: "passes" }]
        }]
      },
      readAdr: async () => ({ title: "Scope isolation", english: "English.", chinese: "中文。" }),
      readExisting: async (type) => type === "proposal"
        ? { id: "proposal-scope", title: "Existing proposal" }
        : { id: "ctx-scope", proposalId: "proposal-scope", name: "Existing context" }
    });

    expect(callTool).toHaveBeenCalledWith("upsert_proposal", expect.objectContaining({ proposal: { id: "proposal-scope", title: "Existing proposal" } }));
    expect(callTool).toHaveBeenCalledWith("upsert_context_pack", expect.objectContaining({ contextPack: { id: "ctx-scope", proposalId: "proposal-scope", name: "Existing context" } }));
    expect(callTool).toHaveBeenCalledWith("link_assets", expect.objectContaining({ sourceType: "proposal", targetType: "adr", relationType: "IMPLEMENTS_DECISION" }));
  });
});
