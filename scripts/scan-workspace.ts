import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { buildScanReport, type ArchitectureScopeRef, type LocalFileSnapshot } from "@specforge/core";

const ignoredDirectoryNames = new Set([".git", "node_modules", "vendor", "dist", "build", "coverage", ".next", "target"]);
const ignoredFilePattern = /(^|\/)(\.env(?:\.|$)|.*\.(pem|key|p12|pfx|jks)|id_rsa(?:\.|$))/i;
const maxFileBytes = 2 * 1024 * 1024;

interface ScanOptions {
  root: string;
  output?: string;
  architectureScope: ArchitectureScopeRef;
}

export async function collectWorkspaceFiles(root: string): Promise<LocalFileSnapshot[]> {
  const files: LocalFileSnapshot[] = [];
  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
      const absolutePath = join(directory, entry.name);
      const relativePath = relative(root, absolutePath).replaceAll("\\", "/");
      if (ignoredFilePattern.test(relativePath)) continue;
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const metadata = await stat(absolutePath);
      if (metadata.size > maxFileBytes) continue;
      const content = await readFile(absolutePath, "utf8");
      files.push({ path: relativePath, content, sizeBytes: metadata.size });
    }
  }
  await visit(root);
  return files;
}

export async function scanWorkspace(options: ScanOptions) {
  const files = await collectWorkspaceFiles(options.root);
  const report = buildScanReport({ rootLabel: options.root, architectureScope: options.architectureScope, files, generatedAt: new Date().toISOString() });
  if (options.output) {
    await mkdir(dirname(resolve(options.output)), { recursive: true });
    await writeFile(resolve(options.output), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function parseArgs(argv: string[]): ScanOptions {
  const root = resolve(valueAfter(argv, "--root") ?? process.cwd());
  const applicationServiceId = valueAfter(argv, "--application-service-id") ?? process.env.SPECFORGE_APPLICATION_SERVICE_ID;
  const scopePath = valueAfter(argv, "--scope-path") ?? process.env.SPECFORGE_SCOPE_PATH;
  if (!applicationServiceId || !scopePath) throw new Error("SCAN_SCOPE_REQUIRED");
  return { root, output: valueAfter(argv, "--output"), architectureScope: { applicationServiceId, scopePath } };
}

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

if (process.argv[1]?.endsWith("scan-workspace.ts")) {
  scanWorkspace(parseArgs(process.argv.slice(2)))
    .then((report) => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch((error: unknown) => {
      process.stderr.write(`${error instanceof Error ? error.message : "SCAN_FAILED"}\n`);
      process.exitCode = 1;
    });
}
