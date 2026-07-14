import { randomUUID } from "node:crypto";
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

export interface ImpactAnalysisRunRef extends ArchitectureScopeRef {
  id: string;
  enterpriseId: string;
}

export interface ImpactAnalysisRunRecord extends ImpactAnalysisRunRef {
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
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  heartbeatAt?: Date | null;
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
  claim(run: ImpactAnalysisRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<ImpactAnalysisRunRecord | null>;
  find(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord | null>;
  updateRun(run: ImpactAnalysisRunRef, patch: Partial<ImpactAnalysisRunRecord>): Promise<ImpactAnalysisRunRecord>;
  projectionCheckpoint(run: ImpactAnalysisRunRef): Promise<bigint>;
  heartbeat(run: ImpactAnalysisRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<ImpactAnalysisRunRecord | null>;
  loadExecution(run: ImpactAnalysisRunRecord): Promise<ImpactAnalysisExecution>;
  complete(run: ImpactAnalysisRunRef, leaseOwner: string, analysis: PersistedImpactAnalysis): Promise<ImpactAnalysisRunRecord | null>;
  fail(run: ImpactAnalysisRunRef, leaseOwner: string, stopReason: string): Promise<ImpactAnalysisRunRecord | null>;
  cancel(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord | null>;
  isCancellationRequested(run: ImpactAnalysisRunRef): Promise<boolean>;
}

export interface ImpactWorkerRunResult {
  id: string;
  status: ImpactAnalysisRunStatus;
  stopReason?: string | null;
  resumedFromFrontier?: boolean;
}

export interface ImpactAnalysisWorkerOptions {
  workerId?: string;
  leaseDurationMs?: number;
  heartbeatIntervalMs?: number;
  now?: () => Date;
}

export class ImpactAnalysisWorker {
  private readonly workerId: string;
  private readonly leaseDurationMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: ImpactWorkerRepository,
    private readonly graphStore: Pick<GraphStore, "traverse">,
    options: ImpactAnalysisWorkerOptions = {}
  ) {
    this.workerId = options.workerId ?? `impact-worker:${randomUUID()}`;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 10_000;
    this.now = options.now ?? (() => new Date());
  }

  async claim(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord | null> {
    return this.repository.claim(run, this.workerId, this.nextLeaseExpiry());
  }

  async run(run: ImpactAnalysisRunRef): Promise<ImpactWorkerRunResult> {
    const existing = await this.requireRun(run);
    if (await this.repository.isCancellationRequested(run)) return this.cancel(run, existing);

    const claimed = await this.claim(run);
    if (!claimed) return toResult(await this.requireRun(run));
    return this.execute(claimed, false);
  }

  async resume(run: ImpactAnalysisRunRef): Promise<ImpactWorkerRunResult> {
    const existing = await this.requireRun(run);
    if (existing.status !== "PARTIAL") throw new Error("IMPACT_ANALYSIS_RUN_NOT_PARTIAL");

    // Rebuild from original roots in one terminal transaction so prior partial paths cannot mix with resumed paths.
    await this.repository.updateRun(run, { status: "QUEUED", stopReason: null, completedAt: null });
    const claimed = await this.claim(run);
    if (!claimed) return toResult(await this.requireRun(run), true);
    return this.execute(claimed, true);
  }

  async retry(run: ImpactAnalysisRunRef): Promise<ImpactWorkerRunResult> {
    const existing = await this.requireRun(run);
    if (existing.status !== "FAILED") throw new Error("IMPACT_ANALYSIS_RUN_NOT_FAILED");
    await this.repository.updateRun(run, { status: "QUEUED", stopReason: null, completedAt: null });
    return this.run(run);
  }

  private async execute(run: ImpactAnalysisRunRecord, resumed: boolean): Promise<ImpactWorkerRunResult> {
    const heartbeat = this.startHeartbeat(run);
    try {
      const checkpoint = await this.repository.projectionCheckpoint(run);
      await this.repository.updateRun(run, { actualGraphCheckpoint: checkpoint });
      if (checkpoint < run.requiredGraphVersion) {
        const waiting = await this.repository.updateRun(run, { status: "WAITING_FOR_PROJECTION", actualGraphCheckpoint: checkpoint });
        return toResult(waiting, resumed);
      }

      if (await this.repository.isCancellationRequested(run)) return this.cancel(run, run);
      const authorization = readAuthorization(run.authorizationSnapshot, scopeOf(run));
      const execution = await this.repository.loadExecution(run);
      if (execution.roots.length === 0) throw new Error("IMPACT_ANALYSIS_ROOTS_REQUIRED");

      const budgets = readBudgets(run.budgets);
      const analysis = await analyzeTransitiveProposalImpact({
        proposal: execution.proposal,
        roots: execution.roots,
        authorization,
        maxDepth: budgets.maxDepth,
        maxNodes: budgets.maxNodes,
        maxPaths: budgets.maxPaths,
        timeoutMs: budgets.timeoutMs,
        graphVersion: checkpoint
      }, { graphStore: this.graphStore });

      if (await this.repository.isCancellationRequested(run)) return this.cancel(run, run);
      const completed = await this.repository.complete(run, this.workerId, toPersistedAnalysis(run, analysis, checkpoint));
      if (completed) return toResult(completed, resumed);

      const current = await this.requireRun(run);
      return await this.repository.isCancellationRequested(run) ? this.cancel(run, current) : toResult(current, resumed);
    } catch (error) {
      const failed = await this.repository.fail(run, this.workerId, errorCode(error));
      if (failed) return toResult(failed, resumed);
      const current = await this.requireRun(run);
      return await this.repository.isCancellationRequested(run) ? this.cancel(run, current) : toResult(current, resumed);
    } finally {
      clearInterval(heartbeat);
    }
  }

  private startHeartbeat(run: ImpactAnalysisRunRecord): ReturnType<typeof setInterval> {
    return setInterval(() => {
      void this.repository.heartbeat(run, this.workerId, this.nextLeaseExpiry());
    }, this.heartbeatIntervalMs);
  }

  private nextLeaseExpiry(): Date {
    return new Date(this.now().getTime() + this.leaseDurationMs);
  }

  private async cancel(run: ImpactAnalysisRunRef, fallback: ImpactAnalysisRunRecord): Promise<ImpactWorkerRunResult> {
    const cancelled = await this.repository.cancel(run);
    return toResult(cancelled ?? fallback);
  }

  private async requireRun(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord> {
    const found = await this.repository.find(run);
    if (!found) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    return found;
  }
}

export class PrismaImpactWorkerRepository implements ImpactWorkerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claim(run: ImpactAnalysisRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<ImpactAnalysisRunRecord | null> {
    const rows = await this.prisma.$queryRaw<PrismaImpactRun[]>`
      WITH candidate AS (
        SELECT "dbId"
        FROM "ImpactAnalysisRun"
        WHERE "dbId" = ${run.id}
          AND "enterpriseId" = ${run.enterpriseId}
          AND "applicationServiceId" = ${run.applicationServiceId}
          AND "scopePath" = ${run.scopePath}
          AND (
            status IN ('QUEUED', 'WAITING_FOR_PROJECTION')
            OR (status = 'RUNNING' AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" < CURRENT_TIMESTAMP))
          )
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "ImpactAnalysisRun" AS analysis_run
      SET status = 'RUNNING',
          "leaseOwner" = ${leaseOwner},
          "leaseExpiresAt" = ${leaseExpiresAt},
          "heartbeatAt" = CURRENT_TIMESTAMP,
          "updatedAt" = CURRENT_TIMESTAMP
      FROM candidate
      WHERE analysis_run."dbId" = candidate."dbId"
        AND analysis_run."enterpriseId" = ${run.enterpriseId}
        AND analysis_run."applicationServiceId" = ${run.applicationServiceId}
        AND analysis_run."scopePath" = ${run.scopePath}
      RETURNING analysis_run.*
    `;
    return rows[0] ? toRunRecord(rows[0]) : null;
  }

  async find(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord | null> {
    const row = await this.prisma.impactAnalysisRun.findFirst({ where: runWhere(run) });
    return row ? toRunRecord(row) : null;
  }

  async updateRun(run: ImpactAnalysisRunRef, patch: Partial<ImpactAnalysisRunRecord>): Promise<ImpactAnalysisRunRecord> {
    const data: Prisma.ImpactAnalysisRunUpdateManyMutationInput = {};
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.stopReason !== undefined) data.stopReason = patch.stopReason;
    if (patch.actualGraphCheckpoint !== undefined) data.actualGraphCheckpoint = patch.actualGraphCheckpoint;
    if (patch.authorizationSnapshot !== undefined) data.authorizationSnapshot = jsonInput(patch.authorizationSnapshot);
    if (patch.budgets !== undefined) data.budgets = jsonInput(patch.budgets);
    if (patch.summary !== undefined) data.summary = jsonInput(patch.summary);
    if (patch.unexploredFrontierCount !== undefined) data.unexploredFrontierCount = patch.unexploredFrontierCount;
    if (patch.completedAt !== undefined) data.completedAt = patch.completedAt;
    const updated = await this.prisma.impactAnalysisRun.updateMany({ where: runWhere(run), data });
    if (updated.count !== 1) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    return this.requireRun(run);
  }

  async projectionCheckpoint(run: ImpactAnalysisRunRef): Promise<bigint> {
    const checkpoints = await this.prisma.projectionCheckpoint.findMany({
      where: scopeWhere(run),
      select: { projectionVersion: true }
    });
    if (checkpoints.length === 0) return 0n;
    return checkpoints.reduce((minimum, checkpoint) => checkpoint.projectionVersion < minimum ? checkpoint.projectionVersion : minimum, checkpoints[0]!.projectionVersion);
  }

  async heartbeat(run: ImpactAnalysisRunRef, leaseOwner: string, leaseExpiresAt: Date): Promise<ImpactAnalysisRunRecord | null> {
    const updated = await this.prisma.impactAnalysisRun.updateMany({
      where: { ...runWhere(run), status: "RUNNING", leaseOwner },
      data: { heartbeatAt: new Date(), leaseExpiresAt }
    });
    return updated.count === 1 ? this.requireRun(run) : null;
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
        ...scopeWhere(run),
        OR: proposal.impactedAssets.map((asset) => ({ rootAssetType: asset.type, rootAssetId: asset.id }))
      },
      orderBy: [{ rootAssetType: "asc" }, { rootAssetId: "asc" }, { logicalId: "asc" }]
    });
    return { proposal, roots: roots.map(toIdentity) };
  }

  async complete(run: ImpactAnalysisRunRef, leaseOwner: string, analysis: PersistedImpactAnalysis): Promise<ImpactAnalysisRunRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const locked = await transaction.$queryRaw<Array<{ dbId: string }>>`
        SELECT "dbId"
        FROM "ImpactAnalysisRun"
        WHERE "dbId" = ${run.id}
          AND "enterpriseId" = ${run.enterpriseId}
          AND "applicationServiceId" = ${run.applicationServiceId}
          AND "scopePath" = ${run.scopePath}
          AND status = 'RUNNING'
          AND "leaseOwner" = ${leaseOwner}
        FOR UPDATE
      `;
      if (locked.length !== 1) return null;

      const identities = uniqueIdentities([
        ...analysis.nodes.map((node) => node.node),
        ...analysis.paths.flatMap((path) => path.path.nodes)
      ]);
      const assetNodes = await transaction.assetNode.findMany({
        where: {
          ...scopeWhere(run),
          OR: identities.map((identity) => ({ nodeType: identity.nodeType, logicalId: identity.logicalId }))
        }
      });
      const nodeIds = new Map(assetNodes.map((node) => [identityKey(toIdentity(node)), node.dbId]));
      if (identities.some((identity) => !nodeIds.has(identityKey(identity)))) throw new Error("IMPACT_ANALYSIS_RESULT_NODE_NOT_FOUND");

      const prior = await transaction.impactResultNode.findMany({
        where: { ...scopeWhere(run), impactAnalysisRunId: run.id },
        select: { dbId: true }
      });
      if (prior.length > 0) {
        await transaction.impactResultPath.deleteMany({ where: { ...scopeWhere(run), impactResultNodeId: { in: prior.map((node) => node.dbId) } } });
      }
      await transaction.impactResultNode.deleteMany({ where: { ...scopeWhere(run), impactAnalysisRunId: run.id } });

      for (const node of analysis.nodes) {
        const nodeId = nodeIds.get(identityKey(node.node));
        if (!nodeId) throw new Error("IMPACT_ANALYSIS_RESULT_NODE_NOT_FOUND");
        const stored = await transaction.impactResultNode.create({
          data: {
            ...scopeWhere(run),
            impactAnalysisRunId: run.id,
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
          }
        });
        for (const path of analysis.paths.filter((candidate) => identityKey(candidate.node) === identityKey(node.node))) {
          const start = path.path.nodes[0];
          const end = path.path.nodes.at(-1);
          if (!start || !end) continue;
          const startNodeId = nodeIds.get(identityKey(start));
          const endNodeId = nodeIds.get(identityKey(end));
          if (!startNodeId || !endNodeId) throw new Error("IMPACT_ANALYSIS_PATH_NODE_NOT_FOUND");
          await transaction.impactResultPath.create({
            data: {
              ...scopeWhere(run),
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

      const terminal = await transaction.impactAnalysisRun.updateMany({
        where: { ...runWhere(run), status: "RUNNING", leaseOwner },
        data: {
          status: analysis.status,
          stopReason: analysis.stopReason ?? null,
          actualGraphCheckpoint: analysis.actualGraphCheckpoint,
          summary: jsonInput(analysis.summary),
          unexploredFrontierCount: analysis.frontier.length,
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null
        }
      });
      if (terminal.count !== 1) throw new Error("IMPACT_ANALYSIS_TERMINAL_CAS_FAILED");
      return this.requireRunInTransaction(transaction, run);
    });
  }

  async fail(run: ImpactAnalysisRunRef, leaseOwner: string, stopReason: string): Promise<ImpactAnalysisRunRecord | null> {
    const updated = await this.prisma.impactAnalysisRun.updateMany({
      where: { ...runWhere(run), status: "RUNNING", leaseOwner },
      data: { status: "FAILED", stopReason, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }
    });
    return updated.count === 1 ? this.requireRun(run) : null;
  }

  async cancel(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord | null> {
    const updated = await this.prisma.impactAnalysisRun.updateMany({
      where: { ...runWhere(run), status: { in: ["QUEUED", "WAITING_FOR_PROJECTION", "RUNNING", "CANCELLATION_REQUESTED"] } },
      data: { status: "CANCELLED", stopReason: "CANCELLED", completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null }
    });
    return updated.count === 1 ? this.requireRun(run) : this.find(run);
  }

  async isCancellationRequested(run: ImpactAnalysisRunRef): Promise<boolean> {
    const found = await this.prisma.impactAnalysisRun.findFirst({ where: runWhere(run), select: { status: true } });
    return found?.status === "CANCELLATION_REQUESTED" || found?.status === "CANCELLED";
  }

  private async requireRun(run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord> {
    const found = await this.find(run);
    if (!found) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    return found;
  }

  private async requireRunInTransaction(transaction: Prisma.TransactionClient, run: ImpactAnalysisRunRef): Promise<ImpactAnalysisRunRecord> {
    const found = await transaction.impactAnalysisRun.findFirst({ where: runWhere(run) });
    if (!found) throw new Error("IMPACT_ANALYSIS_RUN_NOT_FOUND");
    return toRunRecord(found);
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
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
  heartbeatAt: Date | null;
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
  if (!isScopedActor(value.actor)) throw new Error("AUTHORIZATION_SNAPSHOT_INVALID");
  return { actor: value.actor, scope: expectedScope };
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
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    heartbeatAt: row.heartbeatAt,
    completedAt: row.completedAt
  };
}

function scopeOf(run: ArchitectureScopeRef): ArchitectureScopeRef {
  return { applicationServiceId: run.applicationServiceId, scopePath: run.scopePath };
}

function scopeWhere(run: ImpactAnalysisRunRef) {
  return {
    enterpriseId: run.enterpriseId,
    applicationServiceId: run.applicationServiceId,
    scopePath: run.scopePath
  };
}

function runWhere(run: ImpactAnalysisRunRef) {
  return { dbId: run.id, ...scopeWhere(run) };
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

function stopReasonFor(reasons: string[]): string {
  const reason = reasons[0];
  return ({ MAX_DEPTH: "DEPTH_LIMIT_EXCEEDED", MAX_NODES: "NODE_BUDGET_EXCEEDED", MAX_PATHS: "PATH_BUDGET_EXCEEDED", TIMEOUT: "TIMEOUT" } as Record<string, string>)[reason ?? ""] ?? "PARTIAL";
}

function toResult(run: ImpactAnalysisRunRecord, resumed = false): ImpactWorkerRunResult {
  return {
    id: run.id,
    status: run.status,
    ...(run.stopReason ? { stopReason: run.stopReason } : {}),
    ...(resumed ? { resumedFromFrontier: true } : {})
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

function requiredPositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("IMPACT_ANALYSIS_BUDGETS_INVALID");
  return value;
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
