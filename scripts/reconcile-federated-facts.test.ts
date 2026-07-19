import { expect, it } from "vitest";

import {
  federatedReconciliationDiagnostics,
  reconciliationExitCode,
  resolveFederatedScope
} from "./reconcile-federated-facts";

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
    blocking: true
  });
});
