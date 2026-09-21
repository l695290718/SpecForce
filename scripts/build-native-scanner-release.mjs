#!/usr/bin/env node
import { createHash, createPrivateKey, sign } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliRoot = resolve(root, "apps/specforge-cli");
const args = process.argv.slice(2);
const version = valueAfter(args, "--version") ?? "2.1.0";
const outputRoot = resolve(root, valueAfter(args, "--output") ?? "dist/scanner-native");
const signingKey = process.env.SPECFORGE_SCANNER_RELEASE_PRIVATE_KEY;
const signingKeyId = process.env.SPECFORGE_SCANNER_RELEASE_SIGNING_KEY_ID ?? "development-native-key";

if (args.includes("--check")) {
  run("go", ["test", "./internal/extractors", "./internal/technology", "./internal/scanner"], cliRoot);
  process.stdout.write("Native scanner inputs and framework extractors are valid.\n");
  process.exit(0);
}
if (!signingKey) throw new Error("SCANNER_RELEASE_PRIVATE_KEY_REQUIRED");

const probeDirectory = join(outputRoot, ".probe");
await mkdir(probeDirectory, { recursive: true });
const probePath = join(probeDirectory, process.platform === "win32" ? "specforge.exe" : "specforge");
run("go", ["build", "-trimpath", "-ldflags", "-s -w", "-o", probePath, "."], cliRoot);
const metadata = JSON.parse(run(probePath, ["scanner-metadata"], root).stdout);
const releaseDirectory = join(outputRoot, version, metadata.platform);
await mkdir(releaseDirectory, { recursive: true });
const artifactPath = join(releaseDirectory, process.platform === "win32" ? "specforge.exe" : "specforge");
run("go", ["build", "-trimpath", "-ldflags", "-s -w", "-o", artifactPath, "."], cliRoot);

const artifact = await readFile(artifactPath);
const artifactMetadata = await stat(artifactPath);
const artifactDigest = createHash("sha256").update(artifact).digest("hex");
const issuedAt = new Date().toISOString();
const unsigned = {
  contractVersion: "2.0",
  releaseId: `scanner-release:${version}-${metadata.platform}`,
  scannerVersion: version,
  platform: metadata.platform,
  artifactKind: "NATIVE_BINARY",
  architecture: metadata.architecture,
  artifact: { uri: pathToFileURL(artifactPath).href, sha256: artifactDigest, sizeBytes: artifactMetadata.size },
  entrypoint: artifactPath.split(/[\\/]/u).at(-1),
  schemaVersions: ["2.0"],
  extractors: metadata.extractors,
  signingKeyId,
  algorithm: "Ed25519",
  issuedAt,
  expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  status: "ACTIVE"
};
const canonical = canonicalJson(unsigned);
const key = signingKey.includes("BEGIN") ? createPrivateKey(signingKey) : createPrivateKey({ key: Buffer.from(signingKey.replace(/\s/gu, ""), "base64"), format: "der", type: "pkcs8" });
const signature = sign(null, Buffer.from(canonical), key).toString("base64");
const manifestPath = join(releaseDirectory, "manifest.json");
await writeFile(manifestPath, `${JSON.stringify({ ...unsigned, signature }, null, 2)}\n`, "utf8");
await writeFile(join(releaseDirectory, "manifest.canonical.json"), canonical, "utf8");
process.stdout.write(`${JSON.stringify({ releaseId: unsigned.releaseId, manifest: manifestPath, artifact: artifactPath, artifactDigest, metadata })}\n`);

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`COMMAND_FAILED:${command}:${result.status}:${result.stderr || result.stdout}`);
  return result;
}

function valueAfter(values, flag) {
  const index = values.indexOf(flag);
  return index >= 0 ? values[index + 1] : undefined;
}

function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}
