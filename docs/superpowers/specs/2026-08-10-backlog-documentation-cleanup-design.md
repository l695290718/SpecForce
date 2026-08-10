# Backlog Documentation Cleanup Design

**Status:** Approved for implementation planning on 2026-08-10.

## Purpose

Make the repository backlog readable and authoritative without changing the meaning, ownership, trigger, rationale, or operational identity of any active SpecForge backlog fact.

## Selected Approach

Keep `docs/TODO.md` as a concise bilingual list of active work. Move completed, superseded, and historical incident records to `docs/archive/backlog-history.md`. Preserve stable design-fact IDs and references so repository history and MCP records remain traceable.

Two alternatives were considered and rejected:

- Repairing mojibake in place would retain a long mixture of active and completed records, leaving the file difficult to use.
- Regenerating the file entirely from MCP would make repository review dependent on a live service and could discard repository-only operational evidence.

## Classification Rules

An item remains in `docs/TODO.md` when its authoritative status is `Deferred`, `Pending`, or explicitly in progress. It moves to the archive when it is `Complete`, `Implemented`, `Superseded`, or a resolved incident. A completed capability with a remaining production increment is split: the completed increment moves to history and the still-deferred increment remains active.

The active backlog will retain English canonical content and complete Chinese localization for each item:

- stable title or design-fact identifier;
- status and current delivery boundary;
- owner;
- rationale;
- activation trigger;
- completion evidence required.

## Active Backlog Scope

The cleanup is expected to retain these active capability groups after reconciliation:

1. CodeArts/CodeHub protected-branch enforcement.
2. Production identity, tenant administration, and authorized multi-service comparison.
3. Concrete live database, API gateway, CMDB, and runtime connectors plus polling or webhook execution.
4. Knowledge-Assertion-aware Nebula 3A projection and production-scale certification.
5. PostgreSQL/MCP synchronization retry and operator diagnostics.
6. Legacy graph verification stack retirement.

The cleanup must also represent operational inconsistencies discovered during read-only reconciliation, including stale open Design Change Sessions and undelivered federation outbox records, without silently changing their database status.

## Repository Structure

- `docs/TODO.md`: active bilingual backlog only, ordered by operational priority.
- `docs/archive/backlog-history.md`: completed, superseded, and resolved records retained for audit.
- Existing ADRs, Proposals, Context Packs, Evidence, and design-fact manifests remain unchanged unless reconciliation finds a genuine semantic mismatch.

## MCP And Data Consistency

Documentation cleanup does not directly mutate PostgreSQL. Before implementation, open an exact-Scope Design Change Session for `com.huawei.celon.desiner`. After editing, compare active repository items with the current scoped design catalog and operational status. If an active backlog fact is missing from MCP, synchronize it through the MCP write boundary; if only presentation changed, retain the existing operational identity and links.

No open session, pending outbox event, or blocked historical receipt may be deleted or relabeled merely to make the document look clean. Operational status changes require their own MCP command and evidence.

## Verification

The cleanup is complete when:

- UTF-8 text renders correctly with no mojibake markers;
- `docs/TODO.md` contains no completed or superseded entries;
- every active entry has English and Chinese content, owner, rationale, trigger, and completion evidence;
- archive entries preserve their original completion evidence and source references;
- active repository facts reconcile with the exact Designer Scope without missing, mismatched, blocked, or out-of-scope records;
- the Design Change Session closes `CONVERGED` with exact command and read-back evidence.

## 中文设计摘要

`docs/TODO.md` 只保留仍未完成的双语待办，并按运维和产品优先级排序；已完成、已替代和已解决的历史记录迁移到 `docs/archive/backlog-history.md`。清理过程只调整仓库文档的信息结构和乱码，不改变待办事实的稳定标识、负责人、原因、启动条件或完成标准。

实现前必须在 `com.huawei.celon.desiner` 精确 Scope 下开启设计变更会话。清理后对照 MCP 运行记录完成回读；缺失的有效待办通过 MCP 补齐。历史阻塞回执、开放会话和未投递 Outbox 只能如实记录，不能为了文档整洁而直接删除或改写数据库状态。
