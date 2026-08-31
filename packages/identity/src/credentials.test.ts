import { describe, expect, it } from "vitest";
import { createOpaqueCredential, hashPassword, verifyCredentialSecret, verifyPassword } from "./credentials";

describe("opaque agent credentials", () => {
  it("does not expose plaintext through the persisted digest", () => {
    const created = createOpaqueCredential("test-pepper");
    expect(created.secret).toMatch(/^sfat_/);
    expect(created.digest).not.toContain(created.secret);
    expect(verifyCredentialSecret(created.secret, created.digest, "test-pepper")).toBe(true);
    expect(verifyCredentialSecret(`${created.secret}x`, created.digest, "test-pepper")).toBe(false);
  });

  it("uses Argon2id defaults for user passwords", async () => {
    const digest = await hashPassword("an adequately long local password");
    expect(digest).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword("an adequately long local password", digest)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", digest)).resolves.toBe(false);
  });
});
