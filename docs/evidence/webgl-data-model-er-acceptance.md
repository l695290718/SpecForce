# WebGL Data Model ER Workspace Evidence

## Implemented

The Data Model detail and list routes now expose URL-controlled List/ER and MODEL/SCOPE views. The read-only client calls `GET /api/data-model-graph` with the exact application-service Scope, renders the existing PixiJS workspace, exposes semantic fallback rows, and provides a bilingual inspector for stable IDs, relation groups, composite mapping positions, errors, partial results, and waterlines.

数据模型详情页和列表页现在提供由 URL 控制的列表/ER 与模型/Scope 视图。只读客户端使用精确应用服务 Scope 调用 `GET /api/data-model-graph`，渲染现有 PixiJS 工作区，提供语义回退列表，并以双语检查器展示稳定 ID、关系组、复合映射位置、错误、部分结果和水位。

## Verified locally

The implementation turn produced the following local evidence:

- `pnpm exec vitest run --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/core apps/web`: 76 tests passed across 21 files (including ER, graph query, and manifest coverage).
- `pnpm --filter @specforge/web typecheck`: passed.
- `pnpm --filter @specforge/web build` with `SPECFORGE_NEXT_STANDALONE=0`: passed compilation, lint/type validation, static generation, and route optimization. The `node:crypto` import-chain error is resolved by reusing the pure TypeScript SHA-256 implementation.
- `pnpm --filter @specforge/web build` with default standalone output: compilation and static generation passed, but final traced-file packaging was blocked by Windows/OneDrive `EPERM` symlink creation. Linux container builds remain a separate deployment verification.
- `pnpm design-facts:check` for `adr-webgl-data-model-er-workspace`: passed after exact-Scope MCP synchronization and read-back.
- `pnpm design-facts:federation:check` with the exact Designer Scope: passed with `blocking=false`.
- `git diff --check`: passed with only Windows line-ending normalization warnings.

- Fresh exact-Scope browser acceptance: `http://localhost:3000/assets/data-models?scope=com.huawei.celon.desiner&view=er` loaded without a Runtime Error and exposed the ER toolbar, selected Scope, semantic fallback table, and `91 nodes · 142 relations`.
- Fresh model-level browser acceptance: `http://localhost:3000/assets/data-models/data-specforge-assets?scope=com.huawei.celon.desiner&view=er` loaded without a Runtime Error, rendered one Canvas, and exposed `8 nodes · 14 relations`; browser error logs were empty on a clean tab.

当前实现轮次的本地证据如下：

- `pnpm exec vitest run --exclude ".worktrees/**" --exclude ".pnpm-store/**" packages/core apps/web`：21 个文件共 76 个测试通过（包括 ER、关系图查询和 manifest 覆盖）。
- `pnpm --filter @specforge/web typecheck`：通过。
- 设置 `SPECFORGE_NEXT_STANDALONE=0` 执行 `pnpm --filter @specforge/web build`：编译、Lint/类型检查、静态生成和路由优化全部通过；通过复用纯 TypeScript SHA-256 实现，`node:crypto` 导入链问题已修复。
- 默认 standalone 输出执行 `pnpm --filter @specforge/web build`：编译和静态生成通过，但最终 traced-file 打包因 Windows/OneDrive 创建符号链接返回 `EPERM`；Linux 容器构建仍需独立验证。
- 针对 `adr-webgl-data-model-er-workspace` 执行 `pnpm design-facts:check`：精确 Scope MCP 同步和回读后通过。
- 使用精确 Designer Scope 执行 `pnpm design-facts:federation:check`：通过，`blocking=false`。
- `git diff --check`：通过，仅有 Windows 换行规范化警告。

- 新的精确 Scope 浏览器验收：访问 `http://localhost:3000/assets/data-models?scope=com.huawei.celon.desiner&view=er` 无 Runtime Error，并展示 ER 工具栏、选中的 Scope、语义回退表格和 `91 nodes · 142 relations`。
- 新的单模型浏览器验收：访问 `http://localhost:3000/assets/data-models/data-specforge-assets?scope=com.huawei.celon.desiner&view=er` 无 Runtime Error，渲染出一个 Canvas，并展示 `8 nodes · 14 relations`；新标签页浏览器错误日志为空。

## Deferred production capability

External identity and multi-service grants, continuous legacy-source synchronization, graph-store scale certification, and unlimited browser capacity remain deferred. `WEBGL_UNAVAILABLE`, `WEBGL_CONTEXT_LOST`, `LAYOUT_DEGRADED`, `CLIENT_CAPACITY_EXCEEDED`, and `PARTIAL` are supported states, not hidden failures.

外部身份与多应用服务授权、存量系统持续同步、图存储规模认证和浏览器无限容量仍然延期。`WEBGL_UNAVAILABLE`、`WEBGL_CONTEXT_LOST`、`LAYOUT_DEGRADED`、`CLIENT_CAPACITY_EXCEEDED` 和 `PARTIAL` 都是受支持的状态，不会被隐藏成失败或成功。
