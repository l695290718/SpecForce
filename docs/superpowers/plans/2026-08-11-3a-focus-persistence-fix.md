# 3A Graph Focus Persistence Fix Plan

## Implementation

1. Derive a focus load key that is populated only for Impact mode.
2. Keep Overview and Explore selection changes inside the existing Graphology store.
3. Add regression coverage for the view-specific load-key contract.
4. Verify focused tests, package typechecks, browser click persistence, and the exact-Scope MCP closure.

## Completed

- The workspace no longer clears Overview or Explore when URL focus changes.
- Impact remains focus-sensitive and reloads its analysis result.
- Focused suite: 7 files, 39 tests passed.
- Web and knowledge-query typechecks passed.

## 中文实施计划

1. 仅让影响分析模式的加载键随焦点变化。
2. 概览和探索模式在现有 Graphology 存储中完成本地选中。
3. 增加按视图区分加载行为的回归测试。
4. 统一验证测试、类型检查、浏览器点击保持和精确 Scope 的 MCP 会话关闭。
