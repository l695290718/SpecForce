import type {
  KnowledgeReadinessDecision,
  KnowledgeReadinessPolicy,
  KnowledgeReadinessPolicyOverlay,
  KnowledgeSourceRequirement
} from "./types";

export type KnowledgeScanReadinessMode = "READ" | "BOOTSTRAP_SCAN" | "BLOCKED";

const bootstrapReasonCodes = new Set([
  "KNOWLEDGE_SOURCE_NOT_CONFIGURED",
  "KNOWLEDGE_COVERAGE_INCOMPLETE",
  "KNOWLEDGE_PENDING_PROMOTION"
]);

export function classifyKnowledgeScanReadiness(decision: KnowledgeReadinessDecision, exactScopeWriteAuthorized: boolean): KnowledgeScanReadinessMode {
  if (decision.trustStatus === "SELF_CONTAINED" && exactScopeWriteAuthorized) return "READ";
  const reasonCodes = new Set(decision.reasonCodes);
  const onlyBootstrapReasons = [...reasonCodes].every((reason) => bootstrapReasonCodes.has(reason));
  if (exactScopeWriteAuthorized && decision.remediationActions.includes("START_FULL_SCAN") && onlyBootstrapReasons) return "BOOTSTRAP_SCAN";
  return "BLOCKED";
}

const designCatalog: KnowledgeSourceRequirement = {
  role: "DESIGN_CATALOG",
  dimension: "DESIGN_INTENT",
  maximumFreshnessSeconds: 30 * 24 * 60 * 60,
  maximumClockSkewSeconds: 5 * 60,
  requireFullSnapshot: true
};

const sourceCode: KnowledgeSourceRequirement = {
  role: "SOURCE_CODE",
  dimension: "IMPLEMENTATION",
  maximumFreshnessSeconds: 7 * 24 * 60 * 60,
  maximumClockSkewSeconds: 5 * 60,
  requireFullSnapshot: true
};

const apiSchema: KnowledgeSourceRequirement = {
  role: "API_SCHEMA",
  dimension: "IMPLEMENTATION",
  maximumFreshnessSeconds: 7 * 24 * 60 * 60,
  maximumClockSkewSeconds: 5 * 60,
  requireFullSnapshot: true
};

const dataSchema: KnowledgeSourceRequirement = {
  role: "DATA_SCHEMA",
  dimension: "IMPLEMENTATION",
  maximumFreshnessSeconds: 7 * 24 * 60 * 60,
  maximumClockSkewSeconds: 5 * 60,
  requireFullSnapshot: true
};

const testEvidence: KnowledgeSourceRequirement = {
  role: "TEST_EVIDENCE",
  dimension: "IMPLEMENTATION",
  maximumFreshnessSeconds: 14 * 24 * 60 * 60,
  maximumClockSkewSeconds: 5 * 60,
  requireFullSnapshot: true
};

const runtimeTelemetry: KnowledgeSourceRequirement = {
  role: "RUNTIME_TELEMETRY",
  dimension: "RUNTIME",
  maximumFreshnessSeconds: 60 * 60,
  maximumClockSkewSeconds: 2 * 60,
  requireFullSnapshot: false
};

export const enterpriseMinimumPolicy: KnowledgeReadinessPolicy = {
  id: "enterprise-minimum-v1",
  version: 1,
  profileRequirements: {
    DESIGN_CATALOG_CURATION: [designCatalog],
    ARCHITECTURE_OVERVIEW: [designCatalog, sourceCode],
    CHANGE_ASSESSMENT: [designCatalog, sourceCode, apiSchema, dataSchema, testEvidence],
    RUNTIME_DIAGNOSIS: [sourceCode, runtimeTelemetry]
  },
  profileGuards: {
    DESIGN_CATALOG_CURATION: { requirePublishedBaseline: false, reconciliation: "NOT_BLOCKED" },
    ARCHITECTURE_OVERVIEW: { requirePublishedBaseline: true, reconciliation: "CONVERGED" },
    CHANGE_ASSESSMENT: { requirePublishedBaseline: true, reconciliation: "CONVERGED" },
    RUNTIME_DIAGNOSIS: { requirePublishedBaseline: true, reconciliation: "CONVERGED" }
  },
  blockOnUnresolvedConflict: true,
  blockOnNonConvergedReconciliation: true,
  responseBudget: { assets: 200, relationships: 500, bytes: 2_000_000, executionMilliseconds: 5_000 },
  receiptTtlSeconds: 15 * 60,
  retentionDays: 90
};

function assertPositiveNumber(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`KNOWLEDGE_POLICY_VIOLATION:${name}`);
}

function requirementsFor(policy: KnowledgeReadinessPolicy, profileId: KnowledgeReadinessPolicyOverlay["profileId"]): KnowledgeSourceRequirement[] {
  return [...policy.profileRequirements[profileId]];
}

export function composeKnowledgeReadinessPolicy(
  overlay?: KnowledgeReadinessPolicyOverlay
): KnowledgeReadinessPolicy {
  const base = enterpriseMinimumPolicy;
  if (!overlay) return base;

  const baseRequirements = requirementsFor(base, overlay.profileId);
  const byRole = new Map(baseRequirements.map((requirement) => [requirement.role, { ...requirement }]));
  for (const extra of overlay.additionalSources ?? []) {
    assertPositiveNumber(`${extra.role}.maximumFreshnessSeconds`, extra.maximumFreshnessSeconds);
    assertPositiveNumber(`${extra.role}.maximumClockSkewSeconds`, extra.maximumClockSkewSeconds);
    if (byRole.has(extra.role)) throw new Error("KNOWLEDGE_POLICY_VIOLATION:duplicate-source-role");
    byRole.set(extra.role, { ...extra });
  }

  for (const [role, value] of Object.entries(overlay.maximumFreshnessSeconds ?? {})) {
    const requirement = byRole.get(role as KnowledgeSourceRequirement["role"]);
    if (!requirement || !Number.isFinite(value) || value <= 0 || value > requirement.maximumFreshnessSeconds) {
      throw new Error(`KNOWLEDGE_POLICY_VIOLATION:${role}.maximumFreshnessSeconds`);
    }
    requirement.maximumFreshnessSeconds = value;
  }
  for (const [role, value] of Object.entries(overlay.maximumClockSkewSeconds ?? {})) {
    const requirement = byRole.get(role as KnowledgeSourceRequirement["role"]);
    if (!requirement || !Number.isFinite(value) || value <= 0 || value > requirement.maximumClockSkewSeconds) {
      throw new Error(`KNOWLEDGE_POLICY_VIOLATION:${role}.maximumClockSkewSeconds`);
    }
    requirement.maximumClockSkewSeconds = value;
  }

  const responseBudget = { ...base.responseBudget, ...(overlay.responseBudget ?? {}) };
  for (const [name, value] of Object.entries(responseBudget)) {
    assertPositiveNumber(`responseBudget.${name}`, value);
    if (value > base.responseBudget[name as keyof typeof base.responseBudget]) {
      throw new Error(`KNOWLEDGE_POLICY_VIOLATION:responseBudget.${name}`);
    }
  }
  const receiptTtlSeconds = overlay.receiptTtlSeconds ?? base.receiptTtlSeconds;
  const retentionDays = overlay.retentionDays ?? base.retentionDays;
  if (receiptTtlSeconds > base.receiptTtlSeconds || receiptTtlSeconds <= 0) throw new Error("KNOWLEDGE_POLICY_VIOLATION:receiptTtlSeconds");
  if (retentionDays > base.retentionDays || retentionDays <= 0) throw new Error("KNOWLEDGE_POLICY_VIOLATION:retentionDays");

  return {
    ...base,
    id: overlay.id,
    version: overlay.version,
    profileRequirements: { ...base.profileRequirements, [overlay.profileId]: [...byRole.values()] },
    responseBudget,
    receiptTtlSeconds,
    retentionDays
  };
}
