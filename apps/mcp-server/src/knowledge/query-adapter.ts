import { defaultHuaweiActor, normalizePrincipalClaims, type ArchitectureScopeRef, type ScopedPrincipal } from "@specforge/core";
import {
  createThreeAProjectionQueryService,
  PrismaThreeAQueryRepository,
  PrismaTraceContinuationStore,
  type ThreeAProjectionQueryService
} from "@specforge/knowledge-query";
import { currentRequestPrincipal } from "../auth";
import { prisma } from "../persistence";

let queryService: ThreeAProjectionQueryService | undefined;

export function getThreeAQueryService(): ThreeAProjectionQueryService {
  queryService ??= createThreeAProjectionQueryService(
    new PrismaThreeAQueryRepository(prisma),
    new PrismaTraceContinuationStore(prisma),
    cursorKeyring()
  );
  return queryService;
}

export function queryPrincipal(scope: ArchitectureScopeRef): ScopedPrincipal {
  const principal = currentRequestPrincipal();
  if (principal) return principal;
  if (process.env.NODE_ENV === "production") throw new Error("AUTHENTICATION_REQUIRED");
  return normalizePrincipalClaims({
    actorType: defaultHuaweiActor.actorType,
    subject: defaultHuaweiActor.actorId,
    tenantId: process.env.SPECFORGE_TENANT_ID ?? "local-development",
    authSource: "system",
    grants: defaultHuaweiActor.grants,
    permissions: ["knowledge:read"],
    decisionRef: "local-development-principal"
  });
}

export function queryInput<T extends object>(scope: ArchitectureScopeRef, input: T) {
  return { ...input, architectureScope: scope, principal: queryPrincipal(scope) };
}

function cursorKeyring() {
  const configured = process.env.SPECFORGE_3A_CURSOR_KEY?.trim();
  if (!configured && process.env.NODE_ENV === "production") throw new Error("SPECFORGE_3A_CURSOR_KEY_REQUIRED");
  return {
    activeKeyId: process.env.SPECFORGE_3A_CURSOR_KEY_ID ?? "local-development",
    keys: { [process.env.SPECFORGE_3A_CURSOR_KEY_ID ?? "local-development"]: Buffer.from(configured ?? "specforge-local-development-cursor-key", "utf8") }
  };
}

export async function list3aPublishedBaselines(input: { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().listPublishedBaselines(queryInput(input.architectureScope, {}));
}

export async function list3aProjectionManifests(input: { architectureScope: ArchitectureScopeRef; baselineId: string }) {
  return getThreeAQueryService().listProjectionManifests(queryInput(input.architectureScope, { baselineId: input.baselineId }));
}

export async function search3aArchitectureFacts(input: Record<string, unknown> & { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().searchArchitectureFacts(queryInput(input.architectureScope, omitScope(input)) as never);
}

export async function trace3aArchitecturePath(input: Record<string, unknown> & { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().traceArchitecturePath(queryInput(input.architectureScope, omitScope(input)) as never);
}

export async function get3aArchitectureFact(input: Record<string, unknown> & { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().getArchitectureFactDetail(queryInput(input.architectureScope, omitScope(input)) as never);
}

export async function get3aAlignment(input: { architectureScope: ArchitectureScopeRef; baselineId: string; projectionManifestId: string }) {
  return getThreeAQueryService().getArchitectureAlignment(queryInput(input.architectureScope, { baselineId: input.baselineId, projectionManifestId: input.projectionManifestId }));
}

export async function compare3aPublishedBaselines(input: Record<string, unknown> & { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().comparePublishedBaselines(queryInput(input.architectureScope, omitScope(input)) as never);
}

export async function query3aArchitectureMap(input: Record<string, unknown> & { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().architectureMap(queryInput(input.architectureScope, omitScope(input)) as never);
}

export async function query3aArchitectureUnitNeighborhood(input: Record<string, unknown> & { architectureScope: ArchitectureScopeRef }) {
  return getThreeAQueryService().architectureUnitNeighborhood(queryInput(input.architectureScope, omitScope(input)) as never);
}

function omitScope<T extends Record<string, unknown>>(input: T): Omit<T, "architectureScope"> {
  const { architectureScope: _architectureScope, ...rest } = input;
  return rest;
}
