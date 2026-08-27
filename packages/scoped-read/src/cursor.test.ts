import { describe, expect, it } from "vitest";
import { decodeReadCursor, encodeReadCursor, type ReadCursorBinding, type ReadCursorPayload } from "./cursor";

const architectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const payload: ReadCursorPayload = {
  version: 1,
  subject: "agent-1",
  architectureScope,
  locale: "en",
  queryDigest: "query-1",
  catalogVersion: "7",
  projectionVersion: "projection-1",
  orderKey: ["2026-08-27T00:00:00.000Z", "api-1"]
};

const validation: ReadCursorBinding = {
  subject: payload.subject,
  architectureScope,
  locale: payload.locale,
  queryDigest: payload.queryDigest,
  catalogVersion: payload.catalogVersion,
  projectionVersion: payload.projectionVersion
};

describe("scoped read cursors", () => {
  it("round-trips a signed cursor without exposing its payload as plain text", () => {
    const cursor = encodeReadCursor(payload);

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(cursor).not.toContain(payload.subject);
    expect(cursor).not.toContain(payload.architectureScope.scopePath);
    expect(decodeReadCursor(cursor, validation)).toEqual(payload);
  });

  it.each([
    ["Scope", { architectureScope: { ...architectureScope, scopePath: "other-scope" } }],
    ["subject", { subject: "agent-2" }],
    ["locale", { locale: "zh" as const }],
    ["query", { queryDigest: "query-2" }]
  ])("rejects a cursor when the %s binding changes", (_binding, change) => {
    expect(() => decodeReadCursor(encodeReadCursor(payload), { ...validation, ...change })).toThrow("CURSOR_INVALID");
  });

  it("rejects a cursor when the catalog version changes", () => {
    expect(() => decodeReadCursor(encodeReadCursor(payload), { ...validation, catalogVersion: "8" })).toThrow("CURSOR_STALE");
  });

  it("rejects a cursor when the projection version changes", () => {
    expect(() => decodeReadCursor(encodeReadCursor(payload), { ...validation, projectionVersion: "projection-2" })).toThrow("CURSOR_STALE");
  });

  it("rejects tampered and malformed cursors", () => {
    const cursor = encodeReadCursor(payload);
    const [body, signature] = cursor.split(".");

    expect(() => decodeReadCursor(`${body}.${signature}x`, validation)).toThrow("CURSOR_INVALID");
    expect(() => decodeReadCursor("not-a-cursor", validation)).toThrow("CURSOR_INVALID");
  });
});
