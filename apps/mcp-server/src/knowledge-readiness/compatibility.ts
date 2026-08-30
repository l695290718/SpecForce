import type { ScopedPrincipal } from "@specforge/core";

export type KnowledgeReadEnforcement = "observe" | "enforce";
export type KnowledgeReadMode = "OBSERVE" | "ENFORCE" | "DIAGNOSTIC_ONLY";

export interface KnowledgeReadModeResult {
  allow: boolean;
  mode: KnowledgeReadMode;
  emitDeprecationAudit: boolean;
}

export interface KnowledgeReadEnvironment {
  enforcement: KnowledgeReadEnforcement;
}

export function resolveKnowledgeReadMode(
  environment: KnowledgeReadEnvironment,
  caller: Pick<ScopedPrincipal, "permissions"> | undefined
): KnowledgeReadModeResult {
  if (caller?.permissions.includes("knowledge:diagnostic")) {
    return { allow: true, mode: "DIAGNOSTIC_ONLY", emitDeprecationAudit: false };
  }
  if (environment.enforcement === "enforce") {
    return { allow: false, mode: "ENFORCE", emitDeprecationAudit: true };
  }
  return { allow: true, mode: "OBSERVE", emitDeprecationAudit: true };
}

export function configuredKnowledgeReadEnvironment(): KnowledgeReadEnvironment {
  return { enforcement: process.env.SPECFORGE_KNOWLEDGE_READ_ENFORCEMENT === "enforce" ? "enforce" : "observe" };
}

export function assertLegacyKnowledgeReadAllowed(caller: Pick<ScopedPrincipal, "permissions"> | undefined): KnowledgeReadModeResult {
  const result = resolveKnowledgeReadMode(configuredKnowledgeReadEnvironment(), caller);
  if (!result.allow) throw new Error("KNOWLEDGE_GATED_READ_REQUIRED");
  return result;
}
