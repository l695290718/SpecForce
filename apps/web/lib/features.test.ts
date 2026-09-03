import { describe, expect, it } from "vitest";
import { decodeFeatureCursor, encodeFeatureCursor, FeatureReadError } from "./features";

describe("Feature read cursor", () => {
  const scope = { applicationServiceId: "service-a", scopePath: "family/product/sub/module/service-a" };
  it("is bound to exact scope and kind", () => {
    const cursor = encodeFeatureCursor({ updatedAt: new Date("2026-09-03T00:00:00.000Z"), assetId: "sf-a" }, scope, "serviceFeature");
    expect(decodeFeatureCursor(cursor, scope, "serviceFeature")).toMatchObject({ assetId: "sf-a" });
    expect(() => decodeFeatureCursor(cursor, { ...scope, applicationServiceId: "service-b" }, "serviceFeature")).toThrow(FeatureReadError);
    expect(() => decodeFeatureCursor(cursor, scope, "functionalFeature")).toThrow("FEATURE_CURSOR_INVALID");
  });
  it("rejects a modified cursor", () => {
    const cursor = encodeFeatureCursor({ updatedAt: new Date(), assetId: "sf-a" }, scope);
    expect(() => decodeFeatureCursor(`${cursor}x`, scope)).toThrow("FEATURE_CURSOR_INVALID");
  });
});
