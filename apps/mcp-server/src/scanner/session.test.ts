import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertScanSessionScope,
  assertScanSessionWritable,
  createScanSessionNonce,
  normalizeScanLimits
} from "./session";

const designerScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

describe("governed scan session", () => {
  it("stores only a digest of the one-time nonce", () => {
    const nonce = createScanSessionNonce();

    expect(nonce.value).not.toBe(nonce.digest);
    expect(nonce.digest).toBe(createHash("sha256").update(nonce.value).digest("hex"));
  });

  it("treats client Scope as an equality assertion", () => {
    expect(() => assertScanSessionScope(designerScope, designerScope)).not.toThrow();
    expect(() => assertScanSessionScope(designerScope, { ...designerScope, applicationServiceId: "com.huawei.celon.policyhub" })).toThrow("SCOPE_MISMATCH");
  });

  it("allows token refresh for the same actor but rejects expiry and actor substitution", () => {
    const session = { actorId: "agent-1", status: "OPEN", expiresAt: new Date("2026-08-04T00:00:00.000Z") };

    expect(() => assertScanSessionWritable(session, "agent-1", new Date("2026-08-03T00:00:00.000Z"))).not.toThrow();
    expect(() => assertScanSessionWritable(session, "agent-2", new Date("2026-08-03T00:00:00.000Z"))).toThrow("SCAN_SESSION_ACTOR_MISMATCH");
    expect(() => assertScanSessionWritable(session, "agent-1", new Date("2026-08-05T00:00:00.000Z"))).toThrow("SCAN_SESSION_EXPIRED");
  });

  it("allows a zero excerpt budget without relaxing other limits", () => {
    const hardLimits = {
      maxObservationsPerBatch: 500,
      maxBatchBytes: 4_194_304,
      maxExcerptBytes: 8_192,
      maxSourceFileBytes: 10_485_760,
      maxObservationsPerSession: 100_000
    };

    expect(normalizeScanLimits({ maxExcerptBytes: 0 }, hardLimits).maxExcerptBytes).toBe(0);
    expect(() => normalizeScanLimits({ maxBatchBytes: 0 }, hardLimits)).toThrow("SCAN_LIMITS_EXCEEDED");
  });
});
