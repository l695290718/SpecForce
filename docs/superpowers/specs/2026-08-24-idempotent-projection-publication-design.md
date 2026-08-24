# Idempotent 3A Projection Publication

## Problem

Retrying or restarting the knowledge projector can claim the same completed projection build and call `ProjectionManifest.create` for an existing exact-Scope manifest. PostgreSQL correctly rejects the duplicate immutable identity, but the projector records a failed build and the Web surfaces a generic 503 for the 3A read path.

## Decision

Make publication idempotent at the projector repository boundary. After validating counts and endpoint closure, derive the immutable manifest identity from the exact Scope and generation. Read the existing manifest inside the same transaction. If it exists with the same immutable source and content identity, reuse it and mark the build job `READY`. If it exists with different content identity, fail with an explicit immutable-conflict code. Only create a manifest when no row exists.

This preserves PostgreSQL authority, exact Scope isolation, immutable published identities, and safe retry behavior. It does not delete or overwrite an existing projection and does not turn an unavailable derived analysis into a successful analysis.

## Verification

Add repository tests for first publication, identical retry, and conflicting retry. Run the focused knowledge-projector suite and typecheck, rebuild the managed projector and Web containers, verify health, and issue an exact Designer Scope 3A read. Record MCP synchronization and session closure evidence.

## 中文说明

知识投影器重试或重启时，可能重复发布同一个 Scope 和 generation 的投影，导致已有 `ProjectionManifest` 再次 `create`，被 PostgreSQL 唯一键拒绝，最终让 3A 查询显示 503。

修复在投影仓储边界实现幂等发布：在同一事务中读取精确 Scope 和 generation 对应的不可变 manifest。内容身份一致时复用已有记录并将任务标记为 `READY`；内容身份不一致时返回明确的不可变冲突；只有不存在记录时才创建。不会覆盖或删除已有投影，也不会把不可用的派生分析伪装成成功。
