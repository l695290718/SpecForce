import { describe, expect, it } from "vitest";
import { createOpaqueCredential, verifyCredentialSecret } from "./credentials";

describe("opaque agent credentials", () => {
  it("does not expose plaintext through the persisted digest", () => {
    const created = createOpaqueCredential("test-pepper");
    expect(created.secret).toMatch(/^sfat_/);
    expect(created.digest).not.toContain(created.secret);
    expect(verifyCredentialSecret(created.secret, created.digest, "test-pepper")).toBe(true);
    expect(verifyCredentialSecret(`${created.secret}x`, created.digest, "test-pepper")).toBe(false);
  });
});
