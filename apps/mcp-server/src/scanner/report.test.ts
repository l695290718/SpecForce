import { describe, expect, it } from "vitest";
import { remediationForScanIssue } from "./report";

describe("governed scan report remediation", () => {
  it("maps capability blockers to release remediation", () => {
    expect(remediationForScanIssue("REQUIRED_EXTRACTOR_MISSING:nestjs:api").action).toContain("signed scanner release");
  });

  it("maps resume drift to a new session", () => {
    expect(remediationForScanIssue("SCAN_RESUME_CONTEXT_MISMATCH:POLICY_RECEIPT").action).toContain("new session");
  });
});
