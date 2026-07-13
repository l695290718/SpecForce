import type { AssetLocale } from "@specforge/core";

const zhGraphEdgeLabels: Record<string, string> = {
  "owns model": "\u62e5\u6709\u6a21\u578b",
  "provides api": "\u63d0\u4f9b API",
  "emits event": "\u53d1\u5e03\u4e8b\u4ef6",
  governs: "\u6cbb\u7406",
  "controls state": "\u63a7\u5236\u72b6\u6001",
  integrates: "\u96c6\u6210",
  verifies: "\u9a8c\u8bc1",
  observes: "\u89c2\u6d4b",
  decides: "\u51b3\u7b56",
  impacts: "\u5f71\u54cd",
  includes: "\u5305\u542b",
  generates: "\u751f\u6210",
  depends_on: "\u4f9d\u8d56",
  governed_by: "\u53d7\u89c4\u5219\u6cbb\u7406"
};

export function graphEdgeDisplayLabel(code: string, locale: AssetLocale): string {
  return locale === "zh" ? zhGraphEdgeLabels[code] ?? code : code;
}
