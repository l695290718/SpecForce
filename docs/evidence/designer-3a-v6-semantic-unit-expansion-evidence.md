# Evidence: Designer 3A Semantic Unit Expansion v6

English is canonical. Chinese is the human-facing localization.

## Scope and session

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Preflight session: `design-change-session:8d24d98b-c3de-490c-9b58-96e85c6abf02`
- Design-context digest: `4f6d0bb89595249bc5c1b3cffc156080f0f9d926218c7e0c02b004b41fd8cc32`
- Relationship digest: `86f22fca81d050efd28827d54545df5cff3ce91fab549aa25445963fbefc6a37`
- MCP ADR: `adr-readable-3a-architecture-mapping-v6`; Proposal: `proposal-readable-3a-architecture-mapping-v6`; Context Pack: `ctx-readable-3a-architecture-mapping-v6`; Evidence: `evidence-designer-3a-v6-semantic-unit-expansion`

## Implemented result

The v6 contract contains four candidate sources, four new semantic units, forty-two memberships, and six mappings. The published baseline is `knowledge-baseline:designer:3a:v6`, relationship version `7648`. The projection manifest is `projection-manifest:projection-generation:a5f2d9f6895b032648c4cab7dff81462aa36e2e9a406fffdec94562f7bd092ac:1`.

The four new units are `unit:sys:specforge-web-console`, `unit:sys:specforge-ai-generation-service`, `unit:sys:specforge-asset-graph-query-service`, and `unit:sys:specforge-mcp-audit-observability-service`. All belong to `unit:biz:specforge-governed-design-facts`. Only three new SYS-to-TECH `SERVICE_TO_TECHNOLOGY` mappings target `unit:tech:specforge-postgresql-authority`; same-layer Web Console calls remain typed asset relationships.

## Exact verification commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run scripts/designer-3a-v6-contract.test.ts` | 4 passed |
| `pnpm --filter @specforge/core typecheck` | exit 0 |
| `pnpm exec tsx scripts/publish-designer-3a-v6.ts` | baseline published; review bundle READY; decision APPROVE; reconciliation CONVERGED |
| `pnpm exec tsx scripts/process-designer-3a-v6-projection.ts` | projection READY; derived analysis PUBLISHED |
| `pnpm exec tsx scripts/verify-designer-3a-v6.ts` | READY; 8 units, 42 memberships, 6 mappings; `unclassifiedCount=0`; `fixtureHits=[]`; `scopeMatches=true` |
| `pnpm exec tsx scripts/verify-designer-3a-v5.ts` | READY; 4 units, 38 memberships, 3 mappings; regression passed |

The matching ADR, Proposal, Context Pack, Evidence, and typed links are synchronized through MCP in the exact owning Scope. The v6 session is closed only after write/read-back and the commands above.

## 证据：Designer 3A 语义单元扩充 v6

英文是规范字段，中文用于面向人的本地化展示。

### Scope 与会话

- 应用服务：`com.huawei.celon.desiner`
- Scope 路径：`pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- 预检会话：`design-change-session:8d24d98b-c3de-490c-9b58-96e85c6abf02`
- 设计上下文摘要：`4f6d0bb89595249bc5c1b3cffc156080f0f9d926218c7e0c02b004b41fd8cc32`
- 关系摘要：`86f22fca81d050efd28827d54545df5cff3ce91fab549aa25445963fbefc6a37`
- MCP ADR：`adr-readable-3a-architecture-mapping-v6`；Proposal：`proposal-readable-3a-architecture-mapping-v6`；Context Pack：`ctx-readable-3a-architecture-mapping-v6`；Evidence：`evidence-designer-3a-v6-semantic-unit-expansion`

### 已实现结果

v6 契约包含 4 个候选来源、4 个新增语义单元、42 个成员和 6 个映射。已发布基线为 `knowledge-baseline:designer:3a:v6`，关系版本为 `7648`，投影清单为 `projection-manifest:projection-generation:a5f2d9f6895b032648c4cab7dff81462aa36e2e9a406fffdec94562f7bd092ac:1`。

新增单元全部归属于 `unit:biz:specforge-governed-design-facts`；仅创建有证据支持的 3 条 SYS 到 TECH PostgreSQL 映射，同层 Web Console 调用仍保存为有类型资产关系。

### 收敛

对应 ADR、Proposal、Context Pack、Evidence 和有类型关系已经通过 MCP 在精确所属 Scope 中同步，并在上述命令验证后关闭 v6 会话。
