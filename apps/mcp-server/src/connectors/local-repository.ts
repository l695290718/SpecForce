import {
  buildScanReport,
  contentDigest,
  scanFilePath,
  type ArchitectureScopeRef,
  type ConnectorObservationPage,
  type ConnectorSourceAdapter,
  type ConnectorSourcePollInput,
  type LocalFileSnapshot
} from "@specforge/core";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const DEFAULT_MAX_SOURCE_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_SOURCE_NAMESPACE = "local-repository-v1";
const IGNORED_DIRECTORIES = new Set([".git", ".specforge", "node_modules", "vendor", "dist", "build", "coverage", ".next", "target"]);

export interface LocalRepositorySourceAdapterOptions {
  root: string;
  architectureScope: ArchitectureScopeRef;
  sourceNamespace?: string;
  maxSourceFileBytes?: number;
}

export class LocalRepositorySourceAdapter implements ConnectorSourceAdapter {
  readonly kind = "local-repository";
  readonly sourceNamespace: string;
  private readonly root: string;
  private readonly architectureScope: ArchitectureScopeRef;
  private readonly maxSourceFileBytes: number;

  constructor(options: LocalRepositorySourceAdapterOptions) {
    if (!options.root || !options.architectureScope.applicationServiceId || !options.architectureScope.scopePath) throw new Error("CONNECTOR_CONFIGURATION_INVALID");
    this.root = options.root;
    this.architectureScope = options.architectureScope;
    this.sourceNamespace = options.sourceNamespace ?? DEFAULT_SOURCE_NAMESPACE;
    this.maxSourceFileBytes = options.maxSourceFileBytes ?? DEFAULT_MAX_SOURCE_FILE_BYTES;
  }

  async poll(input: ConnectorSourcePollInput): Promise<ConnectorObservationPage> {
    assertScope(this.architectureScope, input.architectureScope);
    const files = await collectFiles(this.root, this.maxSourceFileBytes, input.signal);
    const report = buildScanReport({
      rootLabel: this.root,
      architectureScope: this.architectureScope,
      files,
      scannerId: "specforge-local-repository-connector",
      scannerVersion: "1",
      generatedAt: stableObservedAt(contentDigest(files.map((file) => ({ path: file.path, content: file.content }))))
    });
    const snapshotDigest = report.manifestDigest;
    const checkpoint = parseCursor(input.checkpoint?.sourceCursor);
    const offset = checkpoint?.snapshotDigest === snapshotDigest ? checkpoint.offset : 0;
    const observations = report.observations.map((observation) => ({
      id: observation.id,
      externalAssetType: observation.observationType,
      externalId: `${observation.sourcePath}:${observation.id}`,
      payload: { ...observation.payload, sourcePath: observation.sourcePath, observationId: observation.id, snapshotDigest },
      sourceVersion: snapshotDigest,
      observedAt: report.generatedAt
    }));
    if (offset >= observations.length) {
      return {
        sourceCursor: cursor(snapshotDigest, observations.length),
        sourceVersion: snapshotDigest,
        observedAt: report.generatedAt,
        observations: [],
        coverage: { ...report.coverage, snapshotDigest },
        hasMore: false
      };
    }
    const end = Math.min(offset + Math.max(1, Math.min(input.maxObservations, 500)), observations.length);
    return {
      sourceCursor: cursor(snapshotDigest, end),
      sourceVersion: snapshotDigest,
      observedAt: report.generatedAt,
      observations: observations.slice(offset, end),
      coverage: { ...report.coverage, snapshotDigest, pageOffset: offset, pageSize: end - offset },
      hasMore: end < observations.length
    };
  }
}

async function collectFiles(root: string, maxSourceFileBytes: number, signal?: AbortSignal): Promise<LocalFileSnapshot[]> {
  const files: LocalFileSnapshot[] = [];
  async function walk(directory: string): Promise<void> {
    if (signal?.aborted) throw new Error("CONNECTOR_POLL_ABORTED");
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (signal?.aborted) throw new Error("CONNECTOR_POLL_ABORTED");
      if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const metadata = await stat(absolutePath);
      if (metadata.size > maxSourceFileBytes) continue;
      const path = relative(root, absolutePath).split(sep).join("/");
      if (!scanFilePath(path)) continue;
      const content = await readFile(absolutePath, "utf8");
      files.push({ path, content, sizeBytes: metadata.size });
    }
  }
  await walk(root);
  return files;
}

function parseCursor(value: string | null | undefined): { snapshotDigest: string; offset: number } | null {
  if (!value) return null;
  const match = /^local-repository:v1:([0-9a-f]{64}):(\d+)$/u.exec(value);
  return match ? { snapshotDigest: match[1]!, offset: Number(match[2]) } : null;
}

function cursor(snapshotDigest: string, offset: number): string {
  return `local-repository:v1:${snapshotDigest}:${offset}`;
}

function stableObservedAt(snapshotDigest: string): string {
  const seconds = Number.parseInt(snapshotDigest.slice(0, 12), 16) % 3_155_695_200;
  return new Date(Date.UTC(2000, 0, 1) + seconds * 1_000).toISOString();
}

function assertScope(expected: ArchitectureScopeRef, actual: ArchitectureScopeRef): void {
  if (expected.applicationServiceId !== actual.applicationServiceId || expected.scopePath !== actual.scopePath) throw new Error("SCOPE_MISMATCH");
}
