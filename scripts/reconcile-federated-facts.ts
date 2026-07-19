import { pathToFileURL } from "node:url";

import {
  scopeById,
  type ArchitectureScopeRef,
  type ReconciliationReport
} from "../packages/core/src/index";

export type FederationCliEnvironment = Pick<NodeJS.ProcessEnv, "SPECFORGE_APPLICATION_SERVICE_ID" | "SPECFORGE_SCOPE_PATH">;

type ReconciliationGateReport = Pick<ReconciliationReport, "issues" | "root"> & {
  blocking?: boolean;
  status?: ReconciliationReport["status"];
};

export interface FederatedReconciliationDiagnostics {
  architectureScope: ArchitectureScopeRef | null;
  root: string | null;
  verified: number;
  issueCounts: Record<string, number>;
  blocking: boolean;
  error: { code: string; message: string } | null;
}

export interface ReconciliationCliResult {
  report: FederatedReconciliationDiagnostics;
  stdout: string;
  exitCode: 0 | 1;
}

export function resolveFederatedScope(environment: FederationCliEnvironment): ArchitectureScopeRef {
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
  const issueCounts = report.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});
  const affectedFactIds = new Set(report.issues.flatMap((issue) => issue.factId ? [issue.factId] : []));

  return {
    architectureScope: report.architectureScope,
    root: report.root,
    verified: report.factDigests.filter((fact) => !affectedFactIds.has(fact.factId)).length,
    issueCounts: sortedRecord(issueCounts),
    blocking: isBlocking(report),
    error: null
  };
}

function isBlocking(report: ReconciliationGateReport): boolean {
  return report.blocking === true || report.status === "BLOCKED" || report.status === "DRIFTED" || report.issues.length > 0;
}

export async function reconcileFederatedFacts(environment: FederationCliEnvironment = process.env): Promise<FederatedReconciliationDiagnostics> {
  const architectureScope = resolveFederatedScope(environment);
  return reconcileFederatedFactsForScope(architectureScope);
}

async function reconcileFederatedFactsForScope(architectureScope: ArchitectureScopeRef): Promise<FederatedReconciliationDiagnostics> {
  const { listPersistedCanonicalFederatedFacts, reconcilePersistedScope } = await import("../apps/mcp-server/src/federation/persistence");
  const acceptedFacts = await listPersistedCanonicalFederatedFacts(architectureScope);
  const report = await reconcilePersistedScope({ architectureScope, acceptedFacts });
  return federatedReconciliationDiagnostics(report);
}

export async function runReconciliationCli(environment: FederationCliEnvironment = process.env): Promise<ReconciliationCliResult> {
  try {
    const architectureScope = resolveFederatedScope(environment);
    return cliResult(await reconcileFederatedFactsForScope(architectureScope));
  } catch (error) {
    const code = cliErrorCode(error);
    const report: FederatedReconciliationDiagnostics = {
      architectureScope: code === "RECONCILIATION_FAILED" ? tryResolveScope(environment) : null,
      root: null,
      verified: 0,
      issueCounts: { [code]: 1 },
      blocking: true,
      error: { code, message: error instanceof Error ? error.message : String(error) }
    };
    return cliResult(report);
  }
}

function cliResult(report: FederatedReconciliationDiagnostics): ReconciliationCliResult {
  return { report, stdout: JSON.stringify(report), exitCode: report.blocking ? 1 : 0 };
}

function tryResolveScope(environment: FederationCliEnvironment): ArchitectureScopeRef | null {
  try {
    return resolveFederatedScope(environment);
  } catch {
    return null;
  }
}

function cliErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "SPECFORGE_APPLICATION_SERVICE_ID is required.") return "MISSING_APPLICATION_SERVICE_ID";
  if (message.includes("SPECFORGE_APPLICATION_SERVICE_ID must resolve") || message.includes("SPECFORGE_SCOPE_PATH must exactly match")) return "INVALID_SCOPE";
  return "RECONCILIATION_FAILED";
}

function sortedRecord(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

async function main(): Promise<void> {
  const result = await runReconciliationCli();
  process.stdout.write(`${result.stdout}\n`);
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
