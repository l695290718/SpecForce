# ADR-0017: Local Git Hook Change Attestation Gate

## Status

Accepted design. Local enforcement increment implemented; CodeArts/CodeHub enforcement remains deferred.

## Context

SpecForge currently provides an MCP design-context preflight and evidence-backed Design Change Session closure, but other users and coding Agents can still modify repositories without reading design assets. Repository instructions are cooperative rather than enforceable. The first distributable control must work across language stacks and prevent normal local commits that lack exact-Scope design coverage and convergence, while preserving CodeHub protected-branch enforcement as a later production control.

## Decision

Build the first enforcement increment as a standalone Go `specforge` CLI with an idempotently installed Git `pre-commit` dispatcher. The CLI reads `.specforge.yaml`, maps every staged path to one or more application-service IDs and their registered `scopePath` values, computes deterministic Git index evidence, and requests a short-lived Ed25519-signed Change Attestation from an authenticated remote MCP endpoint. The same CLI exposes `verify-commit --attestation <file>` for CI: it recomputes committed-tree evidence and delegates read-only verification to MCP.

The service resolves canonical `scopePath` values, applies server-owned policy, requires a valid Design Change Session for every exact Scope, requires complete design coverage and evidence, treats every reconciliation state other than `CONVERGED` as blocking, and atomically closes sessions and persists signed attestations, audit, and Outbox records. The CLI verifies the signature and staged tree before allowing the commit, while CI recomputes the committed tree and reads an attestation artifact supplied by the pipeline. CodeArts/CodeHub merge enforcement is deferred as a separately tracked backlog fact.

## Alternatives

1. Use only `AGENTS.md` and MCP prompts. Rejected because untrusted clients can ignore instructions.
2. Ship a TypeScript/npm Hook. Rejected for the first distributable control because enterprise repositories cannot be assumed to have Node.js.
3. Ship shell and PowerShell scripts. Rejected because cross-platform behavior, signing, credential storage, upgrades, and diagnostics would be fragile.
4. Implement CodeHub CI first. Deferred at the user's direction; the local protocol and developer workflow will be proven first.

## Consequences

- A single Windows/Linux binary supports Java, Go, Python, Node.js, and mixed Monorepos.
- Normal commits fail closed when design context, evidence, Scope authorization, reconciliation, server availability, or signatures are invalid.
- Shared files can require multiple exact application-service attestations in one commit.
- The first increment requires authenticated remote MCP transport and signing-key lifecycle in addition to the CLI.
- Local hooks remain bypassable with `--no-verify`; only the deferred CodeHub protected-branch gate can make enforcement repository-authoritative.

## Constraints

- The local first increment is implemented only within the reviewed boundaries; CodeHub enforcement still requires a separate approval and design change.
- `.specforge.yaml` may declare identity and mappings but cannot weaken server policy or contain credentials.
- `.specforge.yaml` may declare the server-registered `scopePath` for each mapped application service; an incorrect or missing path fails closed.
- PostgreSQL is authoritative for sessions, attestations, audit, and Outbox; graph stores remain derived.
- Every exact Scope must resolve server-side and have token authorization.
- Only `CONVERGED` reconciliation may pass; `UNVERIFIED` is blocking.
- Attestations use canonical JSON, Ed25519, key IDs, short expiry, and staged-tree binding.
- Hook logic is read-only with respect to Git index, code, and authored design facts.
- Human-facing records are English-canonical with complete Chinese localization.
- The remote MCP transport uses Streamable HTTP at `/mcp`; bearer authentication and the Ed25519 signing key are process configuration, never repository configuration.
- CI must receive the attestation through a pipeline/artifact channel; the local `.git/specforge/attestations` cache is not a repository-authoritative input.

## Evidence

- `pnpm design-context:preflight -- --intent "Design the standalone Go local Git hook and signed change-attestation gate; defer CodeHub enforcement." --affected "adr-design-context-preflight-gate" --evidence "bilingual design spec review,manifest validation,MCP design-fact synchronization and read-back"` opened session `design-change-session:4ad91d6a-e33c-46f3-bb3c-1d4987fedfb6` after reading 107 scoped assets and related links.
- The user approved the local Hook scope, `.specforge.yaml` model, signed attestation payload, strict failure policy, deferred CodeHub control, and standalone Go CLI during the design review.
- `vitest run scripts/design-fact-manifest.test.ts --exclude .worktrees/** --exclude .pnpm-store/**` passed one test file and eight tests, including explicit ADR-0017 registration and stable IDs.
- `go test ./...` in `apps/specforge-cli/` passed the standalone CLI tests in offline mode.
- `go build -o specforge.exe .` in `apps/specforge-cli/` produced the standalone Windows binary.
- `pnpm --filter @specforge/mcp-server typecheck` passed after adding HTTP MCP transport, attestation issuance, and scoped persistence.
- `vitest run apps/mcp-server/src/federation/tools.test.ts apps/mcp-server/src/federation/persistence.test.ts --exclude .worktrees/** --exclude .pnpm-store/**` passed 102 tests.
- `pnpm db:push` synchronized `ChangeAttestation` into the authoritative `localhost:15433/specforge_canonical` database.
- `pnpm design-facts:sync` returned `complete` for all 15 baseline decisions; `pnpm design-facts:check` returned empty `missing`, `mismatched`, `outOfScope`, and `blocked` lists with all 15 verified.
- `go test ./...` in `apps/specforge-cli` passed exact `scopePath` propagation and committed-tree blob-list tests; the temporary Windows CI verifier executable built successfully.

## MCP Record

- Matching MCP ADR ID: `adr-local-git-hook-change-attestation`
- Exact Scope: `com.huawei.celon.desiner` / `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- Matching Proposal: `proposal-local-git-hook-change-attestation`
- Matching Context Pack: `context-pack-local-git-hook-change-attestation`
- Related assets: `api-specforge-mcp-tools`, `data-specforge-assets`, `adr-design-context-preflight-gate`, `adr-federated-design-fact-synchronization`

## Chinese Localization

### 标题

本地 Git Hook 变更证明门禁

### 背景

SpecForge 已提供 MCP 设计上下文预检和带证据的 Design Change Session 关闭能力，但其他用户和 Coding Agent 仍可能在未读取设计资产的情况下修改仓库。仓库指令属于协作约束，不能形成强制执行。首个可分发控制必须跨技术栈工作，在缺少精确 Scope 设计覆盖和收敛证明时阻止普通本地提交，同时把 CodeHub 受保护分支强制校验保留为后续生产控制。

### 决策

第一增量采用独立 Go `specforge` CLI 和幂等安装的 Git `pre-commit` 分发器。CLI 读取 `.specforge.yaml`，把每个暂存路径映射到一个或多个应用服务 ID，计算确定性的 Git 暂存区证据，并通过鉴权远程 MCP 申请短时 Ed25519 签名的 Change Attestation。

服务端解析规范 `scopePath`、执行服务端策略、要求每个精确 Scope 都有有效 Design Change Session、完整设计覆盖和证据，并把除 `CONVERGED` 外的所有对账状态视为阻断。会话关闭、签名证明、审计和 Outbox 在一个事务中持久化。CLI 验证签名和暂存 tree 后才允许提交。CodeArts/CodeHub 合入门禁按用户要求延期，并作为独立待办跟踪。
同一个 CLI 还提供 `verify-commit --attestation <file>`：重新计算已提交 tree、父提交、变更文件清单、Scope 映射和精确 Scope 路径，再调用只读 MCP 校验。CI 必须通过流水线或批准的制品通道提供证明，本地 `.git/specforge/attestations` 缓存不作为仓库权威输入。

### 备选方案

1. 只使用 `AGENTS.md` 和 MCP Prompt：拒绝，因为不可信客户端可以忽略指令。
2. 使用 TypeScript/npm Hook：拒绝，因为企业存量仓库不能假设已安装 Node.js。
3. 使用 Shell 和 PowerShell 脚本：拒绝，因为跨平台行为、签名、凭据存储、升级和诊断不稳定。
4. 优先实现 CodeHub CI：按用户要求延期，先验证本地协议和开发体验。

### 后果

- 单个 Windows/Linux 可执行文件可覆盖 Java、Go、Python、Node.js 和混合 Monorepo。
- 设计上下文、证据、Scope 授权、对账、服务可用性或签名无效时，普通提交失败关闭。
- 公共文件可以要求一次提交同时具备多个精确应用服务证明。
- 第一增量除 CLI 外还需要最小鉴权远程 MCP 传输和签名密钥生命周期。
- 本地 Hook 仍可被 `--no-verify` 绕过，只有后续 CodeHub 受保护分支门禁能形成仓库权威控制。

### 约束

- 本地第一增量只在已评审边界内实现；CodeHub 门禁仍需独立批准和设计变更。
- `.specforge.yaml` 只能声明身份和映射，不能降低服务端策略或保存凭据。
- PostgreSQL 对会话、证明、审计和 Outbox 保持权威，图存储仍是派生投影。
- 每个精确 Scope 必须由服务端解析并具备 Token 授权。
- 只有 `CONVERGED` 对账可以通过，`UNVERIFIED` 必须阻断。
- 证明使用规范化 JSON、Ed25519、密钥 ID、短有效期和暂存 tree 绑定。
- Hook 对 Git 暂存区、代码和已编写设计事实保持只读。
- 面向人的记录以英文为规范内容，并提供完整中文本地化。
- 远程 MCP 使用 `/mcp` Streamable HTTP；Bearer 鉴权和 Ed25519 私钥由服务进程配置提供，不进入仓库配置。
- `.specforge.yaml` 可以声明每个应用服务注册的 `scopePath`；缺失或错误路径必须失败关闭。
- CI 必须通过流水线或制品通道接收变更证明；本地 `.git/specforge/attestations` 缓存不具备仓库权威性。

### 证据

- `pnpm design-context:preflight` 在精确 Designer Scope 下读取 107 条资产和相关关系，并创建会话 `design-change-session:4ad91d6a-e33c-46f3-bb3c-1d4987fedfb6`。
- 用户在设计评审中确认本地 Hook 范围、`.specforge.yaml` 模型、签名证明字段、严格失败规则、CodeHub 延期控制和 Go 单文件 CLI。
- `vitest run scripts/design-fact-manifest.test.ts --exclude .worktrees/** --exclude .pnpm-store/**` 通过 1 个测试文件和 8 项测试，包括 ADR-0017 显式登记及稳定 ID 校验。
- `go build -o specforge.exe .` 在 `apps/specforge-cli/` 生成了独立 Windows 可执行文件。
- `pnpm db:push` 已将 `ChangeAttestation` 同步到权威 `localhost:15433/specforge_canonical` 数据库。
- `pnpm design-facts:sync` 的 15 条基线决策全部返回 `complete`；`pnpm design-facts:check` 的 `missing`、`mismatched`、`outOfScope` 和 `blocked` 均为空，15 条全部 verified。
- `go test ./...` 在 `apps/specforge-cli` 通过精确 `scopePath` 传递和 committed-tree 文件清单测试；临时 Windows CI 校验器构建成功。
- `go test ./...`（`apps/specforge-cli`，仓库内 `GOCACHE`）通过 CLI 及全部内部包测试；临时 Windows 构建产物生成成功。
- PowerShell AST 解析通过 `deploy/scripts/new-attestation-key.ps1`、`deploy/scripts/start-mcp-http.ps1` 和 `deploy/scripts/start.ps1`；启动器在缺少 Bearer Token 时失败关闭。
- `specforge hook install` 的 Go 测试验证既有 Hook 保留、幂等重装和卸载恢复；无暂存变更返回 `NO_STAGED_CHANGES`。
