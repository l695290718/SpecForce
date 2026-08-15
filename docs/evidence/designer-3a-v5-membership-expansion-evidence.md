# Designer 3A v5 Membership Expansion Evidence

## Scope And Session

- Application service: `com.huawei.celon.desiner`
- Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Implementation session: `design-change-session:87996974-cab9-496d-84cd-9492518f0466`
- Written design: `docs/superpowers/specs/2026-08-15-designer-3a-v5-membership-expansion-design.md`
- Implementation plan: `docs/superpowers/plans/2026-08-15-designer-3a-v5-membership-expansion.md`

## MCP Authoring Evidence

`pnpm exec tsx scripts/publish-designer-3a-v5.ts` completed in the exact Scope.

- Read all ten candidate assets through MCP in `en` and `zh` locales.
- Read the persisted typed-link catalog through MCP and required at least one typed-link reference per candidate.
- Read the accepted, published v4 Baseline and its revision rows read-only from PostgreSQL.
- Submitted `architecture-fact-batch:designer:3a:coverage:v5` through `submit_3a_architecture_fact_batch`.
- Created `knowledge-review-bundle:designer:3a:coverage:v5` with `riskTier=T1`, `coverage.complete=true` for 10 declared sources, and 45 architecture-fact revision IDs; ReviewBundle status was `READY`.
- Approved `knowledge-promotion-decision:designer:3a:coverage:v5`.
- Promoted through `promote_3a_architecture_facts` and reconciled with status `CONVERGED`.
- Published `knowledge-baseline:designer:3a:v5` with status `PUBLISHED` and relationship version `7036`.

v5 contains exactly:

| Fact | Count |
| --- | ---: |
| Architecture units | 4 |
| Membership revisions | 38 |
| Mapping revisions | 3 |

The ten new memberships are:

- `api:api-specforge-asset-link`
- `event:event-specforge-asset-link-created`
- `event:event-specforge-design-asset-upserted`
- `event:event-specforge-mcp-tool-called`
- `businessRule:rule-specforge-mcp-write-audit`
- `businessRule:rule-specforge-relationships-required`
- `businessRule:rule-specforge-seed-through-mcp`
- `integration:integration-specforge-mcp-agent`
- `stateMachine:sm-specforge-context-pack-generation`
- `stateMachine:sm-specforge-proposal-lifecycle`

All ten belong to `unit:sys:specforge-mcp-governance-gateway`. No new unit, mapping, naming inference, cross-Scope fact, or direct PostgreSQL authoring was used.

## Projection And Readback Evidence

`pnpm exec tsx scripts/process-designer-3a-v5-projection.ts`:

- Requested `knowledge-baseline:designer:3a:v5` through MCP.
- Projection status: `READY`.
- Derived graph analysis status: `PUBLISHED`.
- Projection manifest: `projection-manifest:projection-generation:4540f8ea5c9d2715f65929eeacb26f1f6051a57431f78cee3cce83f165fefa6c:1`.

`pnpm exec tsx scripts/verify-designer-3a-v5.ts` now reads both public neighborhood MCP paths:

```text
status=READY
units=4
members=38
gatewayMembers=23
memberCount=38
mappings=3
directNeighborhoodStatus=READY
sharedNeighborhoodStatus=READY
directNeighborhoodMembers=23
sharedNeighborhoodMembers=23
neighborhoodMembersEqual=true
totalByLayer={BIZ:1,SYS:2,TECH:1}
unclassifiedCount=0
fixtureHits=[]
deferredHits=[]
missingExpected=[]
scopeMatches=true
```

The exact member lists were read through both public MCP neighborhood paths from the derived PostgreSQL projection and compared read-only. Both paths return the same 23 gateway members; no direct Prisma verification fallback remains.

## Repository Verification

- `pnpm typecheck` passed `@specforge/core`, `@specforge/knowledge-query`, `@specforge/knowledge-projector`, `@specforge/mcp-server`, and `@specforge/web`.
- `pnpm design-facts:sync` returned 23 ADR records with status `complete`.
- `pnpm design-facts:check` returned empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists and verified 23 ADR records.
- Focused governance tests passed 2 files and 33 tests.
- `pnpm typecheck` passed all five workspace packages.
- `git diff --check` exited 0 before session closure.

## Deferred Boundary

The nine `specforge-graph-verification-*` API fixtures remain in the catalog but are excluded from v5. `api-specforge-ai-generation`, `api-specforge-graph-query`, `api-specforge-web-console`, and `obs-specforge-mcp-audit` remain unclassified because they require separate architecture units. v5 does not claim enterprise-wide 3A completeness.

## 中文证据

- 本次实施严格限定在 `com.huawei.celon.desiner` Scope，使用实施会话 `design-change-session:87996974-cab9-496d-84cd-9492518f0466`。
- 10 个新增候选均通过 MCP 读取了英文规范内容、中文本地化内容和类型化关系；权威事实批次、评审、批准、提升、对账和 Baseline 发布均通过 MCP 完成。
- v5 回读结果为 4 个架构单元、38 个成员归属、3 条映射，投影为 `READY`，派生图分析为 `PUBLISHED`，未分类数为 0，Scope 匹配成功。
- 9 条图验证夹具和需要独立架构单元的延期资产没有被错误归入 v5；本阶段不宣称企业级全量覆盖。


## Dual MCP Neighborhood Verification

The v5 verification now uses both public MCP paths. The direct adapter and shared query service each returned 23 members for `unit:sys:specforge-mcp-governance-gateway`, and their sorted member identities were equal. PostgreSQL remained the read-model source through MCP; no direct Prisma fallback was used.

### 双 MCP 邻域验证

v5 验证现在使用两个公开 MCP 路径。直接适配器和共享查询服务都为 `unit:sys:specforge-mcp-governance-gateway` 返回 23 个成员，排序后的成员身份完全一致。PostgreSQL 仍通过 MCP 作为读取模型来源，没有使用直接 Prisma 回退。
