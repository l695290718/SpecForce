# ADR-0021: Parallel Governance Workstreams

## Status

**Accepted; implementation, focused local verification, MCP synchronization, read-back, and exact-Scope design-change-session closure are complete.**

- Stable ID: `adr-parallel-governance-workstreams`
- Owning application service: `com.huawei.celon.desiner`
- Owning Scope path: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Design Change Session: `design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb`
- Follow-up Design Change Session: `design-change-session:9f97d614-52e2-479c-9699-c8a3220853c2`
- Exact-Scope follow-up: `design-change-session:c4b5a809-d486-4a91-a3fb-d3b47788b3ad`

## Context

SpecForge already has exact application-service Scope isolation, MCP preflight/closure, a local Go Git Hook, and signed Change Attestations. Production adoption needs a stronger identity boundary and a repository-authoritative CI verification contract, but CodeHub/CodeArts and enterprise identity providers are external integrations that must not be implied by local code.

The three approved increments can be developed independently when they share only stable interfaces: principal normalization, attestation verification, and design-fact records. PostgreSQL remains authoritative for authored facts and audit evidence.

## Decision

### ScopedPrincipal boundary

Core now defines a provider-neutral `ScopedPrincipal` containing actor type, stable subject, tenant, authentication source, exact Scope grants, permissions, and an audit-safe decision reference. `normalizePrincipalClaims` validates and deduplicates claims. `authorizePrincipalScope` requires an exact application-service grant and does not inherit parent or sibling grants for a production application-service operation.

MCP normalizes HTTP and stdio claims through this boundary. Static bearer claims remain a development/provider-neutral transport contract; seed claims are accepted only in explicit seed mode. Raw tokens are never placed in the normalized principal or persisted as audit content. A real OAuth/OIDC provider and enterprise tenant administration remain deferred.

### CI Change Attestation verification

MCP now exposes read-only `verify_change_attestation`. It verifies the signed canonical payload, repository identity, parent commit when supplied, committed tree, file manifest, Scope mapping, expiry, trusted/revoked key policy, signature, complete multi-Scope coverage, and every referenced Design Change Session and reconciliation state. Every submitted Scope must be separately readable by the caller. The operation does not mutate authored facts, close sessions, or contact CodeHub.

The Go CLI performs the same repository/evidence and multi-Scope coverage checks before caching a local attestation. CodeHub/CodeArts protected-branch status registration and mandatory merge blocking remain deferred.

### Design-fact reconciliation

Repository records distinguish implemented local governance contracts from deferred production delivery. Phase 3 continuous-observation governance remains complete; concrete live connectors, automatic promotion, outbound proposals, external `APPLY`, real IdP integration, CodeHub adapters, graph projection closure, and billion-scale certification remain deferred until separately designed and evidenced.

## Alternatives

1. **Keep raw token claims in every MCP tool.** Rejected because each tool would reimplement identity parsing and could persist provider-specific credential data.
2. **Build the CodeHub adapter before a provider-neutral verifier.** Rejected because it would couple governance semantics to one repository platform and make local/CI evidence diverge.
3. **Allow parent Scope grants to authorize child application-service writes.** Rejected because production write authority must be explicit at the smallest writable dimension.
4. **Treat local tests or repository documents as the system of record.** Rejected because MCP synchronization, PostgreSQL persistence, typed links, and read-back are required for completion.

## Consequences

- Claude Code, OpenCode, local Hooks, and future CI providers can share one normalized identity and attestation contract.
- A token may carry multiple application-service grants, but every operation evaluates one exact Scope and every CI verification checks all required Scopes.
- Invalid or stale evidence fails closed with deterministic client-safe error codes.
- CodeHub integration and enterprise identity deployment remain explicit backlog items rather than accidental claims.
- Existing compatibility reads and development seed workflows remain available only in their existing explicit development boundaries.

## Constraints

- All authored writes remain MCP-only and exact-Scope.
- PostgreSQL remains authoritative; graph stores are derived projections.
- Seed identity is development-only; no raw credential is persisted.
- CodeHub/CodeArts adapters, enterprise IdP integration, cross-Scope comparison, external `APPLY`, and graph projection closure remain deferred.
- English is canonical and all human-facing decision records require complete Chinese localization.

## Evidence

- `pnpm design-context:preflight -- --intent "Implement the approved parallel workstreams: production ScopedPrincipal authorization foundation, provider-neutral CodeHub attestation verification contract, and design-fact backlog/documentation reconciliation." --affected "adr-design-context-preflight-gate,adr-local-git-hook-change-attestation,adr-application-service-scope-isolation" --evidence "approved-parallel-workstreams,existing-auth-and-attestation-contract-review,backlog-and-ADR-status-review"` opened `design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb` in the exact Designer Scope and read 158 assets.
- `pnpm --filter @specforge/core typecheck` passed; Core tests passed 20 files and 167 tests, including six ScopedPrincipal cases.
- `pnpm --filter @specforge/mcp-server typecheck` passed; focused MCP authentication and federation tests passed 2 files and 41 tests.
- `pnpm --filter @specforge/mcp-server exec vitest run src/federation/attestation-verification.test.ts src/federation/tools.test.ts` passed 2 files and 42 tests.
- `go test ./...` in `apps/specforge-cli` passed all CLI and internal package tests, including repository mismatch and incomplete multi-Scope coverage cases.
- `SPECFORGE_DESIGN_FACT_IDS=adr-parallel-governance-workstreams pnpm design-facts:sync` persisted the ADR, Proposal, Context Pack, Evidence, and typed links in the exact Designer Scope.
- `pnpm design-facts:check` verified all 19 ADR decisions with empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists.
- `$env:SPECFORGE_APPLICATION_SERVICE_ID='com.huawei.celon.desiner'; $env:SPECFORGE_SCOPE_PATH='pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner'; pnpm design-facts:federation:check` returned `blocking:false` with empty issue counts for the canonical full Scope path.
- `pnpm design-context:close -- --session design-change-session:81cc9275-ce22-417b-a467-57c5b07be6bb --status CONVERGED --evidence "core-typecheck=PASS,mcp-typecheck=PASS,focused-tests=5-files-61-tests,go-tests=PASS,manifest-check=PASS,design-facts-check=19-verified,federation-check=blocking-false"` returned the same exact Scope with status `CONVERGED`.
- Follow-up preflight `design-change-session:9f97d614-52e2-479c-9699-c8a3220853c2` read 165 scoped assets before propagating the principal through ordinary MCP tools and persistence.
- `pnpm --filter @specforge/mcp-server typecheck; pnpm --filter @specforge/mcp-server exec vitest run src/auth.test.ts src/tools.test.ts src/persistence.test.ts src/federation/tools.test.ts` passed 4 files and 97 tests.
- `pnpm design-context:close -- --session design-change-session:9f97d614-52e2-479c-9699-c8a3220853c2 --status CONVERGED --evidence "mcp-typecheck=PASS,principal-context-tests=4-files-97-tests,design-facts-check=19-verified,federation-check=blocking-false"` returned the exact Designer Scope with status `CONVERGED`.
- Exact-Scope follow-up preflight `design-change-session:c4b5a809-d486-4a91-a3fb-d3b47788b3ad` read 165 assets before tightening normalized-principal persistence reads and writes to exact application-service grants.
- `pnpm --filter @specforge/mcp-server typecheck; pnpm --filter @specforge/mcp-server exec vitest run src/auth.test.ts src/persistence.test.ts src/federation/tools.test.ts` passed 3 files and 75 tests, including parent-Scope denial.
- `pnpm design-context:close -- --session design-change-session:c4b5a809-d486-4a91-a3fb-d3b47788b3ad --status CONVERGED --evidence "mcp-typecheck=PASS,exact-scope-tests=3-files-75-tests,design-facts-check=19-verified,federation-check=blocking-false"` returned the exact Designer Scope with status `CONVERGED`.

## Chinese Localization

### 状态

**已接受；代码实现、针对性本地验证、MCP 同步、回读和精确 Scope 设计变更会话关闭均已完成。**

### 背景

SpecForge 已具备精确应用服务 Scope 隔离、MCP 预检与关闭、本地 Go Git Hook 和签名变更证明。本决策增加与身份提供商无关的 `ScopedPrincipal` 以及只读 CI 变更证明校验契约，同时把 CodeHub/CodeArts 和企业身份提供商集成保持为独立待办。

### 决策

Core 负责主体标准化和精确 Scope 授权；MCP 负责鉴权边界和审计安全上下文。`verify_change_attestation` 校验签名、仓库、父提交、提交树、文件清单、Scope 映射、有效期、密钥信任/撤销状态、多 Scope 覆盖、设计变更会话和对账状态。每个 Scope 都必须分别具备读取权限，校验过程不会修改设计资产、关闭会话或调用 CodeHub。

### 备选方案

- 不采用在每个 MCP 工具中重复解析原始 Token，因为这会造成身份逻辑分散和凭据泄露风险。
- 不先绑定 CodeHub 平台，因为本地 Hook、其他 CI 平台和 CodeHub 应共享同一验证契约。
- 不把父级 Scope 自动当作应用服务写权限，因为生产写入必须在最小维度显式授权。
- 不把本地测试或仓库文档当作唯一事实来源，因为完成条件还包括 MCP 持久化、关系和回读。

### 后果

- Claude Code、OpenCode、本地 Hook 和未来 CI 提供商可以共享标准化身份与变更证明契约。
- 无效或过期证据会以确定性错误失败关闭。
- CodeHub 适配器和企业身份部署仍是明确的待办，而不是隐含交付。
- 现有兼容性读取和开发 Seed 流程仍只在显式开发边界内可用。
- 跨 Scope 比较、外部 `APPLY`、图投影闭环和亿级容量认证仍需独立设计、取证和同步。

### 约束

- 所有已编写事实仍只能通过 MCP 写入，并且必须使用精确 Scope。
- PostgreSQL 保持权威，图数据库只能作为派生投影。
- Seed 身份只允许开发模式，原始凭据不得持久化。
- CodeHub/CodeArts 适配器、企业身份集成、跨 Scope 比较、外部 `APPLY` 和图投影闭环继续延期。
- 英文是规范字段，所有面向人的决策记录必须提供完整中文覆盖。

### 证据

- Core 类型检查和 167 个测试通过。
- MCP 类型检查、认证/联邦测试和 Attestation 测试通过。
- Go CLI 全套测试通过，包含仓库证据不匹配和多 Scope 覆盖不足场景。
- MCP 同步、回读、精确 Scope 对账和同一会话 `CONVERGED` 关闭完成后，本 ADR 才最终完成。
