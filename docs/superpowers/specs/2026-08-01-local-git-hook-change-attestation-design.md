# Local Git Hook Change Attestation Gate

## Status

Accepted design. The local enforcement increment is implemented; CodeArts/CodeHub protected-branch enforcement remains deferred.

- Owning `architectureScope.applicationServiceId`: `com.huawei.celon.desiner`
- Owning `architectureScope.scopePath`: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner`
- First increment: standalone local Git `pre-commit` gate
- Deferred increment: CodeArts/CodeHub protected-branch enforcement

## Goal

Provide a framework-independent local gate that prevents a normal Git commit unless the staged change is mapped to exact application-service Scopes, covered by current design assets, backed by Design Change Sessions and verification evidence, reconciled as `CONVERGED`, and bound to a short-lived SpecForge-signed Change Attestation.

The local gate improves developer and Agent behavior but is not an absolute repository guarantee because Git permits `--no-verify`. CodeHub enforcement remains a separately tracked production control.

## Architecture

The first increment has three independently replaceable components:

1. **SpecForge governance service.** The authenticated remote MCP endpoint resolves exact Scopes, evaluates server-owned policy, checks design coverage and reconciliation, closes matching sessions, and signs attestations. PostgreSQL remains authoritative.
2. **Standalone Go CLI.** `specforge` computes deterministic Git evidence, reads repository mapping, invokes the remote MCP tools, verifies the returned Ed25519 signature, and installs a minimal hook dispatcher.
3. **Repository configuration.** `.specforge.yaml` contains repository identity and path-to-application-service mappings. It contains no credentials and cannot weaken server policy.

The CLI lives under `apps/specforge-cli/` with bounded packages for configuration, Git evidence, MCP transport, attestation verification, credential storage, and hook lifecycle. The server exposes only the minimum authenticated remote MCP tool set required for repository enrollment, preflight, attestation issuance, key discovery, and status checks.

## Repository Configuration

```yaml
version: 1
repository:
  id: codehub://enterprise/project/specforge
  defaultApplicationServiceId: com.huawei.celon.desiner
scopeMappings:
  - paths: ["apps/designer/**", "packages/designer-core/**"]
    applicationServiceIds: ["com.huawei.celon.desiner"]
  - paths: ["apps/policyhub/**"]
    applicationServiceIds: ["com.huawei.celon.policyhub"]
  - paths: ["package.json", "pnpm-lock.yaml", "deploy/**"]
    applicationServiceIds:
      - com.huawei.celon.desiner
      - com.huawei.celon.policyhub
```

Configuration stores application-service IDs only. The server resolves stored `scopePath` values and verifies exact token grants. Unmapped paths, ambiguous mappings, parent-level mappings, unknown services, and repository-identity mismatch fail closed. A configuration-file change affects every mapped service. Exemptions can reference only server-approved policy IDs.

## Git Evidence

`specforge verify-staged` reads the Git index without modifying it. It records the repository identity, parent commit, deterministic staged tree hash, sorted manifest of path/file-mode/blob hashes, and the `.specforge.yaml` digest. It computes the staged tree before and after remote verification; any difference fails with a race diagnostic.

For a Monorepo, one file may map to multiple application services. Every resulting exact Scope needs its own valid session and coverage decision. A failure in any Scope blocks the complete commit.

## Change Attestation

The server signs canonical JSON using Ed25519. The signed payload contains:

- schema version, attestation ID, issuer, key ID, issue time, expiry, and policy version;
- repository ID, parent commit, staged tree hash, file-manifest digest, and scope-mapping digest;
- actor ID and exact resolved Scopes;
- per-Scope Design Change Session ID, affected fact IDs, design-context digest, relationship digest, reconciliation root, and `CONVERGED` status; and
- verification-evidence digest.

The attestation contains no source code, token, credential, or raw command output. The default validity window is 30 minutes. Any staged-file, mapping, design-context, relationship, reconciliation-root, policy, or signing-key change invalidates the attestation. Key discovery and rotation use stable key IDs; revoked keys are rejected.

Attestation issuance and session closure occur in one PostgreSQL transaction with audit and Outbox records. The CLI verifies the signature using trusted enterprise key metadata and caches the proof under `.git/specforge/attestations/`, outside commit history.

## Commands

```text
specforge login
specforge hook install
specforge hook uninstall
specforge hook doctor
specforge verify-staged
specforge status
```

`hook install` preserves an existing hook by installing or updating a small dispatcher rather than replacing unrelated commands silently. Repeated installation is idempotent. `hook doctor` reports binary version, repository mapping, credentials, server reachability, trusted keys, hook installation, and current Scope access without mutating repository state.

## Failure Policy

The hook fails closed for invalid configuration, unmapped or ambiguous paths, unauthorized Scope, missing or stale session, incomplete design coverage, incomplete bilingual human-facing facts, missing relationships or evidence, any reconciliation state other than `CONVERGED`, server unavailability, timeout, invalid or expired signature, revoked key, changed Git index, and partial failure in a multi-Scope change.

The hook never stages files, edits code, creates design assets, promotes candidates, or repairs reconciliation. It emits a concise human message plus a stable machine code. Remote retries are bounded. Server policy owns enforcement strength; repository configuration cannot lower it.

## Security

- Remote MCP requires TLS and authenticated short-lived bearer tokens.
- One token may grant multiple application services, but every operation targets exact resolved Scopes.
- Tokens are stored in the operating-system credential store, never in `.specforge.yaml` or Git configuration.
- Audit records store stable identities and digests, not secrets or raw source.
- Local seed-mode identity is development-only and cannot be accepted by remote or production transport.

## Deferred CodeHub Enforcement

CodeArts/CodeHub protected-branch enforcement is a separate backlog feature. It will recompute the committed tree, verify the attestation using a CI service identity, detect `--no-verify`, and require the SpecForge result before merge. The local Hook must not claim to make bypass impossible until this increment is delivered.

## Verification Strategy

Implementation requires focused tests for configuration parsing, single-service and Monorepo mapping, overlapping paths, Git tree determinism, index race detection, exact-Scope authorization, `UNVERIFIED` blocking, session/attestation transactionality, Ed25519 signing and rotation, credential redaction, existing-hook preservation, idempotent installation, offline failure, and `--no-verify` detection in the deferred CodeHub fixture.

## Chinese Localization

### 状态

设计已确认，本地门禁第一增量已实现。第一增量交付本地 `pre-commit`、HTTP MCP 签发、PostgreSQL 证明持久化和 Ed25519 验签；CodeArts/CodeHub 受保护分支强制校验继续作为独立待办。

### 目标

提供与项目技术栈无关的本地提交门禁。只有当暂存变更映射到精确应用服务 Scope、由当前设计资产覆盖、具备 Design Change Session 和验证证据、对账状态为 `CONVERGED`，并绑定到 SpecForge 短时签名的 Change Attestation 时，普通 Git 提交才能继续。

本地 Hook 能显著约束开发者和 Agent，但 Git 允许 `--no-verify`，因此它不是绝对的仓库保证。不可绕过的控制必须由后续 CodeHub 门禁完成。

### 架构

第一增量由三个可独立替换的组件构成：SpecForge 治理服务负责精确 Scope、服务端策略、覆盖度、对账、会话关闭和证明签名；Go 单文件 CLI 负责 Git 确定性证据、MCP 调用、签名验证和 Hook 生命周期；`.specforge.yaml` 只负责仓库身份及路径到应用服务的映射，不保存凭据，也不能降低服务端策略。

CLI 位于 `apps/specforge-cli/`，按配置、Git 证据、MCP 传输、证明验证、凭据存储和 Hook 生命周期划分边界。服务端仅开放仓库登记、预检、证明签发、密钥发现和状态检查所需的最小远程 MCP 工具集。

本地实现使用 Streamable HTTP `/mcp`，通过 bearer Token 鉴权；Token 由 Git credential helper 保存，Ed25519 PKCS#8 私钥由服务进程配置提供。Session ID 必须由治理预检产生并显式配置，Hook 不会自行推断或绕过会话治理。

### 仓库配置与 Scope

单服务仓库可使用默认应用服务；Monorepo 通过路径映射到一个或多个应用服务。配置只保存应用服务 ID，`scopePath` 由服务端根据预维护架构解析并核验 Token 授权。未映射路径、歧义映射、父层级映射、未知服务或仓库身份不匹配都必须失败关闭。修改配置文件本身会影响全部已映射服务。豁免只能引用服务端批准的策略 ID。

### Git 证据与签名证明

`specforge verify-staged` 只读 Git 暂存区，记录仓库身份、父提交、暂存 tree hash、排序后的路径/文件模式/blob hash 清单以及配置摘要。远程校验前后各计算一次 tree hash，任何变化都按竞争条件失败。

服务端使用 Ed25519 对规范化 JSON 签名。证明绑定仓库、父提交、暂存 tree、文件清单、Scope 映射、操作身份、精确 Scope、会话、受影响事实、设计与关系摘要、对账根、策略版本和证据摘要，不包含源码、Token、凭据或原始命令输出。默认有效期为 30 分钟。证明签发、会话关闭、审计和 Outbox 在一个 PostgreSQL 事务中完成，CLI 验签后只在 `.git/specforge/attestations/` 缓存。

### 失败规则与安全

无效配置、路径未映射或歧义、Scope 未授权、会话缺失或过期、设计覆盖不足、双语事实不完整、关系或证据缺失、对账不是 `CONVERGED`、服务不可达、签名无效或过期、密钥撤销、暂存区变化以及多 Scope 部分失败都会阻止提交。Hook 不自动暂存、修改代码、创建资产、提升候选或修复对账。

远程 MCP 必须使用 TLS 和短时 Token。一个 Token 可以授权多个应用服务，但每次操作只针对精确解析的 Scope。Token 进入操作系统凭据库，不进入仓库配置或 Git 配置。生产远程传输禁止接受本地 seed 身份。

### CodeHub 待办

CodeArts/CodeHub 受保护分支校验作为独立待办。它将重新计算提交 tree，使用 CI 服务身份验证证明，识别 `--no-verify` 绕过，并把 SpecForge 校验设为合入必选状态。在该能力交付前，本地 Hook 不得宣称不可绕过。

### 验证策略

实现必须覆盖配置解析、单服务和 Monorepo 映射、路径冲突、Git tree 确定性、暂存区竞争、精确 Scope 授权、`UNVERIFIED` 阻断、会话与证明事务、Ed25519 轮换、凭据脱敏、既有 Hook 保留、幂等安装、离线失败，以及后续 CodeHub 固件中的 `--no-verify` 检测。
