import { describe, expect, it } from "vitest";
import {
  governanceRecordDigest,
  resolveEffectiveScanGovernance,
  type ScopeScanRuntimeOverlay,
  type SystemScanGovernanceKind,
  type SystemScanGovernanceRecord
} from "./governance";

const scope = { applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" };

function record(kind: SystemScanGovernanceKind, payload: Record<string, unknown> = { budgets: budgets() }): SystemScanGovernanceRecord {
  const base = { id: `system:${kind.toLowerCase()}:1.0.0`, kind, version: "1.0.0", payload } as const;
  return { ...base, contentDigest: governanceRecordDigest(base), signature: "signature", keyId: "key-1", status: "ACTIVE", publishedAt: "2026-09-17T00:00:00.000Z" };
}

function budgets() {
  return { maxObservationsPerBatch: 500, maxBatchBytes: 1024 * 1024, maxExcerptBytes: 8192, maxSourceFileBytes: 10 * 1024 * 1024, maxObservationsPerSession: 100_000 };
}

function records() {
  return ([
    record("SCANNER_GOVERNANCE_PROFILE"),
    record("ASSET_INFERENCE_POLICY"),
    record("RISK_CLASSIFICATION_POLICY"),
    record("PROMOTION_POLICY"),
    record("EXTRACTOR_CATALOG"),
    record("SEMANTIC_PROMPT_PACK")
  ] satisfies SystemScanGovernanceRecord[]);
}

function overlay(extra: Partial<ScopeScanRuntimeOverlay> = {}): ScopeScanRuntimeOverlay {
  return { id: "strict-designer", architectureScope: scope, includePaths: ["apps/**"], excludePaths: [], frameworkHints: ["nestjs"], sensitivePaths: ["deploy/secrets/**"], budgets: { maxObservationsPerSession: 50_000 }, ...extra };
}

describe("system scan governance", () => {
  it("allows a Scope overlay to tighten runtime parameters", () => {
    const effective = resolveEffectiveScanGovernance(records(), overlay({ minimumReviewTier: "T2" }));
    expect(effective.budgets.maxObservationsPerSession).toBe(50_000);
    expect(effective.minimumReviewTier).toBe("T2");
    expect(effective.systemDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(effective.effectiveDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it("clamps a Scope budget to the system maximum", () => {
    const effective = resolveEffectiveScanGovernance(records(), overlay({ budgets: { maxObservationsPerSession: 200_000 } }));
    expect(effective.budgets.maxObservationsPerSession).toBe(100_000);
  });

  it("rejects an overlay field that attempts to redefine governance", () => {
    expect(() => resolveEffectiveScanGovernance(records(), { ...overlay(), riskPolicy: { T2: "T0" } } as never)).toThrow("SCOPE_SCAN_GOVERNANCE_OVERRIDE_FORBIDDEN");
  });

  it("rejects missing or invalid active system versions", () => {
    expect(() => resolveEffectiveScanGovernance(records().filter((record) => record.kind !== "EXTRACTOR_CATALOG"), overlay())).toThrow("SYSTEM_SCAN_GOVERNANCE_ACTIVE_VERSION_INVALID:EXTRACTOR_CATALOG");
    const broken = records().map((item) => item.kind === "PROMOTION_POLICY" ? { ...item, contentDigest: "broken" } : item);
    expect(() => resolveEffectiveScanGovernance(broken, overlay())).toThrow("SYSTEM_SCAN_GOVERNANCE_DIGEST_INVALID:PROMOTION_POLICY");
  });

  it("digests canonical payloads independent of key order", () => {
    const left = { kind: "EXTRACTOR_CATALOG" as const, version: "1.0.0", payload: { b: 2, a: 1 } };
    const right = { kind: "EXTRACTOR_CATALOG" as const, version: "1.0.0", payload: { a: 1, b: 2 } };
    expect(governanceRecordDigest(left)).toBe(governanceRecordDigest(right));
  });
});
