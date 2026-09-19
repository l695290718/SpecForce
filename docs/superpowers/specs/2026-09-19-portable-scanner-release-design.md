# Portable Scanner Release Design

## Status

Approved direction for implementation planning.

- Owning application service: `com.specforge.designcenter`.
- Scope path: `pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter`.
- Design session: `design-change-session:15b9c521-d009-43b7-88de-bd7b706593f3`.
- Governing ADR: `adr-system-owned-full-asset-repository-discovery`.

## Problem

Governed repository scanning currently assumes that an ACTIVE `ScannerRelease` already exists and selects the newest ACTIVE row globally. Deployment bootstrap creates system governance and the default Scope runtime profile, but does not publish a usable release. A first scan therefore fails with `SCANNER_RELEASE_NOT_FOUND`. The existing release contract also describes only a platform string, so the server cannot distinguish a portable script from a native executable or prove that a caller can run the selected artifact.

The first-scan workflow has a second circular dependency. Knowledge readiness can correctly return `DENY` with `START_FULL_SCAN` when no source-derived baseline exists, while the Skill currently treats every denial as a reason not to scan. Test-created ACTIVE governance rows can additionally survive integration tests and make production governance resolution ambiguous.

## Decision

SpecForge will make a signed, portable Node.js scanner release the default distribution. Native scanner releases remain supported as optional accelerators, but are not required for installation or first use.

The signed release boundary remains mandatory. Cross-platform delivery changes the artifact format, not the integrity model: every release is immutable, digest-addressed, signed, revocable, contract-compatible and fixed for the lifetime of a scan session.

## Release Contract

`ScannerReleaseManifest` gains explicit execution compatibility:

- `artifactKind`: `PORTABLE_SCRIPT` or `NATIVE_BINARY`.
- `platform`: `any` for portable scripts, otherwise a normalized operating-system identifier.
- `architecture`: `any` for portable scripts, otherwise a normalized CPU architecture.
- `runtime`: required for portable scripts and absent for native binaries. The first supported runtime is `{ "name": "node", "versionRange": ">=20 <25" }`.
- `entrypoint`: the artifact-relative executable module, initially `scanner.mjs`.

The artifact remains a content-addressed archive containing the entrypoint, extractor modules, schemas and a machine-readable inventory. Repository-authored code and plugins are never loaded. The portable artifact must run without installing repository dependencies and without invoking package managers, build scripts or hooks.

Contract version remains `2.0` because the server and runner are deployed together in this pre-production increment. Old manifests without execution compatibility are accepted only as legacy native releases when explicitly requested by ID; they are not eligible for automatic selection.

## Release Selection

`start_knowledge_scan` accepts a bounded `scannerCapabilities` object containing supported artifact kinds, platform, architecture and runtimes. The server filters ACTIVE, unexpired releases by Scan Contract version and caller compatibility, then selects deterministically:

1. An explicitly requested compatible release ID.
2. A compatible `PORTABLE_SCRIPT` release.
3. A compatible `NATIVE_BINARY` release.
4. Highest semantic scanner version, then newest publication time, then stable release ID.

An explicit incompatible release fails with `SCANNER_RELEASE_INCOMPATIBLE`. Automatic selection with no compatible release fails with `SCANNER_RELEASE_NOT_FOUND`. The selected release ID is persisted in the session and cannot change during resume or finalization.

## Portable Runner

The Node runner emits exactly the existing Scan Contract v2 observations, batches, digest chain, coverage plan and finalization. Existing deterministic extractor behavior is moved behind runtime-neutral fixtures so the portable and native implementations must produce equivalent normalized output and digests for the same repository snapshot.

The first portable release includes the current technology detection and deterministic framework extractors. The Go runtime remains available only after it passes the same contract and Golden Repository fixtures. Agent semantic interpretation, candidate submission, review and promotion remain outside the scanner artifact and continue through MCP.

## Bootstrap And Deployment

The deployment bootstrap performs one idempotent transaction sequence:

1. Publish the six canonical system-governance records.
2. Publish or verify the official portable Scanner Release.
3. Create the default Scope runtime profile.
4. Verify that exactly one ACTIVE governance version exists per governance kind and at least one compatible default release exists.

Signing material is supplied by deployment configuration. Development may use an explicitly labelled development trust root; production startup fails closed when signing or trust configuration is missing. Bootstrap never silently replaces an immutable release with different bytes.

## First-Scan Readiness

The Skill must always call `evaluate_system_knowledge_readiness`. When the decision is `ALLOW`, it reads only the bounded `read_system_knowledge` result. When the decision is `DENY`, it does not call the read tool.

A denial permits a bootstrap full scan only when all of the following hold:

- remediation contains `START_FULL_SCAN`;
- no reason code indicates authorization, Scope, reconciliation, security or policy failure;
- the caller has write permission for the exact application-service Scope;
- a design-change session and governed scan session are created successfully.

`KNOWLEDGE_SOURCE_NOT_CONFIGURED`, `KNOWLEDGE_COVERAGE_INCOMPLETE` and `KNOWLEDGE_PENDING_PROMOTION` are bootstrap-compatible only in that combination. Any other denial remains blocking. A bootstrap scan still cannot promote facts or publish a Baseline until coverage, review and reconciliation gates pass.

## Governance Integrity

PostgreSQL enforces at most one ACTIVE `SystemScanGovernance` row per governance kind with a partial unique index. Publishing a new version supersedes the prior ACTIVE version and activates the new version in one serializable transaction. Idempotent publication of identical content remains supported.

Integration tests use unique IDs and versions and delete their rows in `afterAll`. Tests never create fixed ACTIVE records in a shared database. Startup verification reports duplicate or missing governance as a stable blocking error rather than choosing an arbitrary row.

## Security And Failure Handling

- Signatures cover execution compatibility, artifact digest, extractor inventory and contract versions.
- The runner verifies signature, digest, expiry and revocation before execution.
- Artifacts are extracted into a private temporary directory with path-traversal and symlink-escape protection.
- Source files stay local; only bounded redacted observations and evidence references cross MCP.
- Unsupported Node versions, incompatible platforms, invalid signatures and changed artifacts fail before repository traversal.
- Failed bootstrap and failed scans preserve audit records but do not modify accepted facts, active Baselines or dashboard counts.

## Verification

Focused proof must cover:

- TypeScript and Go contract normalization for legacy and portable manifests.
- Deterministic release selection across artifact kind, platform, architecture, runtime and semantic version.
- Build, sign, verify and execute the portable artifact on Windows and Linux-compatible Node environments.
- Golden Repository equivalence between portable and native runners for supported extractors.
- First-scan readiness denial with `START_FULL_SCAN`, and rejection of every non-bootstrap denial.
- Idempotent deployment bootstrap from an empty database.
- Transactional governance activation and duplicate-ACTIVE rejection.
- Integration-test cleanup and proof that test governance cannot leak into later runs.

## Out Of Scope

Continuous scanning, hosted repository connectors, live runtime/CMDB/database discovery, outbound `APPLY`, cross-Scope semantic merging, automatic native acceleration and remote artifact registries remain separate increments.

## 中文本地化覆盖

### 问题

当前受治理扫描假定数据库中已经存在 ACTIVE 的 `ScannerRelease`，并全局选择最新记录。部署初始化只写入系统治理和默认 Scope 运行配置，没有发布可执行 Release，因此首次扫描会报 `SCANNER_RELEASE_NOT_FOUND`。当前契约也无法区分跨平台脚本和原生程序，服务端不能证明调用方可以运行选中的发布物。

知识就绪还存在首次扫描循环：系统在没有源码基线时会正确返回带 `START_FULL_SCAN` 的拒绝结果，而 Skill 却把所有拒绝都当成禁止扫描。集成测试遗留的 ACTIVE 治理记录也可能造成治理版本歧义。

### 决策

SpecForge 默认发布经过签名的 Node.js 跨平台扫描器，原生扫描器仅作为可选加速器。跨平台交付只改变发布物格式，不取消发布治理；每个 Release 仍然不可变、按摘要寻址、签名、可撤销、契约兼容，并在扫描会话生命周期内固定。

发布清单增加 `artifactKind`、规范化的 `platform` 与 `architecture`、Node 运行时版本约束和 `entrypoint`。默认发布物是包含 `scanner.mjs`、提取器、Schema 和清单的内容寻址压缩包，不安装仓库依赖，也不执行仓库构建、Hook、插件或指令。

### 选择与首次扫描

调用方提交自身运行能力，服务端先校验显式 Release，再优先选择兼容的跨平台脚本，最后回退到兼容原生程序；选择结果写入会话且不可改变。Skill 始终先执行知识就绪评估。只有拒绝结果明确包含 `START_FULL_SCAN`，且不存在权限、Scope、对账、安全或策略错误时，才允许创建首次全量扫描；此时不得读取被拒绝的系统知识正文，也不得绕过后续审核与基线发布门禁。

### 初始化与治理

部署初始化以幂等顺序写入六类系统治理、官方跨平台 Release 和默认 Scope 配置，并验证每类治理只有一个 ACTIVE 版本且至少存在一个默认兼容 Release。PostgreSQL 使用部分唯一索引保护 ACTIVE 治理版本；版本切换在串行化事务中完成。测试使用唯一 ID 并在结束后清理，禁止向共享数据库遗留固定 ACTIVE 测试记录。

### 安全与验证

签名覆盖运行兼容性、发布物摘要、提取器目录和契约版本。运行前必须校验签名、摘要、有效期和撤销状态；解压必须防止路径穿越和符号链接逃逸。源码默认保留在本地，仅上传有界且脱敏的 Observation 与证据引用。验证覆盖契约一致性、Release 选择、跨平台执行、原生与脚本 Golden Repository 等价、首次扫描门禁、空库初始化、治理唯一性和测试隔离。
