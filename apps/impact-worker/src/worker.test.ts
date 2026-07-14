import type {
  AssetNodeIdentity,
  GraphStore,
  GraphTraversalPlan,
  GraphTraversalResult,
  Proposal
} from "@specforge/core";
import { defaultHuaweiActor, scopeById } from "@specforge/core";
import { describe, expect, it } from "vitest";
import {
  ImpactAnalysisWorker,
  type ImpactAnalysisExecution,
  type ImpactAnalysisRunRecord,
  type ImpactWorkerRepository,
  type PersistedImpactAnalysis
} from "./worker";

const applicationService = scopeById("com.huawei.celon.desiner");
if (!applicationService) throw new Error("TEST_APPLICATION_SERVICE_MISSING");
const scope = { applicationServiceId: applicationService.id, scopePath: applicationService.scopePath };
const root: AssetNodeIdentity = {
  ...scope,
  nodeType: "api",
  logicalId: "customer-api",
  rootAssetType: "api",
  rootAssetId: "customer-api"
};
const dependent: AssetNodeIdentity = {
  ...scope,
  nodeType: "dataModel",
  logicalId: "customer-model",
  rootAssetType: "dataModel",
  rootAssetId: "customer-model"
};

describe("ImpactAnalysisWorker", () => {
  it("claims a queued run exactly once and marks it RUNNING", async () => {
    const repository = new MemoryRepository(createRun());
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n));

    await expect(worker.claim("run-1")).resolves.toMatchObject({ status: "RUNNING" });
    await expect(worker.claim("run-1")).resolves.toBeNull();
  });

  it("retains a run in WAITING_FOR_PROJECTION until its required graph version is projected", async () => {
    const repository = new MemoryRepository(createRun({ requiredGraphVersion: 8n }));
    const graphStore = new StubGraphStore(7n);
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run("run-1")).resolves.toMatchObject({ status: "WAITING_FOR_PROJECTION" });
    expect(graphStore.plans).toEqual([]);
    expect(repository.run.actualGraphCheckpoint).toBe(7n);
  });

  it("persists a partial traversal, its result paths, and a resumable frontier", async () => {
    const repository = new MemoryRepository(createRun());
    const graphStore = new StubGraphStore(5n, partialTraversal());
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run("run-1")).resolves.toMatchObject({ status: "PARTIAL", stopReason: "DEPTH_LIMIT_EXCEEDED" });
    expect(repository.persisted).toMatchObject({ status: "PARTIAL", stopReason: "DEPTH_LIMIT_EXCEEDED" });
    expect(repository.persisted?.nodes).toHaveLength(2);
    expect(repository.persisted?.paths).toHaveLength(2);
    expect(repository.run.summary).toMatchObject({ unexploredFrontier: [dependent] });
  });

  it("resumes a partial run from its persisted frontier", async () => {
    const repository = new MemoryRepository(createRun({
      status: "PARTIAL",
      summary: { unexploredFrontier: [dependent] }
    }));
    const graphStore = new StubGraphStore(5n, completeTraversal(dependent));
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.resume("run-1")).resolves.toMatchObject({ status: "COMPLETE", resumedFromFrontier: true });
    expect(graphStore.plans[0]?.startNodes).toEqual([dependent]);
  });

  it("cancels instead of traversing when cancellation was requested", async () => {
    const repository = new MemoryRepository(createRun({ status: "CANCELLATION_REQUESTED" }));
    const graphStore = new StubGraphStore(5n);
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run("run-1")).resolves.toMatchObject({ status: "CANCELLED" });
    expect(graphStore.plans).toEqual([]);
  });

  it("fails an execution whose authorization snapshot no longer permits the exact scope", async () => {
    const repository = new MemoryRepository(createRun({
      authorizationSnapshot: { actor: { ...defaultHuaweiActor, grants: [] }, scope }
    }));
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n));

    await expect(worker.run("run-1")).resolves.toMatchObject({ status: "FAILED", stopReason: "SCOPE_ACCESS_DENIED" });
  });
});

class MemoryRepository implements ImpactWorkerRepository {
  readonly execution: ImpactAnalysisExecution;
  persisted: PersistedImpactAnalysis | undefined;
  run: ImpactAnalysisRunRecord;

  constructor(run: ImpactAnalysisRunRecord) {
    this.run = run;
    this.execution = {
      proposal: proposal(),
      roots: [root]
    };
  }

  async claim(runId: string) {
    if (this.run.id !== runId || !["QUEUED", "WAITING_FOR_PROJECTION"].includes(this.run.status)) return null;
    this.run = { ...this.run, status: "RUNNING" };
    return this.run;
  }

  async find(runId: string) {
    return this.run.id === runId ? this.run : null;
  }

  async updateRun(runId: string, patch: Partial<ImpactAnalysisRunRecord>) {
    if (this.run.id !== runId) throw new Error("RUN_NOT_FOUND");
    this.run = { ...this.run, ...patch };
    return this.run;
  }

  async loadExecution() {
    return this.execution;
  }

  async persistAnalysis(runId: string, analysis: PersistedImpactAnalysis) {
    if (this.run.id !== runId) throw new Error("RUN_NOT_FOUND");
    this.persisted = analysis;
  }

  async isCancellationRequested(runId: string) {
    return this.run.id === runId && ["CANCELLATION_REQUESTED", "CANCELLED"].includes(this.run.status);
  }
}

class StubGraphStore implements Pick<GraphStore, "checkpoint" | "traverse"> {
  readonly plans: GraphTraversalPlan[] = [];

  constructor(private readonly version: bigint, private readonly result: GraphTraversalResult = completeTraversal(root)) {}

  async checkpoint() {
    return this.version;
  }

  async traverse(plan: GraphTraversalPlan) {
    this.plans.push(plan);
    return this.result;
  }
}

function createRun(overrides: Partial<ImpactAnalysisRunRecord> = {}): ImpactAnalysisRunRecord {
  return {
    id: "run-1",
    enterpriseId: "enterprise-1",
    ...scope,
    proposalId: "proposal-1",
    status: "QUEUED",
    assetVersion: 2n,
    relationshipVersion: 3n,
    ontologyVersion: "specforge.relationships.v1",
    requiredGraphVersion: 5n,
    authorizationSnapshot: { actor: defaultHuaweiActor, scope },
    budgets: { maxDepth: 12, maxNodes: 1000, maxPaths: 1000, timeoutMs: 30_000 },
    summary: {},
    ...overrides
  };
}

function proposal(): Proposal {
  return {
    id: "proposal-1",
    name: "Customer API change",
    title: "Customer API change",
    description: "Change the customer API.",
    background: "Existing contract requires an update.",
    goal: "Preserve customer behavior.",
    nonGoal: "No new service.",
    scope: "Customer API",
    impactedAssets: [{ type: "api", id: "customer-api", label: "Customer API" }],
    specChanges: ["Change customer API schema"],
    risks: [],
    rolloutPlan: "Deploy safely.",
    status: "approved",
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    architectureScope: scope
  };
}

function completeTraversal(start: AssetNodeIdentity): GraphTraversalResult {
  return {
    status: "COMPLETE",
    nodes: [start],
    edges: [],
    paths: [{ nodes: [start], edges: [] }],
    graphVersion: 5n,
    elapsedMs: 1,
    frontier: [],
    truncationReasons: []
  };
}

function partialTraversal(): GraphTraversalResult {
  const edge = {
    id: "edge-1",
    code: "READS" as const,
    source: root,
    target: dependent,
    strength: "strong" as const,
    confidence: 1,
    version: 5n
  };
  return {
    status: "PARTIAL",
    nodes: [root, dependent],
    edges: [edge],
    paths: [{ nodes: [root, dependent], edges: [edge] }],
    graphVersion: 5n,
    elapsedMs: 1,
    frontier: [dependent],
    truncationReasons: ["MAX_DEPTH"]
  };
}
