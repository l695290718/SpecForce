import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import yaml from "js-yaml";
import { contentDigest, type ConnectorObservationPageV2, type ConnectorRunDescriptor, type ConnectorV2SourceAdapter } from "@specforge/core";
import { HttpPolicy } from "./http-policy";

export const OPENAPI_SOURCE_NAMESPACE = "openapi-v1";

export interface OpenApiAdapterOptions {
  document?: Record<string, unknown>;
  localFile?: string;
  allowedLocalRoots?: readonly string[];
  httpPolicy?: HttpPolicy;
}

export class OpenApiSourceAdapter implements ConnectorV2SourceAdapter {
  readonly kind = "openapi";
  readonly sourceNamespace = OPENAPI_SOURCE_NAMESPACE;
  private readonly options: OpenApiAdapterOptions;

  constructor(options: OpenApiAdapterOptions) { this.options = options; }

  async poll(input: { run: ConnectorRunDescriptor; fencingToken: number; signal?: AbortSignal }): Promise<ConnectorObservationPageV2> {
    const document = await this.load(input.signal);
    const version = typeof document.openapi === "string" ? document.openapi : "";
    if (!/^3\.(0|1)(?:\.\d+)?$/u.test(version)) throw new Error("OPENAPI_VERSION_UNSUPPORTED");
    const paths = isRecord(document.paths) ? document.paths : {};
    const observations = Object.entries(paths).flatMap(([path, item]) => Object.entries(isRecord(item) ? item : {}).filter(([method]) => HTTP_METHODS.has(method.toLowerCase())).map(([method, operation]) => {
      const operationObject = isRecord(operation) ? operation : {};
      const operationId = typeof operationObject.operationId === "string" ? operationObject.operationId : `${method.toUpperCase()} ${path}`;
      const externalId = `operation:${operationId}`;
      return { id: `openapi:${externalId}`, operation: "UPSERT" as const, externalAssetType: "api-operation", externalId, payload: { method: method.toUpperCase(), path, operationId, tags: operationObject.tags ?? [], parameters: operationObject.parameters ?? [], responses: operationObject.responses ?? {} }, sourceVersion: version };
    }));
    const observedAt = new Date().toISOString();
    return { sourceCursor: null, sourceHighWaterMark: observedAt, sourceVersion: version, observedAt, observations, coverage: { complete: true, operationCount: observations.length, documentDigest: contentDigest(document), unsupportedReferences: findUnsupportedReferences(document) }, isLastPage: true };
  }

  private async load(signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (this.options.document) return this.options.document;
    if (this.options.localFile) {
      const file = resolve(this.options.localFile);
      const roots = (this.options.allowedLocalRoots ?? []).map((root) => resolve(root));
      if (!roots.some((root) => { const relativePath = relative(root, file); return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath)); })) throw new Error("OPENAPI_LOCAL_FILE_OUTSIDE_ROOT");
      return parseDocument(await readFile(file, "utf8"));
    }
    throw new Error("OPENAPI_SOURCE_REQUIRED");
  }
}

function parseDocument(text: string): Record<string, unknown> {
  try { const parsed = yaml.load(text); if (!isRecord(parsed)) throw new Error(); return parsed; } catch { throw new Error("OPENAPI_DOCUMENT_INVALID"); }
}
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function findUnsupportedReferences(value: unknown, seen = new Set<unknown>()): string[] { if (!isRecord(value) && !Array.isArray(value)) return []; if (seen.has(value)) return ["cyclic-reference"]; seen.add(value); const refs: string[] = []; const record = isRecord(value) ? value as Record<string, unknown> : null; const ref = typeof record?.["$ref"] === "string" ? record["$ref"] : null; if (ref && !ref.startsWith("#/")) refs.push(ref); const children = record ? Object.values(record) : value as unknown[]; for (const child of children) refs.push(...findUnsupportedReferences(child, seen)); seen.delete(value); return [...new Set(refs)]; }
const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
