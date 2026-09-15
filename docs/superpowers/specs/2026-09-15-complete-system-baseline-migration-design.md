# Complete System Baseline Migration Design

**Status:** Approved design; implementation pending plan review  
**Date:** 2026-09-15  
**Source Scope:** `com.huawei.celon.desiner`  
**Target Scope:** `com.specforge.designcenter`

## Decision

Migrate the complete governed design record owned by `com.huawei.celon.desiner` into `com.specforge.designcenter`. The source catalog is authoritative. The target becomes an isolated, complete SpecForge system baseline after reconciliation.

The migration covers authored design assets, Proposals, Context Packs, Evidence, typed relationships, localized content, and the derived 3A knowledge baseline. It does not migrate or merge any other application-service Scope.

## Migration Contract

- Source content overwrites a target record with the same stable logical ID.
- Target records absent from the source manifest are removed as stale baseline seed residue, so the target reconciles exactly to the source catalog.
- Source records are never deleted or rewritten by this migration. The source stays readable as the rollback reference.
- All authored-record reads and writes use the MCP boundary with exact source or target `architectureScope`. PostgreSQL remains the persistence authority behind MCP; direct SQL is not a migration write path.
- A batch key and source content digest make the operation retry-safe. Repeating a batch with the same digest is a no-op; a changed digest requires a new batch key.

## Execution Flow

1. Open a design-change session and inspect the source through `evaluate_system_knowledge_readiness` followed by `read_system_knowledge`.
2. Produce an immutable source manifest: typed asset inventory, Proposals, Context Packs, Evidence, typed links, localization coverage, counts, and digest.
3. Upsert source facts in the target through MCP, preserving stable IDs and English canonical fields with Chinese overlays.
4. Recreate typed links with target-local endpoints, preserving direction, relationship type, provenance, and evidence references.
5. Remove target-only stale records within the migration boundary.
6. Rebuild target search, asset-graph, and 3A derived projections.
7. Reconcile source and target inventories, payload digests, link endpoints, localization, and published 3A counts.
8. Close the design-change session as `CONVERGED` only after all checks pass.

## Failure And Rollback

Any MCP persistence error, endpoint rewrite error, localization failure, or reconciliation mismatch stops the batch and records `MCP synchronization blocked` with a retry trigger. No source record is deleted. The target is left isolated for inspection and the runtime default is not changed by a failed batch.

Rollback changes the runtime default back to the source Scope while leaving the target batch available for diagnosis. Deleting or archiving the source is explicitly out of scope.

## Verification

- Source and target counts match for every migrated fact category.
- Every target relationship endpoint resolves in the target Scope.
- Target has no source-unmatched assets inside the migration boundary.
- English canonical fields and Chinese localized overlays reconcile for all human-facing facts.
- The target 3A projection is published and its nodes and edges match the reconciled source manifest.
- A repeated migration with the same batch key and digest is idempotent.
- New and legacy Scope page smoke checks remain authorized and isolated.

---

# 完整系统基线迁移设计

**状态：** 设计已确认，待实施计划评审  
**日期：** 2026-09-15  
**源 Scope：** `com.huawei.celon.desiner`  
**目标 Scope：** `com.specforge.designcenter`

## 决策

将 `com.huawei.celon.desiner` 归属的完整治理设计记录迁移到 `com.specforge.designcenter`。源目录是权威版本；对账完成后，目标成为独立且完整的 SpecForge 系统基线。

迁移覆盖已编写设计资产、Proposal、Context Pack、Evidence、有类型关系、本地化内容和派生的 3A 知识基线。不迁移或合并任何其他应用服务 Scope。

## 迁移合同

- 源记录与目标具有相同稳定逻辑 ID 时，使用源内容覆盖目标内容。
- 目标中未出现在源清单内的记录视为过期铺底残留并清理，使目标与源目录严格对账。
- 迁移不删除、不改写源记录；源 Scope 保持可读，作为回滚依据。
- 所有已编写事实的读取和写入都通过携带精确 `architectureScope` 的 MCP 边界执行。PostgreSQL 是 MCP 背后的持久化权威，但不是直接 SQL 迁移写入路径。
- 批次键与源内容摘要保证可重试：相同摘要重跑为幂等操作；摘要变化必须使用新的批次键。

## 执行流程

1. 打开设计变更会话，并依次通过 `evaluate_system_knowledge_readiness` 与 `read_system_knowledge` 检查源 Scope。
2. 生成不可变源清单：有类型资产、Proposal、Context Pack、Evidence、有类型链接、本地化覆盖率、数量和摘要。
3. 通过 MCP 将源事实 Upsert 到目标，保留稳定 ID、英文规范字段和中文覆盖。
4. 在目标内重建有类型链接，保留方向、关系类型、来源与证据引用。
5. 清理迁移边界内仅存在于目标的过期记录。
6. 重建目标的搜索、资产关系图与 3A 派生投影。
7. 对账源与目标的库存、内容摘要、关系端点、本地化和已发布 3A 统计。
8. 只有全部检查通过，才将设计变更会话关闭为 `CONVERGED`。

## 失败与回滚

任何 MCP 持久化错误、端点重写错误、本地化失败或对账不一致都会停止批次，并记录包含重试条件的 `MCP synchronization blocked`。源记录不会被删除。失败批次的目标数据保持隔离以便排查，运行时默认 Scope 不会因失败而切换。

回滚仅将运行时默认 Scope 指回源 Scope，目标批次保留用于诊断。删除或归档源 Scope 明确不在本次范围内。

## 验证

- 每类迁移事实的源、目标数量一致。
- 每个目标关系端点都在目标 Scope 内解析。
- 迁移边界内不存在无法在源清单中匹配的目标资产。
- 所有面向人的事实均对账英文规范字段和中文本地化覆盖。
- 目标 3A 投影已发布，节点和边与已对账源清单一致。
- 相同批次键和摘要的重复迁移保持幂等。
- 新旧 Scope 页面冒烟检查保持授权且相互隔离。
