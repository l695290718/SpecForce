import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import { splitAdrSource, synchronizeDesignFacts } from "./sync-design-facts";
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
  it.each([
    "adr-application-service-scope-isolation",
    "adr-mcp-first-architecture",
    "adr-canonical-english-localized-overlay",
    "adr-postgresql-authoritative-design-store",
    "adr-nebulagraph-derived-impact-runtime",
    "adr-transactional-outbox-graph-projection",
    "adr-design-fact-dual-record-governance",
    "adr-federated-design-fact-synchronization"
  ])("validates repository bilingual structure for %s", async (id) => {
    const manifest = JSON.parse(await readFile("docs/design-facts/baseline-manifest.json", "utf8")) as {
      decisions: Array<{
        id: string;
        repositoryAdr: string;
        mcpAdrId: string;
        scope: typeof scope;
        proposalId: string;
        contextPackId: string;
        relatedAssetIds: string[];
        evidence: Array<{ command: string; result: string }>;
      }>;
    };
    const decision = manifest.decisions.find((candidate) => candidate.id === id);
    if (!decision) throw new Error(`Missing manifest decision: ${id}`);
    const callTool = vi.fn(async (name: string, input: Record<string, unknown>) => {
      if (name === "create_adr") validateAssetLocalization("adr", input.adr as Asset);
      return { ok: true };
    });

    await expect(synchronizeDesignFacts({
      callTool,
      manifest: { decisions: [decision] },
      readAdr: async () => splitAdrSource(await readFile(decision.repositoryAdr, "utf8"))
    })).resolves.toEqual([{ id: decision.id, mcpAdrId: decision.mcpAdrId, status: "complete" }]);
  });

  it("splits repository ADRs at the bold Chinese localization marker", async () => {
    const source = splitAdrSource(await readFile("docs/adr/0001-application-service-scope-isolation.md", "utf8"));

    expect(source.english).toContain("## Alternatives");
    expect(source.chinese).toContain("### 备选方案");
    expect(source.chinese).toContain("将每个请求隐式默认为 Designer 服务");
  });

  it("splits repository ADRs at legacy Chinese localization labels", async () => {
    const source = splitAdrSource(await readFile("docs/adr/0004-postgresql-authoritative-design-store.md", "utf8"));

    expect(source.english).toContain("## Alternatives");
    expect(source.chinese).toContain("### 备选方案");
    expect(source.chinese).toContain("使用图数据库作为系统记录源");
  });

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

  it("writes managed bilingual assets and directional links through MCP", async () => {
    const managedAsset = {
      assetType: "api" as const,
      asset: {
        id: "api-specforge-managed-contract",
        name: "Managed contract",
        description: "Managed contract description.",
        localizedContent: {
          en: { name: "Managed contract", description: "Managed contract description." },
          zh: { name: "受管契约", description: "受管契约说明。" }
        }
      }
    };
    const managedRelationship = {
      sourceType: "proposal",
      sourceId: "proposal-scope",
      targetType: "api",
      targetId: managedAsset.asset.id,
      relationType: "IMPACTS"
    };
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
          relatedAssetIds: [managedAsset.asset.id],
          managedAssets: [managedAsset],
          managedRelationships: [managedRelationship],
          evidence: []
        }]
      },
      readAdr: async () => ({ title: "Scope isolation", english: simpleEnglishAdr, chinese: simpleChineseAdr }),
      readExisting: async () => undefined
    });

    expect(callTool).toHaveBeenCalledWith("upsert_design_asset", {
      assetType: "api",
      asset: expect.objectContaining({ id: managedAsset.asset.id, architectureScope: scope }),
      architectureScope: scope
    });
    expect(callTool).toHaveBeenCalledWith("link_assets", { ...managedRelationship, architectureScope: scope });
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

  it("preserves localized narrative arrays from bold Chinese ADR section markers", async () => {
    const english = `# Scope isolation

## Context

English canonical context.

## Decision

English canonical decision.

## Alternatives

1. **Global scope.** Rejected.
2. **Web-only authorization.** Rejected.

## Consequences

- Scope remains explicit.
- MCP shares the boundary.

## Constraints

- Every write has a Scope.
- PostgreSQL remains authoritative.

## Evidence

- **Verified:** Focused test.
`;
    const chinese = `**中文本地化覆盖：**

**背景：** 中文规范背景。

**决策：** 中文规范决策。

**备选方案：**

1. **全局范围。** 拒绝。
2. **仅 Web 授权。** 拒绝。

**后果：**

- 范围保持明确。
- MCP 共享边界。

**约束：**

- 每次写入都有范围。
- PostgreSQL 保持权威。

**证据：**

- **已验证：** 针对性测试。
`;
    const callTool = vi.fn(async (name: string, input: Record<string, unknown>) => {
      if (name === "create_adr") validateAssetLocalization("adr", input.adr as Asset);
      return { ok: true };
    });

    await expect(synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          id: "adr-bold-zh-sections",
          repositoryAdr: "docs/adr/0001-scope.md",
          mcpAdrId: "adr-bold-zh-sections",
          scope,
          proposalId: "proposal-scope",
          contextPackId: "ctx-scope",
          relatedAssetIds: ["api-specforge-mcp-tools"],
          evidence: []
        }]
      },
      readAdr: async () => ({ title: "Scope isolation", english, chinese })
    })).resolves.toEqual([{ id: "adr-bold-zh-sections", mcpAdrId: "adr-bold-zh-sections", status: "complete" }]);
  });

  it("backfills stale proposal and Context Pack companions before linking ADR evidence", async () => {
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
        ? {
          id: "proposal-scope",
          title: "Existing proposal",
          name: "Existing proposal",
          description: "Existing description",
          background: "Existing background",
          goal: "Existing goal",
          nonGoal: "Existing non-goal",
          scope: "Existing scope",
          specChanges: ["Existing change"],
          risks: ["Existing risk"],
          rolloutPlan: "Existing rollout",
          localizedContent: {
            zh: {
              name: "鐜版湁鎻愭",
              title: "鐜版湁鎻愭",
              description: "鐜版湁鎻忚堪",
              background: "鐜版湁鑳屾櫙",
              goal: "鐜版湁鐩爣",
              nonGoal: "鐜版湁闈炵洰鏍?",
              scope: "鐜版湁鑼冨洿",
              specChanges: ["鐜版湁鍙樻洿"],
              risks: ["鐜版湁椋庨櫓"],
              rolloutPlan: "鐜版湁鍙戝竷"
            }
          }
        }
        : {
          id: "ctx-scope",
          proposalId: "proposal-shadow",
          name: "Existing context",
          summary: "Existing summary",
          constraints: ["Existing constraint"],
          instructions: ["Existing instruction"],
          generatedMarkdown: "# Existing context",
          localizedContent: {
            zh: {
              name: "鐜版湁涓婁笅鏂囧寘",
              summary: "鐜版湁鎽樿",
              constraints: ["鐜版湁绾︽潫"],
              instructions: ["鐜版湁鎸囦护"],
              generatedMarkdown: "# 鐜版湁涓婁笅鏂囧寘"
            }
          }
        }
    });

    expect(callTool).toHaveBeenCalledWith("upsert_proposal", expect.objectContaining({
      proposal: expect.objectContaining({
        id: "proposal-scope",
        title: "Existing proposal",
        localizedContent: expect.objectContaining({
          en: expect.objectContaining({
            title: "Existing proposal",
            description: "Existing description",
            goal: "Existing goal",
            specChanges: ["Existing change"],
            risks: ["Existing risk"]
          }),
          zh: expect.objectContaining({
            title: "鐜版湁鎻愭",
            description: "鐜版湁鎻忚堪"
          })
        })
      })
    }));
    expect(callTool).toHaveBeenCalledWith("upsert_context_pack", expect.objectContaining({
      contextPack: expect.objectContaining({
        id: "ctx-scope",
        proposalId: "proposal-scope",
        name: "Existing context",
        localizedContent: expect.objectContaining({
          en: expect.objectContaining({
            name: "Existing context",
            summary: "Existing summary",
            constraints: ["Existing constraint"],
            instructions: ["Existing instruction"]
          }),
          zh: expect.objectContaining({
            name: "鐜版湁涓婁笅鏂囧寘",
            summary: "鐜版湁鎽樿"
          })
        })
      })
    }));
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

  it("preserves an approved design as approved instead of claiming implementation", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    await synchronizeDesignFacts({
      callTool,
      manifest: { decisions: [{ ...federatedDecision, proposalStatus: "approved" }] },
      readAdr: async () => ({ title: "Federated Design-Fact Synchronization", english: federatedEnglishAdr, chinese: federatedChineseAdr }),
      readExisting: async () => ({ id: federatedDecision.proposalId, status: "implemented" })
    });

    expect(callTool).toHaveBeenCalledWith("upsert_proposal", expect.objectContaining({
      proposal: expect.objectContaining({ id: federatedDecision.proposalId, status: "approved" })
    }));
  });

  it("rejects unsupported localization overlays and canonical title overrides", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    await expect(synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          ...federatedDecision,
          localizedContent: { en: { status: "must fail" }, zh: { status: "must fail" } }
        }]
      },
      readAdr: async () => ({ title: "Federated Design-Fact Synchronization", english: federatedEnglishAdr, chinese: federatedChineseAdr }),
      readExisting: async () => undefined
    })).rejects.toThrow("DESIGN_FACT_LOCALIZATION_KEY_UNSUPPORTED: adr-federated-design-fact-synchronization:en.status");

    await expect(synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          ...federatedDecision,
          localizedContent: { en: { title: "Unsupported caller title" }, zh: { title: "Unsupported caller title" } }
        }]
      },
      readAdr: async () => ({ title: "Federated Design-Fact Synchronization", english: federatedEnglishAdr, chinese: federatedChineseAdr }),
      readExisting: async () => undefined
    })).rejects.toThrow("DESIGN_FACT_LOCALIZATION_CANONICAL_OVERRIDE");
  });

  it("merges validator-supported bilingual contract overlays and emits the sixth VALIDATES link", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    const evidence = Array.from({ length: 6 }, (_, index) => ({ command: `node test-${index + 1}`, result: `result-${index + 1}` }));
    await synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          ...federatedDecision,
          evidence,
          status: "MCP synchronization blocked",
          owner: "SpecForge Architecture",
          reason: "DATABASE_URL and exact Scope are unavailable.",
          retryTrigger: "Configure PostgreSQL and exact Scope, then run sync and read back.",
          auditFailureCode: "FEDERATION_TOOL_ERROR",
          auditDiagnosticReference: "diagnosticRef=<64-hex SHA-256 digest>",
          auditSecurityContract: "Raw exceptions and credential text are never persisted.",
          localizedContent: {
            en: {
              decision: "Audit failure contract: FEDERATION_TOOL_ERROR with diagnosticRef=<64-hex SHA-256 digest>; raw exceptions and credential text are never persisted.",
              constraints: ["MCP synchronization blocked. Owner: SpecForge Architecture. Reason: DATABASE_URL and exact Scope are unavailable. Retry trigger: configure PostgreSQL and exact Scope, run design-facts:sync, design-facts:check, federation check, then read back receipts."]
            },
            zh: {
              decision: "审计失败合同：FEDERATION_TOOL_ERROR 及 diagnosticRef=SHA-256 摘要；不得持久化原始异常或凭据文本。",
              constraints: ["MCP 同步受阻。负责人：SpecForge Architecture。原因：缺少 DATABASE_URL 和精确 Scope。重试触发：配置 PostgreSQL 和精确 Scope，运行 design-facts:sync、design-facts:check、联邦检查，然后读回回执。"]
            }
          }
        }]
      },
      readAdr: async () => ({ title: "Federated Design-Fact Synchronization", english: federatedEnglishAdr, chinese: federatedChineseAdr }),
      readExisting: async () => undefined
    });

    const adrCall = callTool.mock.calls.find(([name]) => name === "create_adr");
    const adr = adrCall?.[1]?.adr as { title: string; decision: string; constraints: string[]; localizedContent: { en: Record<string, unknown>; zh: Record<string, unknown> } };
    expect(adr.title).toBe("Federated Design-Fact Synchronization");
    expect(adr.decision).toContain("FEDERATION_TOOL_ERROR");
    expect(adr.constraints[0]).toContain("MCP synchronization blocked");
    expect(adr.localizedContent.en.decision).toContain("raw exceptions and credential text are never persisted");
    expect(adr.localizedContent.zh.decision).toContain("不得持久化原始异常或凭据文本");
    expect(Object.keys(adr.localizedContent.en).sort()).toEqual(["alternatives", "consequences", "constraints", "context", "decision", "description", "name", "title"]);
    expect(Object.keys(adr.localizedContent.zh).sort()).toEqual(["alternatives", "consequences", "constraints", "context", "decision", "description", "name", "title"]);
    expect(() => validateAssetLocalization("adr", adr as unknown as Asset)).not.toThrow();

    expect(callTool).toHaveBeenCalledWith("link_assets", expect.objectContaining({
      sourceType: "evidence",
      sourceId: "evidence-adr-federated-design-fact-synchronization-6",
      targetType: "adr",
      targetId: federatedDecision.mcpAdrId,
      relationType: "VALIDATES",
      architectureScope: scope
    }));
  });

  /* Legacy unsupported manifest overlay fixture retained in Slice 3D history.
  it.skip("legacy unsupported manifest overlay fixture", async () => {
    const callTool = vi.fn().mockResolvedValue({ ok: true });
    const evidence = Array.from({ length: 6 }, (_, index) => ({ command: `node test-${index + 1}`, result: `result-${index + 1}` }));
    await synchronizeDesignFacts({
      callTool,
      manifest: {
        decisions: [{
          ...federatedDecision,
          evidence,
          localizedContent: {
            en: {
              status: "MCP synchronization blocked",
              owner: "SpecForge Architecture",
              reason: "DATABASE_URL and exact Scope are unavailable.",
              retryTrigger: "Configure PostgreSQL and Scope, then run sync and read back.",
              auditFailureCode: "FEDERATION_TOOL_ERROR",
              auditDiagnosticReference: "diagnosticRef=<64-hex SHA-256 digest>",
              auditSecurityContract: "Raw exceptions and credential text are never persisted.",
              title: "Unsupported caller title",
              unsupported: "must not reach MCP"
            },
            zh: {
              status: "MCP 同步受阻",
              owner: "SpecForge Architecture",
              reason: "当前缺少 DATABASE_URL 和精确 Scope。",
              retryTrigger: "配置 PostgreSQL 和 Scope 后运行同步并回读。",
              auditFailureCode: "FEDERATION_TOOL_ERROR",
              auditDiagnosticReference: "diagnosticRef=<64 位十六进制 SHA-256 摘要>",
              auditSecurityContract: "不会持久化原始异常或凭据文本。",
              title: "不应覆盖的标题",
              unsupported: "不得写入 MCP"
            }
          }
        }]
      },
      readAdr: async () => ({ title: "Federated Design-Fact Synchronization", english: federatedEnglishAdr, chinese: federatedChineseAdr }),
      readExisting: async () => undefined
    });

    const adrCall = callTool.mock.calls.find(([name]) => name === "create_adr");
    const adr = adrCall?.[1]?.adr as { title: string; localizedContent: { en: Record<string, unknown>; zh: Record<string, unknown> } };
    expect(adr.title).toBe("Federated Design-Fact Synchronization");
    expect(adr.localizedContent.en).toMatchObject({
      status: "MCP synchronization blocked",
      owner: "SpecForge Architecture",
      auditFailureCode: "FEDERATION_TOOL_ERROR",
      auditDiagnosticReference: "diagnosticRef=<64-hex SHA-256 digest>",
      auditSecurityContract: "Raw exceptions and credential text are never persisted."
    });
    expect(adr.localizedContent.zh).toMatchObject({
      status: "MCP 同步受阻",
      auditFailureCode: "FEDERATION_TOOL_ERROR",
      auditSecurityContract: "不会持久化原始异常或凭据文本。"
    });
    expect(adr.localizedContent.en.title).toBe("Federated Design-Fact Synchronization");
    expect(adr.localizedContent.en).not.toHaveProperty("unsupported");
    expect(adr.localizedContent.en).not.toHaveProperty("title", "Unsupported caller title");

    expect(callTool).toHaveBeenCalledWith("link_assets", expect.objectContaining({
      sourceType: "evidence",
      sourceId: "evidence-adr-federated-design-fact-synchronization-6",
      targetType: "adr",
      targetId: federatedDecision.mcpAdrId,
      relationType: "VALIDATES",
      architectureScope: scope
    }));
  }); */
});
