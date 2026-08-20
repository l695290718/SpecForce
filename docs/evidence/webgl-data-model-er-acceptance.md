# WebGL Data Model ER Workspace Evidence

## Implemented

The Data Model detail and list routes now expose URL-controlled List/ER and MODEL/SCOPE views. The read-only client calls `GET /api/data-model-graph` with the exact application-service Scope, renders the existing PixiJS workspace, exposes semantic fallback rows, and provides a bilingual inspector for stable IDs, relation groups, composite mapping positions, errors, partial results, and waterlines.

数据模型详情页和列表页现在提供由 URL 控制的列表/ER 与模型/Scope 视图。只读客户端使用精确应用服务 Scope 调用 `GET /api/data-model-graph`，渲染现有 PixiJS 工作区，提供语义回退列表，并以双语检查器展示稳定 ID、关系组、复合映射位置、错误、部分结果和水位。

## Verified locally

The implementation turn produced the following local evidence:

- `pnpm exec vitest run --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/core apps/web`: 76 tests passed across 21 files (including ER, graph query, and manifest coverage).
- `pnpm --filter @specforge/web typecheck`: passed.
- `pnpm --filter @specforge/web build`: blocked by the pre-existing webpack `UnhandledSchemeError` for `node:crypto`, imported through `packages/core/src/graph/projection-generation.ts` and the existing app shell; this Task 5 did not change that import chain.
- `pnpm design-facts:check`: blocked with `Asset not found: adr/adr-webgl-data-model-er-workspace` because the new ADR has not yet been persisted through MCP.
- `pnpm design-facts:federation:check` with the exact Designer Scope: passed with `blocking=false`.
- `git diff --check`: passed with only Windows line-ending normalization warnings.

Browser acceptance is not claimed here until a fresh exact-Scope inspection is performed.

当前实现轮次的本地证据如下：

- `pnpm exec vitest run --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/core apps/web`：21 个文件共 76 个测试通过（包括 ER、关系图查询和 manifest 覆盖）。
- `pnpm --filter @specforge/web typecheck`：通过。
- `pnpm --filter @specforge/web build`：被既有 webpack `UnhandledSchemeError` 阻塞，错误来自 `node:crypto`，导入链为 `packages/core/src/graph/projection-generation.ts` 到既有 app shell；本 Task 5 未修改该导入链。
- `pnpm design-facts:check`：因新 ADR 尚未通过 MCP 持久化而阻塞，具体错误为 `Asset not found: adr/adr-webgl-data-model-er-workspace`。
- 使用精确 Designer Scope 执行 `pnpm design-facts:federation:check`：通过，`blocking=false`。
- `git diff --check`：通过，仅有 Windows 换行规范化警告。

在完成新的精确 Scope 浏览器检查前，不声明浏览器验收通过。

## Deferred production capability

External identity and multi-service grants, continuous legacy-source synchronization, graph-store scale certification, and unlimited browser capacity remain deferred. `WEBGL_UNAVAILABLE`, `WEBGL_CONTEXT_LOST`, `LAYOUT_DEGRADED`, `CLIENT_CAPACITY_EXCEEDED`, and `PARTIAL` are supported states, not hidden failures.

外部身份与多应用服务授权、存量系统持续同步、图存储规模认证和浏览器无限容量仍然延期。`WEBGL_UNAVAILABLE`、`WEBGL_CONTEXT_LOST`、`LAYOUT_DEGRADED`、`CLIENT_CAPACITY_EXCEEDED` 和 `PARTIAL` 都是受支持的状态，不会被隐藏成失败或成功。
