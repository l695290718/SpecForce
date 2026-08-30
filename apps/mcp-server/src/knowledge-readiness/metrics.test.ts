import { afterEach, describe, expect, it } from "vitest";
import type { KnowledgeReasonCode } from "@specforge/core";
import {
  recordBudgetFailure,
  recordCursorInvalidation,
  recordReadinessEvaluation,
  recordReceiptReuse,
  resetReadinessMetricsForTests,
  snapshotReadinessMetrics
} from "./metrics";

const scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const sibling = { applicationServiceId: "com.huawei.celon.policyhub", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.policyhub" };

afterEach(() => resetReadinessMetricsForTests());

describe("readiness metrics", () => {
  it("keeps counters and labels isolated by exact Scope", () => {
    recordReadinessEvaluation(scope, { profileId: "ARCHITECTURE_OVERVIEW", accessDecision: "DENY", reasonCodes: ["KNOWLEDGE_STALE" as KnowledgeReasonCode], latencyMilliseconds: 120 });
    recordReadinessEvaluation(sibling, { profileId: "RUNTIME_DIAGNOSIS", accessDecision: "ALLOW", reasonCodes: [], latencyMilliseconds: 20 });
    recordReceiptReuse(scope);
    recordCursorInvalidation(scope);
    recordBudgetFailure(scope);

    const result = snapshotReadinessMetrics(scope);
    expect(result).toMatchObject({ evaluations: 1, allowed: 0, denied: 1, receiptReuse: 1, cursorInvalidations: 1, budgetFailures: 1, byProfile: { ARCHITECTURE_OVERVIEW: 1 }, byReason: { KNOWLEDGE_STALE: 1 }, latencyBuckets: { le_250ms: 1 } });
    expect(snapshotReadinessMetrics(sibling)).toMatchObject({ evaluations: 1, allowed: 1, denied: 0, byProfile: { RUNTIME_DIAGNOSIS: 1 } });
  });
});
