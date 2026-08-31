import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import type { IssuedOpaqueCredential } from "./types";

const agentTokenPrefix = "sfat_";

export function createOpaqueCredential(pepper: string): IssuedOpaqueCredential {
  const secret = `${agentTokenPrefix}${randomBytes(32).toString("base64url")}`;
  return { secret, digest: digestSecret(secret, pepper) };
}

export function createSessionSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function digestSecret(secret: string, pepper: string): string {
  if (!secret || !pepper) throw new Error("IDENTITY_SECRET_PEPPER_REQUIRED");
  return createHash("sha256").update(pepper).update("\u0000").update(secret).digest("hex");
}

export function verifyCredentialSecret(secret: string, expectedDigest: string, pepper: string): boolean {
  if (!secret.startsWith(agentTokenPrefix) || !/^[a-f0-9]{64}$/i.test(expectedDigest)) return false;
  const actual = Buffer.from(digestSecret(secret, pepper), "hex");
  const expected = Buffer.from(expectedDigest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12) throw new Error("PASSWORD_TOO_SHORT");
  return loadArgon2().hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 });
}

export async function verifyPassword(password: string, passwordDigest: string): Promise<boolean> {
  return loadArgon2().verify(passwordDigest, password);
}

type Argon2Module = {
  hash(password: string, options: { memoryCost: number; timeCost: number; parallelism: number; outputLen: number }): Promise<string>;
  verify(digest: string, password: string): Promise<boolean>;
};

function loadArgon2(): Argon2Module {
  const nodeRequire = createRequire(import.meta.url);
  const moduleName = "@node-rs/argon2";
  return nodeRequire(moduleName) as Argon2Module;
}
