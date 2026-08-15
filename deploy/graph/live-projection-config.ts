import { huaweiArchitectureScopes } from "../../packages/core/src/architecture/mock";
import type { ArchitectureScope } from "../../packages/core/src/architecture/types";

export interface GraphHealthConfig {
  applicationServiceId: string;
  scopePath: string;
  enterpriseId: string;
  gatewayUrl: string;
  projectorHealthUrl: string;
  databaseUrl: string;
  liveRunId: string;
  scope: ArchitectureScope;
}

export function resolveGraphHealthConfig(env: NodeJS.ProcessEnv): GraphHealthConfig {
  const applicationServiceId = required(env.SPECFORGE_GRAPH_HEALTH_APPLICATION_SERVICE_ID, "GRAPH_HEALTH_APPLICATION_SERVICE_REQUIRED");
  const scopePath = required(env.SPECFORGE_GRAPH_HEALTH_SCOPE_PATH, "GRAPH_HEALTH_SCOPE_PATH_REQUIRED");
  const enterpriseId = required(env.SPECFORGE_GRAPH_HEALTH_ENTERPRISE_ID ?? env.SPECFORGE_ENTERPRISE_ID, "GRAPH_HEALTH_ENTERPRISE_REQUIRED");
  const databaseUrl = required(env.SPECFORGE_GRAPH_HEALTH_DATABASE_URL ?? env.DATABASE_URL, "GRAPH_HEALTH_DATABASE_REQUIRED");
  const liveRunId = required(env.SPECFORGE_GRAPH_LIVE_RUN_ID, "GRAPH_HEALTH_RUN_ID_REQUIRED");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(liveRunId) || liveRunId.toLowerCase() === "manual") throw new Error("GRAPH_HEALTH_RUN_ID_INVALID");
  const scope = huaweiArchitectureScopes.find((item) => item.id === applicationServiceId);
  if (!scope || scope.level !== "applicationService" || scope.purpose !== "verification") throw new Error("GRAPH_HEALTH_VERIFICATION_SCOPE_REQUIRED");
  if (scope.scopePath !== scopePath) throw new Error("GRAPH_HEALTH_SCOPE_MISMATCH");
  return {
    applicationServiceId,
    scopePath,
    enterpriseId,
    databaseUrl,
    liveRunId,
    scope,
    gatewayUrl: (env.SPECFORGE_GRAPH_GATEWAY_URL?.trim() || "http://127.0.0.1:18088").replace(/\/+$/u, ""),
    projectorHealthUrl: (env.SPECFORGE_PROJECTOR_HEALTH_URL?.trim() || "http://127.0.0.1:18090").replace(/\/+$/u, "")
  };
}

function required(value: string | undefined, code: string): string { const normalized = value?.trim(); if (!normalized) throw new Error(code); return normalized; }
