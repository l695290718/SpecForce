import { describe, expect, it, vi } from "vitest";

import { synchronizeDesignFacts } from "./sync-design-facts";
import { validateAssetLocalization } from "../packages/core/src/localization/assets";
import type { Asset } from "../packages/core/src/types";

const scope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const federatedEnglishAdr = `# Federated Design-Fact Synchronization

## Context

Federated facts need one exact Scope and a governed MCP write boundary.

## Decision

Use the governance core for scoped persistence and read-only reconciliation.

## Alternatives

1. **Direct external mutation.** Deferred until a later increment.
2. **Last-writer-wins.** Rejected for governed facts.

## Consequences

- Scope-safe records are auditable.
- Connector delivery remains separately reviewed.

## Constraints

- MCP is the authored write boundary.
- PostgreSQL is authoritative and graph stores are derived.

## Evidence

- **Implemented:** Core contracts and MCP tools.
- **Locally verified:** Focused sync tests pass.
`;

const federatedChineseAdr = `## 中文本地化

### 标题

联邦设计事实同步

### 背景

联邦事实需要精确 Scope 和受治理的 MCP 写入边界。

### 决策

使用治理核心进行受 Scope 约束的持久化和只读对账。

### 备选方案

1. **直接修改外部系统。** 延期到后续增量。
2. **最后写入者获胜。** 治理事实禁止采用。

### 后果

- Scope 安全的记录可审计。
- 连接器投递需要独立评审。

### 约束

- MCP 是已编写事实的写入边界。
- PostgreSQL 保持权威，图存储是派生投影。

### 证据

- **已实现：** 核心契约和 MCP 工具。
- **已本地验证：** 针对性同步测试通过。
`;

const federatedDecision = {
  id: "adr-federated-design-fact-synchronization",
  repositoryAdr: "docs/adr/0010-federated-design-fact-synchronization.md",
  mcpAdrId: "adr-federated-design-fact-synchronization",
  scope,
  proposalId: "proposal-federated-design-fact-governance-core",
  contextPackId: "context-pack-federated-design-fact-governance",
  relatedAssetIds: ["api-specforge-mcp-tools", "data-specforge-assets", "data-specforge-asset-graph", "adr-design-fact-dual-record-governance"],
  evidence: [{ command: "pnpm test", result: "Focused sync tests pass." }]
};

const simpleEnglishAdr = `# Scope isolation

## Context

English canonical context.

## Decision

English canonical decision.

## Alternatives

1. **Global scope.** Rejected.

## Consequences

- Scope remains explicit.

## Constraints

- Every write has a Scope.

## Evidence

- **Verified:** Focused test.
`;

const simpleChineseAdr = `## 中文本地化

### 标题

中文范围隔离

### 背景

中文规范背景。

### 决策

中文规范决策。

### 备选方案

1. **全局范围。** 拒绝。

### 后果

- 范围保持明确。

### 约束

- 每次写入都有范围。

### 证据

- **已验证：** 针对性测试。
`;

describe("synchronizeDesignFacts", () => {
  it("rejects related assets with unknown prefixes", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });

    await expect(synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          id: "adr-unknown-prefix",
          repositoryAdr: "docs/adr/0001-scope.md",
          mcpAdrId: "adr-unknown-prefix",
          scope,
          proposalId: "proposal-scope",
          contextPackId: "ctx-scope",
          relatedAssetIds: ["mystery-specforge-asset"],
          evidence: []
        }]
      },
      readAdr: async () => ({ title: "Scope isolation", english: simpleEnglishAdr, chinese: simpleChineseAdr })
    })).rejects.toThrow("DESIGN_FACT_RELATED_ASSET_PREFIX_UNKNOWN");
    expect(callTool).not.toHaveBeenCalled();
  });

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
        english: simpleEnglishAdr,
        chinese: simpleChineseAdr
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
      readAdr: async () => ({ title: "Scope isolation", english: simpleEnglishAdr, chinese: simpleChineseAdr }),
      readExisting: async (type) => type === "proposal"
        ? { id: "proposal-scope", title: "Existing proposal" }
        : { id: "ctx-scope", proposalId: "proposal-scope", name: "Existing context" }
    });

    expect(callTool).toHaveBeenCalledWith("upsert_proposal", expect.objectContaining({ proposal: { id: "proposal-scope", title: "Existing proposal" } }));
    expect(callTool).toHaveBeenCalledWith("upsert_context_pack", expect.objectContaining({ contextPack: { id: "ctx-scope", proposalId: "proposal-scope", name: "Existing context" } }));
    expect(callTool).toHaveBeenCalledWith("link_assets", expect.objectContaining({ sourceType: "proposal", targetType: "adr", relationType: "IMPLEMENTS_DECISION" }));
    expect(callTool).toHaveBeenCalledWith("upsert_design_asset", expect.objectContaining({
      assetType: "evidence",
      architectureScope: scope,
      asset: expect.objectContaining({
        id: "evidence-adr-scope-1",
        decisionId: "adr-scope",
        command: "pnpm test",
        result: "passes",
        status: "passed"
      })
    }));
    expect(callTool).toHaveBeenCalledWith("link_assets", expect.objectContaining({
      sourceType: "evidence",
      sourceId: "evidence-adr-scope-1",
      targetType: "adr",
      targetId: "adr-scope",
      relationType: "VALIDATES"
    }));
  });

  it("parses the federated ADR into complete typed MCP payloads", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    await synchronizeDesignFacts({
      callTool,
      manifest: { decisions: [federatedDecision] },
      readAdr: async () => ({ title: "Federated Design-Fact Synchronization", english: federatedEnglishAdr, chinese: federatedChineseAdr }),
      readExisting: async () => undefined
    });

    const adrCall = callTool.mock.calls.find(([name]) => name === "create_adr");
    expect(adrCall?.[1]).toMatchObject({
      applicationServiceId: scope.applicationServiceId,
      architectureScope: scope,
      adr: {
        id: federatedDecision.mcpAdrId,
        title: "Federated Design-Fact Synchronization",
        description: "Federated facts need one exact Scope and a governed MCP write boundary.",
        context: "Federated facts need one exact Scope and a governed MCP write boundary.",
        decision: "Use the governance core for scoped persistence and read-only reconciliation.",
        alternatives: ["**Direct external mutation.** Deferred until a later increment.", "**Last-writer-wins.** Rejected for governed facts."],
        consequences: ["Scope-safe records are auditable.", "Connector delivery remains separately reviewed."],
        constraints: ["MCP is the authored write boundary.", "PostgreSQL is authoritative and graph stores are derived."],
        evidence: ["**Implemented:** Core contracts and MCP tools.", "**Locally verified:** Focused sync tests pass."],
        relatedAssets: [
          { type: "api", id: "api-specforge-mcp-tools" },
          { type: "dataModel", id: "data-specforge-assets" },
          { type: "dataModel", id: "data-specforge-asset-graph" },
          { type: "adr", id: "adr-design-fact-dual-record-governance" }
        ],
        localizedContent: {
          en: {
            name: "Federated Design-Fact Synchronization",
            description: "Federated facts need one exact Scope and a governed MCP write boundary.",
            title: "Federated Design-Fact Synchronization",
            context: "Federated facts need one exact Scope and a governed MCP write boundary.",
            decision: "Use the governance core for scoped persistence and read-only reconciliation.",
            alternatives: ["**Direct external mutation.** Deferred until a later increment.", "**Last-writer-wins.** Rejected for governed facts."],
            consequences: ["Scope-safe records are auditable.", "Connector delivery remains separately reviewed."],
            constraints: ["MCP is the authored write boundary.", "PostgreSQL is authoritative and graph stores are derived."]
          },
          zh: {
            name: "联邦设计事实同步",
            description: "联邦事实需要精确 Scope 和受治理的 MCP 写入边界。",
            title: "联邦设计事实同步",
            context: "联邦事实需要精确 Scope 和受治理的 MCP 写入边界。",
            decision: "使用治理核心进行受 Scope 约束的持久化和只读对账。",
            alternatives: ["**直接修改外部系统。** 延期到后续增量。", "**最后写入者获胜。** 治理事实禁止采用。"],
            consequences: ["Scope 安全的记录可审计。", "连接器投递需要独立评审。"],
            constraints: ["MCP 是已编写事实的写入边界。", "PostgreSQL 保持权威，图存储是派生投影。"]
          }
        }
      }
    });

    const adr = adrCall?.[1]?.adr as { evidence: string[]; localizedContent: { en: Record<string, unknown>; zh: Record<string, unknown> } };
    expect(adr.evidence).toEqual(["**Implemented:** Core contracts and MCP tools.", "**Locally verified:** Focused sync tests pass."]);
    expect(adr.localizedContent.en).not.toHaveProperty("evidence");
    expect(adr.localizedContent.zh).not.toHaveProperty("evidence");
    expect(() => validateAssetLocalization("adr", adr as unknown as Asset)).not.toThrow();

    expect(callTool).toHaveBeenCalledWith("upsert_proposal", expect.objectContaining({
      architectureScope: scope,
      proposal: expect.objectContaining({
        id: federatedDecision.proposalId,
        description: "Federated facts need one exact Scope and a governed MCP write boundary.",
        background: "Federated facts need one exact Scope and a governed MCP write boundary.",
        goal: "Use the governance core for scoped persistence and read-only reconciliation.",
        localizedContent: { en: expect.any(Object), zh: expect.any(Object) }
      })
    }));
    expect(callTool).toHaveBeenCalledWith("upsert_context_pack", expect.objectContaining({
      architectureScope: scope,
      contextPack: expect.objectContaining({
        id: federatedDecision.contextPackId,
        summary: "Federated facts need one exact Scope and a governed MCP write boundary.",
        constraints: ["MCP is the authored write boundary.", "PostgreSQL is authoritative and graph stores are derived."],
        instructions: ["Use the governance core for scoped persistence and read-only reconciliation."],
        localizedContent: { en: expect.any(Object), zh: expect.any(Object) }
      })
    }));

    const links = callTool.mock.calls
      .filter(([name]) => name === "link_assets")
      .map(([, input]) => input);
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceType: "proposal", sourceId: federatedDecision.proposalId, targetType: "adr", targetId: federatedDecision.mcpAdrId, relationType: "IMPLEMENTS_DECISION", architectureScope: scope }),
      expect.objectContaining({ sourceType: "contextPack", sourceId: federatedDecision.contextPackId, targetType: "proposal", targetId: federatedDecision.proposalId, relationType: "IMPLEMENTS_CONTEXT_FOR", architectureScope: scope }),
      expect.objectContaining({ sourceType: "adr", sourceId: federatedDecision.mcpAdrId, targetType: "api", targetId: "api-specforge-mcp-tools", relationType: "DECIDES", architectureScope: scope }),
      expect.objectContaining({ sourceType: "adr", sourceId: federatedDecision.mcpAdrId, targetType: "dataModel", targetId: "data-specforge-assets", relationType: "DECIDES", architectureScope: scope }),
      expect.objectContaining({ sourceType: "adr", sourceId: federatedDecision.mcpAdrId, targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "DECIDES", architectureScope: scope }),
      expect.objectContaining({ sourceType: "adr", sourceId: federatedDecision.mcpAdrId, targetType: "adr", targetId: "adr-design-fact-dual-record-governance", relationType: "DECIDES", architectureScope: scope }),
      expect.objectContaining({ sourceType: "evidence", sourceId: "evidence-adr-federated-design-fact-synchronization-1", targetType: "adr", targetId: federatedDecision.mcpAdrId, relationType: "VALIDATES", architectureScope: scope })
    ]));

    expect(callTool).toHaveBeenCalledWith("upsert_design_asset", expect.objectContaining({
      assetType: "evidence",
      architectureScope: scope,
      asset: expect.objectContaining({
        id: "evidence-adr-federated-design-fact-synchronization-1",
        decisionId: federatedDecision.mcpAdrId,
        command: "pnpm test",
        result: "Focused sync tests pass.",
        localizedContent: {
          en: { name: expect.any(String), description: expect.any(String), command: "pnpm test", result: "Focused sync tests pass." },
          zh: { name: expect.any(String), description: expect.any(String), command: "pnpm test", result: "Focused sync tests pass." }
        }
      })
    }));
  });
});
