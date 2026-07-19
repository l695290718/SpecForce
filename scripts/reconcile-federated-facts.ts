import { pathToFileURL } from "node:url";

import {
  scopeById,
  type ArchitectureScopeRef,
  type ReconciliationIssue,
  type ReconciliationIssueCode,
  type ReconciliationReport
} from "../packages/core/src/index";

type ReconciliationGateReport = Pick<ReconciliationReport, "issues" | "root"> & {
  blocking?: boolean;
  status?: ReconciliationReport["status"];
};

export interface FederatedReconciliationDiagnostics {
  architectureScope: ArchitectureScopeRef;
  root: string;
  verified: number;
  issueCounts: Partial<Record<ReconciliationIssueCode, number>>;
  blocking: boolean;
}

const blockingIssueCodes = new Set<ReconciliationIssueCode>([
  "DELIVERY_BLOCKED",
  "IDENTITY_CONFLICT",
  "LOCALIZATION_DRIFT",
  "SCOPE_DRIFT",
  "SOURCE_UNREACHABLE"
]);

export function resolveFederatedScope(environment: Pick<NodeJS.ProcessEnv, "SPECFORGE_APPLICATION_SERVICE_ID" | "SPECFORGE_SCOPE_PATH">): ArchitectureScopeRef {
  const applicationServiceId = environment.SPECFORGE_APPLICATION_SERVICE_ID?.trim();
  if (!applicationServiceId) throw new Error("SPECFORGE_APPLICATION_SERVICE_ID is required.");

  const scope = scopeById(applicationServiceId);
  if (!scope || scope.level !== "applicationService") {
    throw new Error("SPECFORGE_APPLICATION_SERVICE_ID must resolve to an application service Scope.");
  }

  const suppliedScopePath = environment.SPECFORGE_SCOPE_PATH;
  if (suppliedScopePath !== undefined && suppliedScopePath !== scope.scopePath) {
    throw new Error("SPECFORGE_SCOPE_PATH must exactly match the registered Scope path.");
  }

  return { applicationServiceId: scope.id, scopePath: scope.scopePath };
}

export function reconciliationExitCode(report: ReconciliationGateReport): 0 | 1 {
  return isBlocking(report) ? 1 : 0;
}

export function federatedReconciliationDiagnostics(report: ReconciliationReport): FederatedReconciliationDiagnostics {
  const issueCounts = report.issues.reduce<Partial<Record<ReconciliationIssueCode, number>>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
  const sortedIssueCounts = Object.fromEntries(Object.entries(issueCounts).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) as Partial<Record<ReconciliationIssueCode, number>>;
  const affectedFactIds = new Set(report.issues.flatMap((issue) => issue.factId ? [issue.factId] : []));

  return {
    architectureScope: report.architectureScope,
    root: report.root,
    verified: report.factDigests.filter((fact) => !affectedFactIds.has(fact.factId)).length,
    issueCounts: sortedIssueCounts,
    blocking: isBlocking(report)
  };
}

function isBlocking(report: ReconciliationGateReport): boolean {
  return report.blocking === true || report.status === "BLOCKED" || report.issues.some((issue: Pick<ReconciliationIssue, "code">) => blockingIssueCodes.has(issue.code));
}

export async function reconcileFederatedFacts(environment: Pick<NodeJS.ProcessEnv, "SPECFORGE_APPLICATION_SERVICE_ID" | "SPECFORGE_SCOPE_PATH"> = process.env): Promise<FederatedReconciliationDiagnostics> {
  const architectureScope = resolveFederatedScope(environment);
  const { reconcilePersistedScope } = await import("../apps/mcp-server/src/federation/persistence");
  const report = await reconcilePersistedScope({ architectureScope, acceptedFacts: [] });
  return federatedReconciliationDiagnostics(report);
}

async function main(): Promise<void> {
  const diagnostics = await reconcileFederatedFacts();
  process.stdout.write(`${JSON.stringify(diagnostics)}\n`);
  process.exitCode = reconciliationExitCode({ ...diagnostics, issues: [] });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  });
}
