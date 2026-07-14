import { Prisma, PrismaClient } from "@prisma/client";
import {
  analyzeTransitiveProposalImpact,
  type ArchitectureScopeRef,
  type AssetNodeIdentity,
  type GraphEvidencePath,
  type GraphStore,
  type Proposal,
  type ScopedActor,
  type TransitiveProposalImpact,
  type TraversalAuthorization
} from "@specforge/core";

export type ImpactAnalysisRunStatus =
  | "QUEUED"
  | "WAITING_FOR_PROJECTION"
  | "RUNNING"
  | "COMPLETE"
  | "PARTIAL"
  | "FAILED"
  | "CANCELLED"
  | "CANCELLATION_REQUESTED";

export interface ImpactAnalysisRunRecord extends ArchitectureScopeRef {
  id: string;
  enterpriseId: string;
  proposalId: string;
  status: ImpactAnalysisRunStatus;
  stopReason?: string | null;
  assetVersion: bigint;
  relationshipVersion: bigint;
  ontologyVersion: string;
  requiredGraphVersion: bigint;
  actualGraphCheckpoint?: bigint | null;
  authorizationSnapshot: unknown;
  budgets: unknown;
  summary: Record<string, unknown>;
  unexploredFrontierCount?: number;
  completedAt?: Date | null;
}

export interface ImpactAnalysisExecution {
  proposal: Proposal;
  roots: AssetNodeIdentity[];
}

export interface PersistedImpactAnalysis {
  status: "COMPLETE" | "PARTIAL";
  stopReason?: string;
  actualGraphCheckpoint: bigint;
  frontier: AssetNodeIdentity[];
  summary: Record<string, unknown>;
  nodes: TransitiveProposalImpact["nodes"];
  paths: Array<{ node: AssetNodeIdentity; rank: number; certainty: string; confidence: number; path: GraphEvidencePath }>;
}

export interface ImpactWorkerRepository {
  claim(runId: string): Promise<ImpactAnalysisRunRecord | null>;
  find(runId: string): Promise<ImpactAnalysisRunRecord | null>;
  updateRun(runId: string, patch: Partial<ImpactAnalysisRunRecord>): Promise<ImpactAnalysisRunRecord>;
  loadExecution(run: ImpactAnalysisRunRecord): Promise<ImpactAnalysisExecution>;
  persistAnalysis(runId: string, analysis: PersistedImpactAnalysis): Promise<void>;
  isCancellationRequested(runId: string): Promise<boolean>;
}

export interface ImpactWorkerRunResult {
  id: string;
  status: ImpactAnalysisRunStatus;
  stopReason?: string | null;
  resumedFromFrontier?: boolean;
}

export class ImpactAnalysisWorker {
  constructor(
    private readonly repository: ImpactWorkerRepository,
    private readonly graphStore: Pick<GraphStore, "checkpoint" | "traverse">
  ) {}

  async claim(runId: string): Promise<ImpactAnalysisRunRecord | null> {
    return this.repository.claim(runId);
  }

  async run(runId: string): Promise<ImpactWorkerRunResult> {
    const existing = await this.repository.find(runId);
    if (!existing) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");

    if (await this.repository.isCancellationRequested(runId)) {
      return this.cancel(existing);
    }

    const claimed = await this.claim(runId);
    if (!claimed) return toResult(await this.repository.find(runId) ?? existing);
    return this.execute(claimed, false);
  }

  async resume(runId: string): Promise<ImpactWorkerRunResult> {
    const run = await this.repository.find(runId);
    if (!run) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    if (run.status !== "PARTIAL") throw new Error("IMPACT_ANALYSIS_RUN_NOT_PARTIAL");
    if (readFrontier(run.summary).length === 0) throw new Error("IMPACT_ANALYSIS_FRONTIER_REQUIRED");

    await this.repository.updateRun(runId, { status: "QUEUED", stopReason: null, completedAt: null });
    const queued = await this.repository.find(runId);
    if (!queued) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    if (await this.repository.isCancellationRequested(runId)) return this.cancel(queued);
    const claimed = await this.claim(runId);
    if (!claimed) return toResult(await this.repository.find(runId) ?? queued, true);
    return this.execute(claimed, true);
  }

  async retry(runId: string): Promise<ImpactWorkerRunResult> {
    const run = await this.repository.find(runId);
    if (!run) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    if (run.status !== "FAILED") throw new Error("IMPACT_ANALYSIS_RUN_NOT_FAILED");

    await this.repository.updateRun(runId, { status: "QUEUED", stopReason: null, completedAt: null });
    return this.run(runId);
  }

  private async execute(run: ImpactAnalysisRunRecord, resumedFromFrontier: boolean): Promise<ImpactWorkerRunResult> {
    try {
      const checkpoint = await this.graphStore.checkpoint(scopeOf(run));
      await this.repository.updateRun(run.id, { actualGraphCheckpoint: checkpoint });
      if (checkpoint < run.requiredGraphVersion) {
        const waiting = await this.repository.updateRun(run.id, { status: "WAITING_FOR_PROJECTION", actualGraphCheckpoint: checkpoint });
        return toResult(waiting, resumedFromFrontier);
      }

      if (await this.repository.isCancellationRequested(run.id)) return this.cancel(run);
      const authorization = readAuthorization(run.authorizationSnapshot, scopeOf(run));
      const execution = await this.repository.loadExecution(run);
      const roots = resumedFromFrontier ? readFrontier(run.summary) : execution.roots;
      if (roots.length === 0) throw new Error("IMPACT_ANALYSIS_ROOTS_REQUIRED");

      const budgets = readBudgets(run.budgets);
      const analysis = await analyzeTransitiveProposalImpact({
        proposal: execution.proposal,
        roots,
        authorization,
        maxDepth: budgets.maxDepth,
        maxNodes: budgets.maxNodes,
        maxPaths: budgets.maxPaths,
        timeoutMs: budgets.timeoutMs,
        graphVersion: checkpoint
      }, { graphStore: this.graphStore });

      if (await this.repository.isCancellationRequested(run.id)) return this.cancel(run);
      const persisted = toPersistedAnalysis(run, analysis, checkpoint);
      await this.repository.persistAnalysis(run.id, persisted);
      const terminal = await this.repository.updateRun(run.id, {
        status: persisted.status,
        stopReason: persisted.stopReason ?? null,
        actualGraphCheckpoint: checkpoint,
        summary: persisted.summary,
        unexploredFrontierCount: persisted.frontier.length,
        completedAt: new Date()
      });
      return toResult(terminal, resumedFromFrontier);
    } catch (error) {
      const current = await this.repository.find(run.id);
      if (current && await this.repository.isCancellationRequested(run.id)) return this.cancel(current);
      const failed = await this.repository.updateRun(run.id, {
        status: "FAILED",
        stopReason: errorCode(error),
        completedAt: new Date()
      });
      return toResult(failed, resumedFromFrontier);
    }
  }

  private async cancel(run: ImpactAnalysisRunRecord): Promise<ImpactWorkerRunResult> {
    const cancelled = await this.repository.updateRun(run.id, {
      status: "CANCELLED",
      stopReason: "CANCELLED",
      completedAt: new Date()
    });
    return toResult(cancelled);
  }
}

export class PrismaImpactWorkerRepository implements ImpactWorkerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(runId: string): Promise<ImpactAnalysisRunRecord | null> {
    const rows = await this.prisma.$queryRaw<PrismaImpactRun[]>`
      WITH candidate AS (
        SELECT "dbId"
        FROM "ImpactAnalysisRun"
        WHERE "dbId" = ${runId}
          AND status IN ('QUEUED', 'WAITING_FOR_PROJECTION')
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ImpactAnalysisRun" AS run
      SET status = 'RUNNING', "updatedAt" = CURRENT_TIMESTAMP
      FROM candidate
      WHERE run."dbId" = candidate."dbId"
      RETURNING run.*
    `;
    return rows[0] ? toRunRecord(rows[0]) : null;
  }

  async find(runId: string): Promise<ImpactAnalysisRunRecord | null> {
    const run = await this.prisma.impactAnalysisRun.findUnique({ where: { dbId: runId } });
    return run ? toRunRecord(run) : null;
  }

  async updateRun(runId: string, patch: Partial<ImpactAnalysisRunRecord>): Promise<ImpactAnalysisRunRecord> {
    const data: Prisma.ImpactAnalysisRunUpdateInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.stopReason !== undefined) data.stopReason = patch.stopReason;
    if (patch.actualGraphCheckpoint !== undefined) data.actualGraphCheckpoint = patch.actualGraphCheckpoint;
    if (patch.authorizationSnapshot !== undefined) data.authorizationSnapshot = jsonInput(patch.authorizationSnapshot);
    if (patch.budgets !== undefined) data.budgets = jsonInput(patch.budgets);
    if (patch.summary !== undefined) data.summary = jsonInput(patch.summary);
    if (patch.unexploredFrontierCount !== undefined) data.unexploredFrontierCount = patch.unexploredFrontierCount;
    if (patch.completedAt !== undefined) data.completedAt = patch.completedAt;
    const run = await this.prisma.impactAnalysisRun.update({ where: { dbId: runId }, data });
    return toRunRecord(run);
  }

  async loadExecution(run: ImpactAnalysisRunRecord): Promise<ImpactAnalysisExecution> {
    const proposalRow = await this.prisma.proposal.findUnique({
      where: {
        applicationServiceId_scopePath_id: {
          applicationServiceId: run.applicationServiceId,
          scopePath: run.scopePath,
          id: run.proposalId
        }
      }
    });
    if (!proposalRow) throw new Error("IMPACT_ANALYSIS_PROPOSAL_NOT_FOUND");
    const proposal = JSON.parse(proposalRow.payload) as Proposal;
    const roots = await this.prisma.assetNode.findMany({
      where: {
        enterpriseId: run.enterpriseId,
        applicationServiceId: run.applicationServiceId,
        scopePath: run.scopePath,
        OR: proposal.impactedAssets.map((asset) => ({ rootAssetType: asset.type, rootAssetId: asset.id }))
      },
      orderBy: [{ rootAssetType: "asc" }, { rootAssetId: "asc" }, { logicalId: "asc" }]
    });
    return { proposal, roots: roots.map(toIdentity) };
  }

  async persistAnalysis(runId: string, analysis: PersistedImpactAnalysis): Promise<void> {
    const run = await this.find(runId);
    if (!run) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    const identities = uniqueIdentities([
      ...analysis.nodes.map((node) => node.node),
      ...analysis.paths.flatMap((path) => path.path.nodes)
    ]);
    const records = await this.prisma.assetNode.findMany({
      where: {
        enterpriseId: run.enterpriseId,
        applicationServiceId: run.applicationServiceId,
        scopePath: run.scopePath,
        OR: identities.map((identity) => ({ nodeType: identity.nodeType, logicalId: identity.logicalId }))
      }
    });
    const ids = new Map(records.map((node) => [identityKey(toIdentity(node)), node.dbId]));
    if (identities.some((identity) => !ids.has(identityKey(identity)))) throw new Error("IMPACT_ANALYSIS_RESULT_NODE_NOT_FOUND");

    await this.prisma.$transaction(async (transaction) => {
      for (const node of analysis.nodes) {
        const nodeId = ids.get(identityKey(node.node));
        if (!nodeId) throw new Error("IMPACT_ANALYSIS_RESULT_NODE_NOT_FOUND");
        const stored = await transaction.impactResultNode.upsert({
          where: { impactAnalysisRunId_nodeId: { impactAnalysisRunId: runId, nodeId } },
          create: {
            enterpriseId: run.enterpriseId,
            applicationServiceId: run.applicationServiceId,
            scopePath: run.scopePath,
            impactAnalysisRunId: runId,
            nodeId,
            impactLevel: node.impactLevel,
            certainty: node.certainty,
            depth: node.depth,
            confidence: node.confidence,
            primaryPath: jsonInput(node.primaryPath),
            alternativePaths: jsonInput(node.alternativePaths),
            matchedRules: jsonInput(node.matchedRules),
            recommendedActions: jsonInput(node.recommendedActions),
            snapshot: jsonInput(node)
          },
          update: {
            impactLevel: node.impactLevel,
            certainty: node.certainty,
            depth: node.depth,
            confidence: node.confidence,
            primaryPath: jsonInput(node.primaryPath),
            alternativePaths: jsonInput(node.alternativePaths),
            matchedRules: jsonInput(node.matchedRules),
            recommendedActions: jsonInput(node.recommendedActions),
            snapshot: jsonInput(node)
          }
        });
        await transaction.impactResultPath.deleteMany({ where: { impactResultNodeId: stored.dbId } });
        for (const path of analysis.paths.filter((candidate) => identityKey(candidate.node) === identityKey(node.node))) {
          const start = path.path.nodes[0];
          const end = path.path.nodes.at(-1);
          if (!start || !end) continue;
          const startNodeId = ids.get(identityKey(start));
          const endNodeId = ids.get(identityKey(end));
          if (!startNodeId || !endNodeId) throw new Error("IMPACT_ANALYSIS_PATH_NODE_NOT_FOUND");
          await transaction.impactResultPath.create({
            data: {
              enterpriseId: run.enterpriseId,
              applicationServiceId: run.applicationServiceId,
              scopePath: run.scopePath,
              impactResultNodeId: stored.dbId,
              startNodeId,
              endNodeId,
              rank: path.rank,
              certainty: path.certainty,
              confidence: path.confidence,
              path: jsonInput(path.path)
            }
          });
        }
      }
    });
  }

  async isCancellationRequested(runId: string): Promise<boolean> {
    const run = await this.prisma.impactAnalysisRun.findUnique({ where: { dbId: runId }, select: { status: true } });
    return run?.status === "CANCELLATION_REQUESTED" || run?.status === "CANCELLED";
  }
}

type PrismaImpactRun = {
  dbId: string;
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
  proposalId: string;
  status: string;
  stopReason: string | null;
  assetVersion: bigint;
  relationshipVersion: bigint;
  ontologyVersion: string;
  requiredGraphVersion: bigint;
  actualGraphCheckpoint: bigint | null;
  authorizationSnapshot: Prisma.JsonValue;
  budgets: Prisma.JsonValue;
  summary: Prisma.JsonValue;
  unexploredFrontierCount: number;
  completedAt: Date | null;
};

function toPersistedAnalysis(run: ImpactAnalysisRunRecord, analysis: TransitiveProposalImpact, checkpoint: bigint): PersistedImpactAnalysis {
  const stopReason = analysis.status === "PARTIAL" ? stopReasonFor(analysis.truncationReasons) : undefined;
  const paths = analysis.nodes.flatMap((node) => [node.primaryPath, ...node.alternativePaths].map((path, rank) => ({
    node: node.node,
    rank,
    certainty: node.certainty,
    confidence: node.confidence,
    path
  })));
  return {
    status: analysis.status,
    stopReason,
    actualGraphCheckpoint: checkpoint,
    frontier: analysis.frontier,
    summary: {
      ...run.summary,
      impact: {
        proposalId: analysis.proposalId,
        impactedAssetCount: analysis.impactedAssetCount,
        riskLevel: analysis.riskLevel,
        requiredContextPack: analysis.requiredContextPack,
        status: analysis.status,
        graphVersion: analysis.graphVersion.toString(),
        elapsedMs: analysis.elapsedMs
      },
      unexploredFrontier: analysis.frontier,
      truncationReasons: analysis.truncationReasons
    },
    nodes: analysis.nodes,
    paths
  };
}

function readAuthorization(value: unknown, expectedScope: ArchitectureScopeRef): TraversalAuthorization {
  if (!isRecord(value) || !isRecord(value.actor) || !isRecord(value.scope)) throw new Error("AUTHORIZATION_SNAPSHOT_INVALID");
  const scope = value.scope;
  if (scope.applicationServiceId !== expectedScope.applicationServiceId || scope.scopePath !== expectedScope.scopePath) {
    throw new Error("AUTHORIZATION_SCOPE_MISMATCH");
  }
  const actor = value.actor;
  if (!isScopedActor(actor)) throw new Error("AUTHORIZATION_SNAPSHOT_INVALID");
  return { actor, scope: expectedScope };
}

function readBudgets(value: unknown): { maxDepth: number; maxNodes: number; maxPaths: number; timeoutMs: number } {
  if (!isRecord(value)) throw new Error("IMPACT_ANALYSIS_BUDGETS_INVALID");
  return {
    maxDepth: requiredPositiveInteger(value.maxDepth),
    maxNodes: requiredPositiveInteger(value.maxNodes),
    maxPaths: requiredPositiveInteger(value.maxPaths),
    timeoutMs: requiredPositiveInteger(value.timeoutMs)
  };
}

function readFrontier(summary: Record<string, unknown>): AssetNodeIdentity[] {
  const frontier = summary.unexploredFrontier;
  return Array.isArray(frontier) ? frontier.filter(isAssetNodeIdentity) : [];
}

function toRunRecord(row: PrismaImpactRun): ImpactAnalysisRunRecord {
  return {
    id: row.dbId,
    enterpriseId: row.enterpriseId,
    applicationServiceId: row.applicationServiceId,
    scopePath: row.scopePath,
    proposalId: row.proposalId,
    status: row.status as ImpactAnalysisRunStatus,
    stopReason: row.stopReason,
    assetVersion: row.assetVersion,
    relationshipVersion: row.relationshipVersion,
    ontologyVersion: row.ontologyVersion,
    requiredGraphVersion: row.requiredGraphVersion,
    actualGraphCheckpoint: row.actualGraphCheckpoint,
    authorizationSnapshot: row.authorizationSnapshot,
    budgets: row.budgets,
    summary: isRecord(row.summary) ? row.summary : {},
    unexploredFrontierCount: row.unexploredFrontierCount,
    completedAt: row.completedAt
  };
}

function toIdentity(node: { applicationServiceId: string; scopePath: string; nodeType: string; logicalId: string; rootAssetType: string; rootAssetId: string; parentNodeId?: string | null }): AssetNodeIdentity {
  return {
    applicationServiceId: node.applicationServiceId,
    scopePath: node.scopePath,
    nodeType: node.nodeType as AssetNodeIdentity["nodeType"],
    logicalId: node.logicalId,
    rootAssetType: node.rootAssetType as AssetNodeIdentity["rootAssetType"],
    rootAssetId: node.rootAssetId,
    ...(node.parentNodeId ? { parentLogicalId: node.parentNodeId } : {})
  };
}

function scopeOf(run: ImpactAnalysisRunRecord): ArchitectureScopeRef {
  return { applicationServiceId: run.applicationServiceId, scopePath: run.scopePath };
}

function stopReasonFor(reasons: string[]): string {
  const reason = reasons[0];
  return ({ MAX_DEPTH: "DEPTH_LIMIT_EXCEEDED", MAX_NODES: "NODE_BUDGET_EXCEEDED", MAX_PATHS: "PATH_BUDGET_EXCEEDED", TIMEOUT: "TIMEOUT" } as Record<string, string>)[reason ?? ""] ?? "PARTIAL";
}

function toResult(run: ImpactAnalysisRunRecord, resumedFromFrontier = false): ImpactWorkerRunResult {
  return {
    id: run.id,
    status: run.status,
    ...(run.stopReason ? { stopReason: run.stopReason } : {}),
    ...(resumedFromFrontier ? { resumedFromFrontier: true } : {})
  };
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "IMPACT_ANALYSIS_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScopedActor(value: unknown): value is ScopedActor {
  return isRecord(value)
    && (value.actorType === "agent" || value.actorType === "user" || value.actorType === "system")
    && typeof value.actorId === "string"
    && Array.isArray(value.grants)
    && value.grants.every((grant) => isRecord(grant) && typeof grant.scopeId === "string" && (grant.action === "read" || grant.action === "write"));
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function requiredPositiveInteger(value: unknown): number {
  if (!isPositiveInteger(value)) throw new Error("IMPACT_ANALYSIS_BUDGETS_INVALID");
  return value;
}

function isAssetNodeIdentity(value: unknown): value is AssetNodeIdentity {
  return isRecord(value)
    && typeof value.applicationServiceId === "string"
    && typeof value.scopePath === "string"
    && typeof value.nodeType === "string"
    && typeof value.logicalId === "string"
    && typeof value.rootAssetType === "string"
    && typeof value.rootAssetId === "string";
}

function uniqueIdentities(identities: AssetNodeIdentity[]): AssetNodeIdentity[] {
  return [...new Map(identities.map((identity) => [identityKey(identity), identity])).values()];
}

function identityKey(identity: AssetNodeIdentity): string {
  return [identity.applicationServiceId, identity.scopePath, identity.nodeType, identity.logicalId].join("|");
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return toJsonValue(value) as Prisma.InputJsonValue;
}

function toJsonValue(value: unknown): Prisma.JsonValue {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toJsonValue(nested)]));
  return value as Prisma.JsonValue;
}
