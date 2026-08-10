import { scopeById, type ArchitectureScopeRef } from "@specforge/core";
import { ThreeAQueryError, type ThreeAProjectionQueryService } from "@specforge/knowledge-query";
import { z } from "zod";
import { resolveThreeARequest, type ResolvedThreeARequest } from "./principal";
import { threeAWebQuerySchema, type ThreeAWebQuery } from "./query-protocol";

export interface ThreeAQueryHandlerDependencies {
  resolveRequest: (request: Request, architectureScope: ArchitectureScopeRef) => Promise<ResolvedThreeARequest>;
  createService: () => ThreeAProjectionQueryService;
}

const statusByCode: Record<string, number> = {
  SCOPE_ACCESS_DENIED: 403,
  ARCHITECTURE_FACT_NOT_FOUND: 404,
  FOCUS_NOT_IN_BASELINE: 404,
  CURSOR_INVALID: 409,
  QUERY_FILTER_INVALID: 400,
  INVALID_REQUEST: 400,
  PROJECTION_MANIFEST_REQUIRED: 404,
  BASELINE_NOT_FOUND: 404,
  QUERY_BUDGET_INVALID: 400
};

export async function handleThreeAQuery(request: Request, dependencies: ThreeAQueryHandlerDependencies): Promise<Response> {
  try {
    const parsed = threeAWebQuerySchema.parse(await request.json());
    const catalogScope = scopeById(parsed.scope);
    if (!catalogScope || catalogScope.level !== "applicationService") return jsonError("SCOPE_ACCESS_DENIED", 403);
    const architectureScope = { applicationServiceId: catalogScope.id, scopePath: catalogScope.scopePath };
    const resolved = await dependencies.resolveRequest(request, architectureScope);
    if (resolved.architectureScope.applicationServiceId !== architectureScope.applicationServiceId || resolved.architectureScope.scopePath !== architectureScope.scopePath) {
      return jsonError("SCOPE_ACCESS_DENIED", 403);
    }
    const service = dependencies.createService();
    const identity = { ...resolved, baselineId: parsed.baselineId, projectionManifestId: parsed.projectionManifestId };
    if (parsed.operation === "search") {
      return Response.json(await service.searchArchitectureFacts({ ...identity, layer: parsed.layer, query: parsed.query, limit: parsed.limit, cursor: parsed.cursor }));
    }
    if (parsed.operation === "detail") {
      return Response.json(await service.getArchitectureFactDetail({ ...identity, assertionId: parsed.assertionId }));
    }
    return Response.json(await service.traceArchitecturePath({
      ...identity,
      startAssertionId: parsed.startAssertionId,
      direction: parsed.direction,
      relationTypes: unique(parsed.relationTypes),
      layers: unique(parsed.layers),
      continuation: parsed.continuation,
      budget: { maxDepth: 1, maxNodes: 100, maxEdges: 200, maxPaths: 100, timeoutMs: 2_000, maxPayloadBytes: 524_288 }
    }));
  } catch (error) {
    if (error instanceof z.ZodError) return jsonError("INVALID_REQUEST", 400);
    const code = safeThreeAErrorCode(error);
    return jsonError(code, statusByCode[code] ?? 503);
  }
}

export function defaultThreeAQueryHandlerDependencies(): ThreeAQueryHandlerDependencies {
  return {
    resolveRequest: (request, architectureScope) => resolveThreeARequest({
      architectureScope,
      authMode: process.env.NODE_ENV === "production" ? "production" : "seed",
      headers: request.headers,
      cookies: { get: () => undefined }
    }),
    createService: () => { throw new Error("THREE_A_QUERY_SERVICE_REQUIRED"); }
  };
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)].sort() as T[];
}

function jsonError(code: string, status: number): Response {
  return Response.json({ code }, { status });
}

function safeThreeAErrorCode(error: unknown): string {
  if (error instanceof ThreeAQueryError) return error.code;
  const code = error instanceof Error ? error.message : "UNAVAILABLE";
  return statusByCode[code] ? code : "UNAVAILABLE";
}
