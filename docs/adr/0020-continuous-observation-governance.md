# ADR-0020: Continuous Observation Governance

## Status

**Accepted; the Phase 3 governance core and provider-neutral local-repository connector increment are implemented, locally verified, MCP synchronized, and read back in the exact owning Scope.**

- Stable ID: `adr-continuous-observation-governance`
- Owning application service: `com.huawei.celon.desiner`
- Owning scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Related decision: `adr-unified-3a-knowledge-initialization`

## Context

Phase 2 can derive deterministic BIZ, SYS, and TECH views from a published Baseline. Phase 3 needs a durable receiving boundary for Agents and future live connectors. A connector must be able to resume after a process or network failure without silently dropping, reordering, or duplicating observations. The receiving boundary must remain exact-Scope and must not turn an observation into an authoritative design fact.

## Decision

Add a provider-neutral `continuous-observation/v1` MCP contract. Each connector and source namespace has one exact-Scope PostgreSQL stream with:

- a monotonic sequence and previous-batch digest;
- a deterministic payload and batch digest;
- bounded batch size and canonical byte size;
- a durable batch acceptance receipt for idempotent retries; and
- a durable cursor containing the last accepted sequence, digest, source cursor, and freshness.

`submit_continuous_observation_batch` validates the contract, exact Scope, active connector, `OBSERVE` capability, digest, sequence chain, duplicate identities, and budgets in one serializable PostgreSQL transaction. Accepted observations are persisted in the existing `SourceObservation` table as `CANDIDATE` records and an existing federation outbox event is appended in the same transaction. `get_continuous_observation_cursor` is a read-only exact-Scope checkpoint query.

The governance core does not promote candidates, merge Scopes, issue outbound Proposals, or execute external `APPLY`. The first connector delivery increment is intentionally limited to a local repository source: it reuses the Phase 1 scanner/extractor, produces deterministic paged observations, resumes from a snapshot cursor, and submits only through the exact-Scope MCP receiving boundary. Database, API gateway, CMDB, runtime, polling, and webhook adapters remain separate delivery increments.

### Provider-neutral connector runtime

`@specforge/core` now owns the connector lifecycle and delivery runtime. It validates the exact Scope and the registered connector's `OBSERVE` capability, reads the durable PostgreSQL cursor through the MCP bridge, builds the hash-chained batch, submits it through the existing continuous-observation persistence boundary, and applies bounded exponential backoff for transient failures. Terminal Scope, connector, capability, and contract failures close the runtime without retrying.

`apps/mcp-server` provides the persistence bridge and a local-repository source adapter. `apps/specforge-cli observe` reuses the signed native scanner and extractor to emit `READY_FOR_MCP_SUBMIT` batches for an operator or Agent to deliver through MCP. The adapter never writes PostgreSQL directly, never promotes a candidate, and never crosses the owning Scope.

## Alternatives

1. **Keep only an in-memory cursor.** Rejected because restart recovery and multi-instance delivery would be unsafe.
2. **Let each connector write SourceObservation directly without a batch receipt.** Rejected because sequence gaps, replay conflicts, and operator diagnosis would be ambiguous.
3. **Make the graph store the cursor authority.** Rejected because PostgreSQL is the transactional authority and graph storage is a derived projection.
4. **Automatically promote every accepted observation.** Rejected because observation, semantic review, authority policy, and Baseline publication are distinct governance steps.

## Consequences

- Claude Code, OpenCode, and future connector adapters can share one resumable MCP delivery contract.
- Retries of an identical sequence are idempotent; conflicting sequence reuse, gaps, broken chains, duplicate identities, and oversized batches fail closed.
- Source observations remain candidates and the active Baseline remains unchanged until the existing review and promotion flow converges.
- PostgreSQL retains the cursor, receipt, observation, and outbox atomically; graph projection can consume the outbox later.
- Specific database, API gateway, CMDB, and runtime adapters still need their own contracts and evidence.

## Constraints

- Every batch carries the exact application-service Scope and is authorized by the caller's exact Scope grant.
- The contract is capped at 500 observations and 4 MiB canonical bytes per batch.
- One stream is keyed by exact Scope, connector, and source namespace.
- English contract identifiers remain canonical; human-facing Proposal and Context Pack records require complete Chinese overlays.
- No cross-Scope read or write, automatic promotion, external `APPLY`, or graph-authoritative write is introduced.

## Evidence

- `pnpm db:generate` completed and generated Prisma Client for the cursor and batch models.
- `pnpm db:push` completed: PostgreSQL `specforge_canonical` at `localhost:15433` is in sync with `prisma/schema.prisma`.
- `pnpm --filter @specforge/core typecheck` passed.
- `pnpm --filter @specforge/mcp-server typecheck` passed.
- `node .\\node_modules\\vitest\\vitest.mjs run --root . --exclude .worktrees/** --exclude .pnpm-store/** packages/core/src/__tests__/continuous-observation.test.ts apps/mcp-server/src/federation/tools.test.ts` passed 2 files and 41 tests.
- `$env:DATABASE_URL=(Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1).Substring(14).Trim('"'); $env:SPECFORGE_CONTINUOUS_INTEGRATION='1'; node .\\node_modules\\vitest\\vitest.mjs run --root . --exclude .worktrees/** --exclude .pnpm-store/** apps/mcp-server/src/federation/continuous-persistence.integration.test.ts` passed the real PostgreSQL transaction test for first acceptance, idempotent retry, cursor read-back, sequence-gap rejection, and cleanup.
- `Invoke-WebRequest -UseBasicParsing http://localhost:3000/` returned HTTP 200.
- `pnpm --filter @specforge/core typecheck` passed; the focused connector suite passed 1 file and 8 tests.
- `pnpm --filter @specforge/mcp-server typecheck` passed; the focused MCP connector suites passed 2 files and 5 tests.
- `$env:GOCACHE = '<workspace>/.tmp/go-build'; go test ./...` from `apps/specforge-cli` passed all CLI and connector packages.
- `git diff --check` passed for the connector increment.

## Connector Increment Evidence

- `apps/specforge-cli observe --connector-id local-repository --scope-path <exact-scope>` emits deterministic `READY_FOR_MCP_SUBMIT` batches or `IDLE`; it does not bypass MCP.
- The provider-neutral runtime tests cover durable cursor resume, idempotent receipts, sibling-Scope rejection, capability denial, bounded backoff, and lifecycle stop.
- Concrete external database, API gateway, CMDB, runtime, polling, webhook, candidate-promotion, outbound Proposal, and external `APPLY` delivery remain deferred and require their own design facts and acceptance evidence.

## MCP Record

- Matching MCP ADR ID: `adr-continuous-observation-governance`
- Exact owning Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-continuous-observation-governance`
- Matching Context Pack: `context-pack-continuous-observation-governance`
- Required typed links: Proposal `IMPLEMENTS_DECISION` ADR; Context Pack `IMPLEMENTS_CONTEXT_FOR` Proposal; Evidence `VALIDATES` ADR; ADR `DECIDES` MCP tools and observation storage.
- MCP status: synchronized and read back. The latest full reconciliation verified all 19 decisions with empty missing, mismatched, out-of-scope, and blocked lists; the exact Designer federation check returned `blocking:false`.

## Chinese Localization

### 状态

已接受；第三阶段治理核心增量已实现、完成本地验证，并已在精确所属 Scope 中通过 MCP 同步和回读。

### 背景

第二阶段可以从已发布 Baseline 派生确定性的 BIZ、SYS、TECH 视图。第三阶段需要为 Agent 和未来实时连接器提供持久化接收边界。连接器在进程或网络故障后必须能够恢复，不能静默丢失、乱序或重复观察结果；接收边界必须保持精确 Scope，也不能把观察结果直接变成权威设计事实。

### 决策

新增与提供方无关的 `continuous-observation/v1` MCP 契约。每个连接器和来源命名空间在精确 Scope 下拥有一条 PostgreSQL 流，记录单调序号、前一批摘要、确定性摘要、批次收据和可恢复游标。`submit_continuous_observation_batch` 在一个可串行化 PostgreSQL 事务中校验精确 Scope、连接器状态、`OBSERVE` 能力、摘要、序列链、重复身份和预算；接收结果复用现有 `SourceObservation` 表并保持 `CANDIDATE` 状态，同时写入现有联邦 Outbox。`get_continuous_observation_cursor` 只读返回精确 Scope 的检查点。

本增量不执行连接器、不主动访问外部系统、不提升候选、不跨 Scope 合并、不生成出站 Proposal，也不执行外部 `APPLY`；这些能力仍需独立交付和取证。

### 备选方案

- 仅保存不持久化游标：拒绝，因为重启后和多实例处理不安全。
- 让各个连接器直接写入 SourceObservation：拒绝，因为无法提供序列、重试和运维诊断。
- 让图数据库作为游标权威：拒绝，因为 PostgreSQL 才是事务权威，图数据库只是派生投影。
- 接收观察后自动提升：拒绝，因为观察、语义评审、权威策略和 Baseline 发布是不同的治理步骤。

### 后果

- 相同序号和相同内容的重试是幂等的；跳号、断链、冲突重放、重复身份和超预算请求都会失败关闭。
- PostgreSQL 原子保存游标、收据、观察结果和 Outbox；图数据库只能消费 Outbox 形成派生投影。
- 每批最多 500 条观察、最多 4 MiB 规范化字节；连接器、来源命名空间和精确 Scope 共同确定流。
- 英文契约标识是规范字段，面向人的 Proposal 和 Context Pack 必须具备完整中文覆盖。
- 具体数据库、API 网关、CMDB 和运行时适配器仍需要各自的契约与证据。

### 约束

- 每个批次必须携带精确应用服务 Scope，并由调用方的精确 Scope 授权。
- 每批最多 500 条观察，最多 4 MiB 规范化字节；连接器、来源命名空间和精确 Scope 共同确定流。
- 一条流由精确 Scope、连接器和来源命名空间共同确定。
- 英文契约标识是规范字段，面向人的 Proposal 和 Context Pack 必须具备完整中文覆盖。
- 不引入跨 Scope 读写、自动提升、外部 `APPLY` 或图数据库权威写入。

### 证据

- `pnpm db:generate` 成功生成新增游标和批次模型的 Prisma Client。
- `pnpm db:push` 成功将 `specforge_canonical@localhost:15433` 同步到 Prisma Schema。
- Core、MCP Server 类型检查通过；阶段三聚焦测试通过 2 个文件、41 项测试；Web 服务返回 HTTP 200。

### MCP 记录

- 匹配 MCP ADR ID：`adr-continuous-observation-governance`。
- 精确所属 Scope：`com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`。
- 最新完整对账已核验全部 19 项决策，缺失、不匹配、越界和阻塞列表均为空；精确 Designer Scope 联邦检查返回 `blocking:false`。

## References

- `docs/superpowers/plans/2026-08-03-continuous-observation-governance.md`
- `docs/adr/0018-unified-3a-knowledge-initialization.md`

## Chinese Localization: Connector Increment

本次增量已完成提供方无关的连接器运行时和本地仓库适配器。运行时会在精确 Scope 下读取 PostgreSQL 游标、校验 `OBSERVE` 能力、生成可恢复的哈希链批次，并且只通过 MCP 持久化边界提交。`specforge-cli observe` 复用既有扫描与提取能力，输出 `READY_FOR_MCP_SUBMIT` 或 `IDLE`，不会绕过 MCP 直接写库，也不会提升候选事实。

数据库、API 网关、CMDB、运行时、轮询、Webhook、候选提升、出站 Proposal 和外部 `APPLY` 仍然是独立待办，必须分别设计、取证并完成 Scope 内同步后才能实现。
