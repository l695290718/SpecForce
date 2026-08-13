import { describe, expect, it } from "vitest";
import { classifyBootstrapDatabase } from "./bootstrap-initializer";

describe("first-startup bootstrap classification", () => {
  const now = new Date("2026-08-12T08:00:00.000Z");

  it("claims an empty database without a bootstrap record", () => {
    expect(classifyBootstrapDatabase({ authoredRows: 0, now })).toBe("FRESH");
  });

  it("refuses to claim authored rows without bootstrap ownership", () => {
    expect(classifyBootstrapDatabase({ authoredRows: 1, now })).toBe("NON_EMPTY_UNINITIALIZED");
  });

  it("does not run a completed bootstrap again", () => {
    expect(classifyBootstrapDatabase({ status: "COMPLETED", authoredRows: 42, now })).toBe("COMPLETED");
  });

  it("blocks an active bootstrap lease", () => {
    expect(classifyBootstrapDatabase({ status: "RUNNING", authoredRows: 0, startedAt: new Date("2026-08-12T07:59:00.000Z"), now })).toBe("RUNNING");
  });

  it("allows a failed or expired run to retry", () => {
    expect(classifyBootstrapDatabase({ status: "FAILED", authoredRows: 0, now })).toBe("RETRYABLE");
    expect(classifyBootstrapDatabase({ status: "RUNNING", authoredRows: 0, startedAt: new Date("2026-08-12T07:00:00.000Z"), now })).toBe("RETRYABLE");
  });
});
