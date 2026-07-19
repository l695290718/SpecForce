import { expect, it, vi } from "vitest";

vi.mock("../apps/mcp-server/src/federation/persistence", () => ({
  reconcilePersistedScope: vi.fn()
}));

import {
  federatedReconciliationDiagnostics,
  reconcileFederatedFacts,
  reconciliationExitCode,
  resolveFederatedScope,
  runReconciliationCli
} from "./reconcile-federated-facts";

const designerScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
} as const;

const canonicalFact = {
  id: "fact-1",
  architectureScope: designerScope,
  assetType: "api",
  schemaVersion: "1",
  payload: { name: "Payments API" },
  localizedContent: { en: { name: "Payments API" }, zh: { name: "支付 API" } },
  normalizedDigest: "digest-1",
  provenance: { sourceSystem: "github", connectorInstanceId: "connector-1", observedAt: "2026-07-19T00:00:00.000Z" },
  authority: "EXTERNAL" as const,
  confidence: 1,
  status: "PROMOTED" as const
};

const convergedReport = {
  architectureScope: designerScope,
  root: "root-1",
  status: "CONVERGED" as const,
  issues: [],
  factDigests: [{ factId: canonicalFact.id, digest: canonicalFact.normalizedDigest }]
};

it("returns zero for a converged Scope", () => {
  expect(reconciliationExitCode({ blocking: false, issues: [], root: "root" })).toBe(0);
});

it("returns one for blocking drift", () => {
  expect(reconciliationExitCode({ blocking: true, issues: [{ code: "CONTENT_DRIFT" }], root: "root" })).toBe(1);
});

it("treats source, identity, Scope, localization, and delivery diagnostics as blocking", () => {
  for (const code of ["SOURCE_UNREACHABLE", "IDENTITY_CONFLICT", "SCOPE_DRIFT", "LOCALIZATION_DRIFT", "DELIVERY_BLOCKED"] as const) {
    expect(reconciliationExitCode({ blocking: false, issues: [{ code }], root: "root" })).toBe(1);
  }
});

it("treats every governed non-convergence diagnostic as blocking", () => {
  for (const code of ["CONTENT_DRIFT", "MISSING_FACT", "UNDECLARED_CHANGE", "RELATIONSHIP_DRIFT", "EVIDENCE_DRIFT"] as const) {
    expect(reconciliationExitCode({ status: "DRIFTED", blocking: false, issues: [{ code }], root: "root" })).toBe(1);
  }
});

it("resolves only an exact application-service Scope from the architecture registry", () => {
  expect(resolveFederatedScope({ SPECFORGE_APPLICATION_SERVICE_ID: "com.huawei.celon.desiner" })).toEqual({
    applicationServiceId: "com.huawei.celon.desiner",
    scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
  });
  expect(() => resolveFederatedScope({ SPECFORGE_APPLICATION_SERVICE_ID: "module-celon-designer" })).toThrow("application service");
  expect(() => resolveFederatedScope({
    SPECFORGE_APPLICATION_SERVICE_ID: "com.huawei.celon.desiner",
    SPECFORGE_SCOPE_PATH: "untrusted-path"
  })).toThrow("exactly match");
});

it("loads canonical facts and forwards the exact Scope to the sole read-only reconciliation operation", async () => {
  const persistence = await import("../apps/mcp-server/src/federation/persistence");
  vi.mocked(persistence.reconcilePersistedScope).mockResolvedValue(convergedReport);

  await expect(reconcileFederatedFacts({
    SPECFORGE_APPLICATION_SERVICE_ID: designerScope.applicationServiceId,
    SPECFORGE_SCOPE_PATH: designerScope.scopePath
  })).resolves.toMatchObject({ architectureScope: designerScope, root: "root-1", verified: 1, blocking: false });
  expect(persistence.reconcilePersistedScope).toHaveBeenCalledWith({ architectureScope: designerScope });
  expect(persistence.reconcilePersistedScope).toHaveBeenCalledTimes(1);
});

it.each([
  ["missing Scope", {}, null, "MISSING_APPLICATION_SERVICE_ID"],
  ["invalid application-service Scope", { SPECFORGE_APPLICATION_SERVICE_ID: "module-celon-designer" }, null, "INVALID_SCOPE"],
  ["invalid Scope path", { SPECFORGE_APPLICATION_SERVICE_ID: designerScope.applicationServiceId, SPECFORGE_SCOPE_PATH: "untrusted-path" }, null, "INVALID_SCOPE"]
] as const)("prints a stable JSON-shaped failure report for %s", async (_label, environment, expectedScope, errorCode) => {
  const result = await runReconciliationCli(environment);
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({
    architectureScope: expectedScope,
    root: null,
    verified: 0,
    issueCounts: { [errorCode]: 1 },
    blocking: true,
    error: { code: errorCode, message: expect.any(String) }
  });
});

it("prints a stable JSON-shaped failure report when persistence fails", async () => {
  const persistence = await import("../apps/mcp-server/src/federation/persistence");
  vi.mocked(persistence.reconcilePersistedScope).mockRejectedValue(new Error("database unavailable"));

  const result = await runReconciliationCli({ SPECFORGE_APPLICATION_SERVICE_ID: designerScope.applicationServiceId });

  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stdout)).toEqual({
    architectureScope: designerScope,
    root: null,
    verified: 0,
    issueCounts: { RECONCILIATION_FAILED: 1 },
    blocking: true,
    error: { code: "RECONCILIATION_FAILED", message: "database unavailable" }
  });
});

it("produces stable diagnostics with verified facts and issue counts", () => {
  expect(federatedReconciliationDiagnostics({
    architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" },
    root: "root",
    status: "DRIFTED",
    factDigests: [{ factId: "fact-a", digest: "a" }, { factId: "fact-b", digest: "b" }],
    issues: [
      { code: "LOCALIZATION_DRIFT", message: "Localized content differs." },
      { code: "CONTENT_DRIFT", message: "Content differs.", factId: "fact-a" },
      { code: "CONTENT_DRIFT", message: "Content differs again.", factId: "fact-a" }
    ]
  })).toEqual({
    architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" },
    root: "root",
    verified: 1,
    issueCounts: { CONTENT_DRIFT: 2, LOCALIZATION_DRIFT: 1 },
    blocking: true,
    error: null
  });
});
