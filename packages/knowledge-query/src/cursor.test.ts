import { describe, expect, it } from "vitest";
import { signSearchCursor, verifySearchCursor, type CursorKeyring, type SearchCursorPayload } from "./cursor";

const keyring: CursorKeyring = { activeKeyId: "k1", keys: { k1: Buffer.from("test-key") } };
const payload: SearchCursorPayload = { version: 1, keyId: "k1", tenant: "tenant-a", subject: "subject-a", scopeDigest: "scope", baselineId: "baseline-1", projectionManifestId: "manifest-1", filterDigest: "filter", sortKey: "BIZ|orders|a-1", assertionId: "a-1", expiresAt: "2099-01-01T00:00:00.000Z" };

describe("3A search cursors", () => {
  it("binds cursor claims and rejects tampering", () => { const token = signSearchCursor(payload, keyring.keys.k1!); expect(verifySearchCursor(token, keyring, payload).assertionId).toBe("a-1"); expect(() => verifySearchCursor(`${token}x`, keyring, payload)).toThrow("CURSOR_INVALID"); });
  it("rejects a cursor replayed by another subject", () => { const token = signSearchCursor(payload, keyring.keys.k1!); expect(() => verifySearchCursor(token, keyring, { ...payload, subject: "subject-b" })).toThrow("CURSOR_INVALID"); });
});
