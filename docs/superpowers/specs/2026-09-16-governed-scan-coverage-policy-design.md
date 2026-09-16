# Governed Scan Coverage Policy Design

**Status:** Approved for planning

## Context

The local repository scan indexed 968 observations but marked its report blocked because 2,253 repository files were not supported by the static extractors. Treating every unparsed file as a coverage failure makes the result noisy and prevents useful candidate discovery. Treating every unparsed file as irrelevant would make coverage untrustworthy.

The authoritative design baseline in `com.specforge.designcenter` must remain unchanged until a governed review and promotion completes. Scans write only candidate observations in that exact Scope.

## Decision

Use a versioned declarative scan coverage policy. Every discovered file is classified before coverage is calculated:

| Classification | Meaning | Effect on completion |
| --- | --- | --- |
| `SUPPORTED` | A configured extractor reads and normalizes the file. | Required; extraction failure blocks. |
| `EXCLUDED` | A policy rule excludes the file with an explicit reason. | Counted and audited; does not block. |
| `REQUIRED_UNSUPPORTED` | The file is inside a high-value configured path or type but lacks an extractor. | Blocks report completion. |
| `OUT_OF_POLICY` | The file is not in the scan contract. | Reported separately; does not claim coverage. |

The policy must contain stable identifiers, ordered path and extension rules, rationale, and a digest. A report records classification counts, representative paths subject to source-minimization limits, and the policy digest. A scanner must fail closed when a file matches conflicting rules or a required extractor fails.

The initial supported inventory remains TypeScript/JavaScript, Go, SQL, OpenAPI, AsyncAPI, JSON, and Markdown. The first priority additions are Dockerfile/Compose, CI pipelines, Kubernetes/Helm, and YAML contracts/configuration. Lock files, generated output, caches, test snapshots, local scan artifacts, isolated worktrees, binary/media files, and dependency vendor trees are explicit exclusions.

## Data Flow

1. The scanner enumerates files in the approved workspace and assigns a policy classification before extraction.
2. Extractors produce source-minimized observations only for `SUPPORTED` files.
3. The scanner persists the report and observations through MCP into `com.specforge.designcenter`.
4. A report with any `REQUIRED_UNSUPPORTED`, extraction error, rule conflict, or incomplete traversal is `BLOCKED`.
5. A complete report becomes reviewable candidate input. Semantic candidate generation, review, promotion, reconciliation, and Baseline publication remain separate gates.

No scan writes approved design assets, changes a published Baseline, or crosses Scope boundaries.

## Acceptance Criteria

- A policy-classified report distinguishes excluded files from required unsupported files.
- Explicit exclusions no longer make an otherwise complete scan blocked.
- A high-value unsupported Docker, CI, deployment, or contract file blocks the report with its policy rule ID.
- The policy digest, counts, and bounded representative paths are persisted with the report.
- Repeating the same workspace scan and policy is idempotent.
- Candidate observations remain in `com.specforge.designcenter`; approved assets and Baseline remain unchanged until a later governed promotion.

## Consequences

This gives operators an honest coverage contract without requiring parsers for every repository artifact. Coverage is stricter for architecture-bearing files and intentionally permissive for audited exclusions. Adding an extractor changes policy capability and requires tests, a design-change session, MCP fact synchronization, and a rescan.

## 中文说明

### 背景

当前本地仓库扫描提取了 968 条观察，但因 2,253 个文件没有静态提取器而被阻断。把所有未解析文件都视为缺口会让扫描无法使用；把它们全部忽略又会使覆盖率不可信。`com.specforge.designcenter` 中的权威设计基线在完成受治理审核和晋升前必须保持不变。

### 决策

采用版本化、声明式的扫描覆盖策略。每个文件先被归类为：已支持、已排除、必须支持但尚未支持、或不在扫描契约内。只有“必须支持但尚未支持”、提取失败、规则冲突和遍历不完整会阻断报告。排除项必须带稳定规则 ID、原因和可审计统计，不会因为本身未解析而阻断。

初始优先级为 Docker/Compose、CI、Kubernetes/Helm 与 YAML 契约/配置。锁文件、生成物、缓存、测试快照、本地扫描产物、隔离工作区、二进制媒体和依赖目录作为显式排除项。

### 边界

扫描只能通过 MCP 写入 `com.specforge.designcenter` 的候选观察区，不能直接改写已批准资产、已发布 Baseline 或其他 Scope。完整扫描之后仍需语义候选、审核、晋升、对账和发布等独立门禁。
