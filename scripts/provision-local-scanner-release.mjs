#!/usr/bin/env node
import { createHash, createPublicKey, generateKeyPairSync } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localRoot = process.env.SPECFORGE_LOCAL_SCANNER_HOME
  ? resolve(process.env.SPECFORGE_LOCAL_SCANNER_HOME)
  : join(homedir(), ".specforge", "scanner");
const keyDirectory = join(localRoot, "keys");
const privateKeyPath = join(keyDirectory, "local-ed25519-private.pem");
const trustPath = join(localRoot, "scanner-trust.json");
const version = valueAfter(process.argv.slice(2), "--version") ?? localVersion();

await mkdir(keyDirectory, { recursive: true, mode: 0o700 });
const privateKey = await loadOrCreatePrivateKey();
const publicKey = createPublicKey(privateKey);
const rawPublicKey = rawEd25519PublicKey(publicKey);
const fingerprint = createHash("sha256").update(rawPublicKey).digest("hex");
const signingKeyId = `local-dev-${fingerprint.slice(0, 16)}`;
const trust = await loadTrustStore();
trust.keys[signingKeyId] = rawPublicKey.toString("base64");
trust.revokedReleaseIds ??= [];
trust.minimumScannerVersion = version;
await writePrivateKey(privateKey);
await writeFile(trustPath, `${JSON.stringify(trust, null, 2)}\n`, "utf8");
await protectFile(trustPath);

const build = run(process.execPath, [
  resolve(root, "scripts", "build-portable-scanner-release.mjs"),
  "--version", version
], {
  ...process.env,
  SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY: privateKey,
  SPECFORGE_SCANNER_RELEASE_SIGNING_KEY_ID: signingKeyId
});
const built = parseLastJson(build.stdout, "SCANNER_RELEASE_BUILD_OUTPUT");
const manifest = JSON.parse(await readFile(built.manifest, "utf8"));
const bootstrap = run(pnpmCommand(), ["scan-governance:bootstrap"], {
  ...process.env,
  SPECFORGE_SCANNER_RELEASE_MANIFEST: JSON.stringify(manifest),
  SPECFORGE_SCANNER_RELEASE_TRUST_BUNDLE: JSON.stringify(trust.keys)
}, true);

process.stdout.write(`${JSON.stringify({
  status: "LOCAL_SCANNER_RELEASE_READY",
  releaseId: manifest.releaseId,
  scannerVersion: manifest.scannerVersion,
  signingKeyId,
  publicKeyFingerprint: fingerprint,
  privateKeyPath,
  trustPath,
  manifestPath: built.manifest,
  bootstrap: parseLastJson(bootstrap.stdout, "SCANNER_GOVERNANCE_BOOTSTRAP_OUTPUT")
}, null, 2)}\n`);

async function loadOrCreatePrivateKey() {
  try {
    return (await readFile(privateKeyPath, "utf8")).trim();
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const pair = generateKeyPairSync("ed25519", { privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "der" } });
    await writeFile(privateKeyPath, `${pair.privateKey}\n`, { encoding: "utf8", mode: 0o600 });
    return pair.privateKey;
  }
}

async function writePrivateKey(value) {
  await writeFile(privateKeyPath, `${value.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  await protectFile(privateKeyPath);
}

async function loadTrustStore() {
  try {
    const value = JSON.parse(await readFile(trustPath, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("SCANNER_TRUST_STORE_INVALID");
    return { keys: { ...(value.keys ?? {}) }, revokedReleaseIds: [...(value.revokedReleaseIds ?? [])], minimumScannerVersion: value.minimumScannerVersion ?? "" };
  } catch (error) {
    if (error?.code === "ENOENT") return { keys: {}, revokedReleaseIds: [], minimumScannerVersion: "" };
    throw error;
  }
}

function rawEd25519PublicKey(key) {
  const der = key.export({ format: "der", type: "spki" });
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  if (der.length !== prefix.length + 32 || !der.subarray(0, prefix.length).equals(prefix)) throw new Error("SCANNER_PUBLIC_KEY_FORMAT_INVALID");
  return der.subarray(prefix.length);
}

function run(command, args, env, shell = false) {
  const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    throw new Error(`COMMAND_FAILED:${command}:${result.status}`);
  }
  return result;
}

function parseLastJson(output, code) {
  const lines = String(output).trim().split(/\r?\n/u).reverse();
  for (let end = lines.length; end > 0; end -= 1) {
    for (let start = end - 1; start >= 0; start -= 1) {
      try { return JSON.parse(lines.slice(start, end).reverse().join("\n")); } catch { /* ignore command banners */ }
    }
  }
  throw new Error(code);
}

function protectFile(path) {
  return chmod(path, 0o600).catch(() => undefined);
}

function pnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function localVersion() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/gu, "").slice(0, 14);
  return `2.1.0-local.${stamp}`;
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}
