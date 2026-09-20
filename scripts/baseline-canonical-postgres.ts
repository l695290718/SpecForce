import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

export const HISTORICAL_BASELINE_MIGRATIONS = [
  "20260713233000_migrate_legacy_persisted_identities",
  "20260714_enterprise_relationship_graph",
  "20260715_relationship_event_node_subject",
  "20260716_relationship_command_receipts",
  "20260717_impact_analysis_worker_leases",
  "20260719_federated_design_fact_governance",
  "20260726_nebulagraph_projection_runtime",
  "20260801_change_attestation",
  "20260801_design_context_preflight_gate",
  "20260802_semantic_candidate_generation",
  "20260802_unified_3a_knowledge_foundation",
  "20260803_continuous_observation_governance",
  "20260803_knowledge_scan_production",
  "20260810_3a_navigation_read_model",
  "20260811_webgl_3a_graph_analysis",
  "20260812_deployment_bootstrap",
  "20260812_readable_3a_architecture_units",
  "20260813_scope_isolation_completeness",
  "20260815_governed_3a_architecture_fact_authoring",
  "20260817_continuous_inbound_connectors",
  "20260826_requirement_assessment_center",
  "20260830_designer_3a_v7_candidate_sets",
  "20260830_system_knowledge_readiness_gate",
  "20260831_self_managed_identity",
  "20260917_system_scan_governance"
] as const;

const EXPECTED_EXTRA_INDEXES = [
  "AssetLink_scope_source_idx",
  "AssetLink_scope_target_idx",
  "KnowledgePromotionReceipt_scope_decision_key"
] as const;

const REQUIRED_DATABASE_NAME = "specforge_canonical";
const AUDIT_DIRECTORY = join(".specforge", "baselines");
const AUDIT_FILE = join(AUDIT_DIRECTORY, "latest-audit.json");

export interface BaselineAuditReport {
  generatedAt: string;
  database: { name: string; serverVersion: string };
  backup: { path: string; sizeBytes: number };
  migrationTablePresent: boolean;
  appliedMigrations: string[];
  pendingHistoricalMigrations: string[];
  schemaDrift: { extraIndexes: string[]; unexpectedIndexes: string[] };
  activeGovernanceDuplicates: Array<{ kind: string; count: number }>;
  scopeNullCounts: Record<string, number>;
  missingLinkCount: number;
  missingLinkDigest: string;
  missingLinkIds: string[];
  historicalMigrationsPresent: string[];
  expectedExtraIndexes: readonly string[];
}

export function computeMissingLinkDigest(linkIds: readonly string[]): string {
  const canonical = [...linkIds].sort().join("\n");
  return createHash("sha256").update(canonical).digest("hex");
}

export function selectHistoricalBaselineMigrations(
  migrationNames: readonly string[],
  allowlist: readonly string[] = HISTORICAL_BASELINE_MIGRATIONS
): string[] {
  const available = new Set(migrationNames);
  return allowlist.filter((migration) => available.has(migration));
}

export function validateBaselinePreconditions(input: {
  databaseName: string;
  backupSizeBytes: number;
  expectedGapDigest?: string;
  actualGapDigest: string;
  unexpectedIndexes: readonly string[];
  activeGovernanceDuplicates: readonly unknown[];
  scopeNullCounts: Readonly<Record<string, number>>;
  historicalMigrationsPresent: readonly string[];
  allowNonCanonicalDatabase?: boolean;
}): string[] {
  const failures: string[] = [];
  if (!input.allowNonCanonicalDatabase && input.databaseName !== REQUIRED_DATABASE_NAME) failures.push("DATABASE_NAME_MISMATCH");
  if (input.backupSizeBytes <= 0) failures.push("BACKUP_REQUIRED");
  if (input.expectedGapDigest && input.expectedGapDigest !== input.actualGapDigest) failures.push("MISSING_LINK_DIGEST_MISMATCH");
  if (input.unexpectedIndexes.length > 0) failures.push("UNEXPECTED_SCHEMA_DRIFT");
  if (input.activeGovernanceDuplicates.length > 0) failures.push("ACTIVE_GOVERNANCE_DUPLICATE");
  if (Object.values(input.scopeNullCounts).some((count) => count > 0)) failures.push("SCOPE_NULL_DATA");
  if (input.historicalMigrationsPresent.length !== HISTORICAL_BASELINE_MIGRATIONS.length) failures.push("HISTORICAL_MIGRATION_ALLOWLIST_INCOMPLETE");
  return failures;
}

function readDatabaseUrl(override?: string): string {
  if (override) return override;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(process.cwd(), ".env");
  const line = readFileSync(envPath, "utf8").split(/\r?\n/u).find((candidate) => candidate.startsWith("DATABASE_URL="));
  if (!line) throw new Error("DATABASE_URL is required");
  return line.slice("DATABASE_URL=".length).trim().replace(/^['"]|['"]$/gu, "");
}

function readArguments(values: readonly string[]): Map<string, string | true> {
  const args = new Map<string, string | true>();
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) args.set(value.slice(2), true);
    else {
      args.set(value.slice(2), next);
      index += 1;
    }
  }
  return args;
}

function required(args: Map<string, string | true>, key: string): string {
  const value = args.get(key);
  if (typeof value !== "string" || value.length === 0) throw new Error(`--${key} is required`);
  return value;
}

function backupSize(path: string): number {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}

async function collectAudit(prisma: PrismaClient, backupPath: string, databaseUrl: string): Promise<BaselineAuditReport> {
  const database = await prisma.$queryRawUnsafe<Array<{ name: string; serverVersion: string }>>(
    `SELECT current_database() AS name, current_setting('server_version') AS "serverVersion"`
  );
  const migrationTable = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT to_regclass('public."_prisma_migrations"') IS NOT NULL AS exists`
  );
  const applied = migrationTable[0]?.exists
    ? await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY started_at`
      )
    : [];
  const duplicates = await prisma.$queryRawUnsafe<Array<{ kind: string; count: number }>>(
    `SELECT kind, COUNT(*)::int AS count FROM "SystemScanGovernanceRecord" WHERE status = 'ACTIVE' GROUP BY kind HAVING COUNT(*) > 1`
  );
  const scopeNullCounts = Object.fromEntries(await Promise.all(
    ["DesignAsset", "Proposal", "ContextPack", "AssetLink"].map(async (table) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
        `SELECT COUNT(*)::int AS count FROM "${table}" WHERE "applicationServiceId" IS NULL OR "scopePath" IS NULL`
      );
      return [table, rows[0]?.count ?? 0];
    })
  ));
  const missing = await prisma.$queryRawUnsafe<Array<{ linkDbId: string }>>(`
    SELECT link."dbId"::text AS "linkDbId"
    FROM "AssetLink" link
    WHERE NOT EXISTS (
      SELECT 1
      FROM "RelationshipCurrent" relationship
      JOIN "AssetNode" source_node
        ON source_node."enterpriseId" = 'legacy-enterprise'
       AND source_node."applicationServiceId" = link."applicationServiceId"
       AND source_node."scopePath" = link."scopePath"
       AND source_node."nodeType" = link."sourceType"
       AND source_node."logicalId" = link."sourceId"
      JOIN "AssetNode" target_node
        ON target_node."enterpriseId" = 'legacy-enterprise'
       AND target_node."applicationServiceId" = link."applicationServiceId"
       AND target_node."scopePath" = link."scopePath"
       AND target_node."nodeType" = link."targetType"
       AND target_node."logicalId" = link."targetId"
      WHERE relationship."enterpriseId" = 'legacy-enterprise'
        AND relationship."applicationServiceId" = link."applicationServiceId"
        AND relationship."scopePath" = link."scopePath"
        AND relationship."sourceNodeId" = source_node."dbId"
        AND relationship."targetNodeId" = target_node."dbId"
        AND relationship."relationType" = link."relationType"
    )
    ORDER BY link."dbId"
  `);
  const availableMigrations = readdirSync(join(process.cwd(), "prisma", "migrations"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  const historicalMigrationsPresent = selectHistoricalBaselineMigrations(availableMigrations);
  const databaseRow = database[0] ?? { name: "unknown", serverVersion: "unknown" };
  const missingLinkIds = missing.map((row) => row.linkDbId);
  return {
    generatedAt: new Date().toISOString(),
    database: databaseRow,
    backup: { path: backupPath, sizeBytes: backupSize(backupPath) },
    migrationTablePresent: migrationTable[0]?.exists ?? false,
    appliedMigrations: applied.map((row) => row.migration_name),
    pendingHistoricalMigrations: HISTORICAL_BASELINE_MIGRATIONS.filter((migration) => !applied.some((row) => row.migration_name === migration)),
    schemaDrift: collectSchemaDrift(databaseUrl),
    activeGovernanceDuplicates: duplicates,
    scopeNullCounts,
    missingLinkCount: missingLinkIds.length,
    missingLinkDigest: computeMissingLinkDigest(missingLinkIds),
    missingLinkIds,
    historicalMigrationsPresent,
    expectedExtraIndexes: EXPECTED_EXTRA_INDEXES
  };
}

function writeAudit(report: BaselineAuditReport): void {
  mkdirSync(AUDIT_DIRECTORY, { recursive: true });
  writeFileSync(AUDIT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function collectSchemaDrift(databaseUrl: string): { extraIndexes: string[]; unexpectedIndexes: string[] } {
  const diff = runPrisma(["migrate", "diff", "--from-schema-datasource", "prisma/schema.prisma", "--to-schema-datamodel", "prisma/schema.prisma"], databaseUrl);
  const removed = diff.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.startsWith("[-]"));
  const known = new Map<string, string>([
    ["[-] Removed index on columns (applicationServiceId, scopePath, sourceType, sourceId, relationType)", "AssetLink_scope_source_idx"],
    ["[-] Removed index on columns (applicationServiceId, scopePath, targetType, targetId, relationType)", "AssetLink_scope_target_idx"],
    ["[-] Removed unique index on columns (applicationServiceId, scopePath, promotionDecisionId)", "KnowledgePromotionReceipt_scope_decision_key"]
  ]);
  return {
    extraIndexes: removed.filter((line) => known.has(line)).map((line) => known.get(line) as string),
    unexpectedIndexes: removed.filter((line) => !known.has(line))
  };
}

function runPrisma(args: readonly string[], databaseUrl: string): string {
  const prismaCli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

async function run(): Promise<void> {
  const args = readArguments(process.argv.slice(2));
  const mode = required(args, "mode");
  if (mode !== "audit" && mode !== "apply") throw new Error("--mode must be audit or apply");
  const backupPath = required(args, "backup");
  const databaseUrl = readDatabaseUrl(typeof args.get("database-url") === "string" ? String(args.get("database-url")) : undefined);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const report = await collectAudit(prisma, backupPath, databaseUrl);
    writeAudit(report);
    const failures = validateBaselinePreconditions({
      databaseName: report.database.name,
      backupSizeBytes: report.backup.sizeBytes,
      expectedGapDigest: typeof args.get("expected-gap-digest") === "string" ? String(args.get("expected-gap-digest")) : undefined,
      actualGapDigest: report.missingLinkDigest,
      unexpectedIndexes: report.schemaDrift.unexpectedIndexes,
      activeGovernanceDuplicates: report.activeGovernanceDuplicates,
      scopeNullCounts: report.scopeNullCounts,
      historicalMigrationsPresent: report.historicalMigrationsPresent,
      allowNonCanonicalDatabase: args.get("confirm-probe") === true
    });
    if (mode === "audit") {
      console.log(JSON.stringify({ report, failures }, null, 2));
      process.exitCode = failures.length > 0 ? 1 : 0;
      return;
    }
    const confirmCanonical = args.get("confirm-canonical") === true;
    const confirmProbe = args.get("confirm-probe") === true;
    if (!confirmCanonical && !confirmProbe) {
      throw new Error("--confirm-canonical or --confirm-probe is required for apply mode");
    }
    if (confirmCanonical && report.database.name !== REQUIRED_DATABASE_NAME) {
      throw new Error("CANONICAL_DATABASE_CONFIRMATION_MISMATCH");
    }
    if (confirmProbe && !report.database.name.startsWith("specforge_baseline_probe_")) {
      throw new Error("PROBE_DATABASE_CONFIRMATION_MISMATCH");
    }
    if (failures.length > 0) throw new Error(`BASELINE_PRECONDITION_FAILED:${failures.join(",")}`);
    for (const migration of HISTORICAL_BASELINE_MIGRATIONS) {
      if (!report.appliedMigrations.includes(migration)) {
        runPrisma(["migrate", "resolve", "--applied", migration], databaseUrl);
      }
      const applied = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
        `SELECT migration_name FROM "_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
        migration
      );
      if (applied.length !== 1) throw new Error(`BASELINE_RESOLUTION_NOT_CONFIRMED:${migration}`);
    }
    runPrisma(["migrate", "deploy"], databaseUrl);
    console.log(JSON.stringify({ status: "applied", database: report.database.name, migrationCount: HISTORICAL_BASELINE_MIGRATIONS.length + 2 }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  run().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
