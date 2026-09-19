import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export const DEFAULT_IGNORED_DIRECTORIES = new Set([".git", ".specforge", "node_modules", "dist", "build", ".next", "coverage", "target", "vendor"]);
export const SENSITIVE_PATH = /(^|[\\/])\.env(?:\.|$)|\.(?:pem|key|p12|pfx|jks)$/iu;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalJson(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("CANONICAL_JSON_NON_FINITE_NUMBER");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!value || typeof value !== "object") throw new Error("CANONICAL_JSON_VALUE_INVALID");
  return `{${Object.keys(value).sort().map((key) => `${canonicalJson(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export async function collectRepositoryFiles(root, { ignorePatterns = [], maxSourceFileBytes = 10 * 1024 * 1024 } = {}) {
  const repositoryRoot = resolve(root);
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolute = join(directory, entry.name);
      const relativePath = relative(repositoryRoot, absolute).replaceAll("\\", "/");
      if (SENSITIVE_PATH.test(relativePath) || ignorePatterns.some((pattern) => relativePath === pattern || relativePath.startsWith(pattern.replace(/\*\*$/u, "")))) continue;
      const metadata = await lstat(absolute);
      if (metadata.isSymbolicLink()) continue;
      if (metadata.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!metadata.isFile() || metadata.size > maxSourceFileBytes) continue;
      files.push({ path: relativePath, sizeBytes: metadata.size, content: await readFile(absolute, "utf8") });
    }
  }
  await visit(repositoryRoot);
  return files;
}

export function fileDescriptor(path) {
  const lower = path.toLowerCase();
  const extension = lower.includes(".") ? `.${lower.split(".").pop()}` : "";
  const language = { ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".mjs": "javascript", ".go": "go", ".java": "java", ".kt": "kotlin", ".py": "python", ".sql": "sql", ".yaml": "yaml", ".yml": "yaml", ".json": "json", ".md": "markdown", ".proto": "protobuf" }[extension] ?? "unknown";
  if (/openapi[^/]*\.(json|ya?ml)$/u.test(lower)) return { language, observationType: "api-contract", architectureLayer: "SYS", aspectHint: "api" };
  if (/asyncapi[^/]*\.(json|ya?ml)$/u.test(lower)) return { language, observationType: "event-contract", architectureLayer: "SYS", aspectHint: "event" };
  if (lower.endsWith("schema.prisma") || lower.endsWith(".sql")) return { language, observationType: "data-model", architectureLayer: "TECH", aspectHint: "dataModel" };
  if (lower.endsWith(".md")) return { language, observationType: "documentation", architectureLayer: "BIZ", aspectHint: "knowledge" };
  if (/(^|[/])(package\.json|pom\.xml|go\.mod|pyproject\.toml|dockerfile|docker-compose[^/]*\.ya?ml)$/u.test(lower)) return { language, observationType: "system-component", architectureLayer: "TECH", aspectHint: "service" };
  if (/\.(ts|tsx|js|mjs|go|java|kt|py|sql|proto)$/u.test(lower)) return { language, observationType: "source-file", architectureLayer: "UNKNOWN", aspectHint: "source" };
  return null;
}

export function buildBatchDigest(batch) {
  const payloadDigest = sha256(canonicalJson({ observations: batch.observations, coverageDelta: batch.coverageDelta }));
  return sha256(canonicalJson({
    contractVersion: batch.contractVersion,
    sessionId: batch.sessionId,
    sequence: batch.sequence,
    previousBatchDigest: batch.previousBatchDigest,
    sessionNonceDigest: batch.sessionNonceDigest,
    architectureScope: batch.architectureScope,
    payloadDigest
  }));
}
