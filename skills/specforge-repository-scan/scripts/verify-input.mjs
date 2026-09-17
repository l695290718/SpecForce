import fs from "node:fs";
import path from "node:path";

function assertScope(value, code, message) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(code);
  if (value.includes("\\") || value.split("/").some((part) => part === ".." || part === "" && value !== "")) throw new Error(message);
}

function normalizeRelativeList(values, repositoryPath, field) {
  if (values === undefined) return [];
  if (!Array.isArray(values)) throw new Error(`SCAN_${field.toUpperCase()}_INVALID`);
  return values.map((value) => {
    if (typeof value !== "string" || value.trim() === "") throw new Error(`SCAN_${field.toUpperCase()}_INVALID`);
    const normalized = value.replaceAll("\\", "/").replace(/^\.\//u, "");
    if (path.posix.isAbsolute(normalized) || normalized.split("/").includes("..")) throw new Error(`SCAN_${field.toUpperCase()}_OUTSIDE_REPOSITORY`);
    const candidate = path.resolve(repositoryPath, normalized);
    const relative = path.relative(repositoryPath, candidate);
    if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error(`SCAN_${field.toUpperCase()}_OUTSIDE_REPOSITORY`);
    return normalized || ".";
  });
}

export function verifyInput(input) {
  if (!input || typeof input !== "object") throw new Error("SCAN_INPUT_REQUIRED");
  if (typeof input.repositoryPath !== "string" || input.repositoryPath.trim() === "") throw new Error("SCAN_REPOSITORY_PATH_REQUIRED");
  const repositoryPath = fs.realpathSync(input.repositoryPath);
  if (!fs.statSync(repositoryPath).isDirectory()) throw new Error("SCAN_REPOSITORY_DIRECTORY_REQUIRED");
  if (typeof input.applicationServiceId !== "string" || input.applicationServiceId.trim() === "") throw new Error("SCAN_SCOPE_REQUIRED");
  assertScope(input.applicationServiceId, "SCAN_SCOPE_REQUIRED", "SCAN_SCOPE_INVALID");
  if (typeof input.scopePath !== "string" || input.scopePath.trim() === "") throw new Error("SCAN_SCOPE_PATH_REQUIRED");
  assertScope(input.scopePath, "SCAN_SCOPE_PATH_REQUIRED", "SCAN_SCOPE_PATH_INVALID");
  return {
    ...input,
    repositoryPath,
    applicationServiceId: input.applicationServiceId.trim(),
    scopePath: input.scopePath.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, ""),
    includePaths: normalizeRelativeList(input.includePaths, repositoryPath, "include_paths"),
    excludePaths: normalizeRelativeList(input.excludePaths, repositoryPath, "exclude_paths")
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const input = JSON.parse(process.argv[2] ?? "{}");
  process.stdout.write(`${JSON.stringify(verifyInput(input))}\n`);
}
