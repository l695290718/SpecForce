#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from "node:crypto";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "apps/specforge-cli/portable");
const args = process.argv.slice(2);
const version = valueAfter(args, "--version") ?? "2.1.0";
const outputRoot = resolve(root, valueAfter(args, "--output") ?? "dist/scanner-portable");
const signingKey = process.env.SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY;
const signingKeyId = process.env.SPECFORGE_SCANNER_RELEASE_SIGNING_KEY_ID ?? "development-portable-key";

await assertSources();
if (args.includes("--check")) {
  process.stdout.write(`Portable scanner inputs valid for Node ${process.versions.node}.\n`);
  process.exit(0);
}
if (!signingKey) throw new Error("SCANNER_RELEASE_PRIVATE_KEY_REQUIRED");

const releaseDirectory = join(outputRoot, version, "any");
await mkdir(releaseDirectory, { recursive: true });
await cp(source, releaseDirectory, { recursive: true });
const artifactDigest = await directoryDigest(releaseDirectory);
const issuedAt = new Date().toISOString();
const unsigned = {
  contractVersion: "2.0",
  releaseId: `scanner-release:${version}-portable`,
  scannerVersion: version,
  platform: "any",
  artifactKind: "PORTABLE_SCRIPT",
  architecture: "any",
  artifact: { uri: `file://${releaseDirectory.replaceAll("\\", "/")}`, sha256: artifactDigest, sizeBytes: await directorySize(releaseDirectory) },
  runtime: { name: "node", versionRange: ">=20 <25" },
  entrypoint: "scanner.mjs",
  schemaVersions: ["2.0"],
  extractors: [{ id: "portable-repository-observer", version: "1.0.0" }],
  signingKeyId,
  algorithm: "Ed25519",
  issuedAt,
  expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  status: "ACTIVE"
};
const canonical = canonicalJson(unsigned);
const key = signingKey.includes("BEGIN") ? createPrivateKey(signingKey) : createPrivateKey({ key: Buffer.from(signingKey.replace(/\s/gu, ""), "base64"), format: "der", type: "pkcs8" });
const signature = sign(null, Buffer.from(canonical), key).toString("base64");
await writeFile(join(releaseDirectory, "manifest.json"), `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`, "utf8");
await writeFile(join(releaseDirectory, "manifest.canonical.json"), canonical, "utf8");
process.stdout.write(`${JSON.stringify({ releaseId: unsigned.releaseId, manifest: join(releaseDirectory, "manifest.json"), artifactDigest })}\n`);

async function assertSources() {
  if (Number(process.versions.node.split(".")[0]) < 20) throw new Error("NODE_RUNTIME_UNSUPPORTED");
  for (const name of ["scanner.mjs", "runtime.mjs"]) await stat(join(source, name));
}

async function directoryDigest(directory) {
  const entries = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name === "manifest.json" || name === "manifest.canonical.json") continue;
    const path = join(directory, name);
    const metadata = await stat(path);
    if (metadata.isFile()) entries.push({ path: name, sha256: createHash("sha256").update(await readFile(path)).digest("hex"), sizeBytes: metadata.size });
  }
  return createHash("sha256").update(canonicalJson(entries)).digest("hex");
}

async function directorySize(directory) {
  let total = 0;
  for (const name of await readdir(directory)) {
    const metadata = await stat(join(directory, name));
    if (metadata.isFile()) total += metadata.size;
  }
  return total;
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
