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
const nativeVersion = nextPatch(version);

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

const portableBuild = run(process.execPath, [
  resolve(root, "scripts", "build-portable-scanner-release.mjs"),
  "--version", version
], {
  ...process.env,
  SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY: privateKey,
  SPECFORGE_SCANNER_RELEASE_SIGNING_KEY_ID: signingKeyId
});
const nativeBuild = run(process.execPath, [
  resolve(root, "scripts", "build-native-scanner-release.mjs"),
  "--version", nativeVersion
], {
  ...process.env,
  SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY: privateKey,
  SPECFORGE_SCANNER_RELEASE_SIGNING_KEY_ID: signingKeyId
});
const portable = parseLastJson(portableBuild.stdout, "PORTABLE_SCANNER_RELEASE_BUILD_OUTPUT");
const native = parseLastJson(nativeBuild.stdout, "NATIVE_SCANNER_RELEASE_BUILD_OUTPUT");
const portableManifest = JSON.parse(await readFile(portable.manifest, "utf8"));
const nativeManifest = JSON.parse(await readFile(native.manifest, "utf8"));
const bootstraps = [portableManifest, nativeManifest].map((manifest) => parseLastJson(run(pnpmCommand(), ["scan-governance:bootstrap"], {
  ...process.env,
  SPECFORGE_SCANNER_RELEASE_MANIFEST: JSON.stringify(manifest),
  SPECFORGE_SCANNER_RELEASE_TRUST_BUNDLE: JSON.stringify(trust.keys)
}, true).stdout, "SCANNER_GOVERNANCE_BOOTSTRAP_OUTPUT"));
const activeReleasePath = join(localRoot, "active-release.json");
await writeFile(activeReleasePath, `${JSON.stringify({ preferredReleaseId: nativeManifest.releaseId, nativeManifestPath: native.manifest, portableManifestPath: portable.manifest, trustPath }, null, 2)}\n`, "utf8");
await protectFile(activeReleasePath);

process.stdout.write(`${JSON.stringify({
  status: "LOCAL_SCANNER_RELEASE_READY",
  releaseId: nativeManifest.releaseId,
  releaseIds: [nativeManifest.releaseId, portableManifest.releaseId],
  scannerVersion: nativeManifest.scannerVersion,
  signingKeyId,
  publicKeyFingerprint: fingerprint,
  privateKeyPath,
  trustPath,
  activeReleasePath,
  manifestPath: native.manifest,
  manifestPaths: [native.manifest, portable.manifest],
  bootstraps
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
  return `2.1.${stamp}`;
}

function nextPatch(value) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isSafeInteger(part) || part < 0)) throw new Error("SCANNER_VERSION_INVALID");
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}
