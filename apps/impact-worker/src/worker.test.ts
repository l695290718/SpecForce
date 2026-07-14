import type {
  AssetNodeIdentity,
  GraphStore,
  GraphTraversalPlan,
  GraphTraversalResult,
  Proposal
} from "@specforge/core";
import type { PrismaClient } from "@prisma/client";
import { defaultHuaweiActor, scopeById } from "@specforge/core";
import { describe, expect, it } from "vitest";
import {
  ImpactAnalysisWorker,
  PrismaImpactWorkerRepository,
  type ImpactAnalysisExecution,
  type ImpactAnalysisRunRecord,
  type ImpactAnalysisRunRef,
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
const downstream: AssetNodeIdentity = {
  ...scope,
  nodeType: "event",
  logicalId: "customer-updated",
  rootAssetType: "event",
  rootAssetId: "customer-updated"
};

describe("ImpactAnalysisWorker", () => {
  it("claims a queued run exactly once and marks it RUNNING", async () => {
    const repository = new MemoryRepository(createRun());
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n));

    await expect(worker.claim(ref(repository.run))).resolves.toMatchObject({ status: "RUNNING" });
    await expect(worker.claim(ref(repository.run))).resolves.toBeNull();
  });

  it("retains a run in WAITING_FOR_PROJECTION until its required graph version is projected", async () => {
    const repository = new MemoryRepository(createRun({ requiredGraphVersion: 8n }));
    repository.projectionVersion = 7n;
    const graphStore = new StubGraphStore(7n);
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "WAITING_FOR_PROJECTION" });
    expect(graphStore.plans).toEqual([]);
    expect(repository.run.actualGraphCheckpoint).toBe(7n);
  });

  it("waits for the persisted exact-scope projection checkpoint even when the graph store reports a newer event checkpoint", async () => {
    const repository = new MemoryRepository(createRun({ requiredGraphVersion: 8n }));
    repository.projectionVersion = 7n;
    const graphStore = new StubGraphStore(99n);
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "WAITING_FOR_PROJECTION" });
    expect(graphStore.plans).toEqual([]);
    expect(repository.run.actualGraphCheckpoint).toBe(7n);
  });

  it("stops when a stale owner loses its lease before checkpoint mutation", async () => {
    const repository = new MemoryRepository(createRun());
    repository.loseLeaseOnRunningUpdate = true;
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n));

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "RUNNING" });
    expect(repository.persisted).toBeUndefined();
    expect(repository.run.actualGraphCheckpoint).toBeUndefined();
  });

  it("lets cancellation win while a worker attempts to enter projection wait", async () => {
    const repository = new MemoryRepository(createRun({ requiredGraphVersion: 8n }));
    repository.projectionVersion = 7n;
    repository.cancelOnRunningUpdate = true;
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(99n));

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "CANCELLED" });
    expect(repository.run.status).toBe("CANCELLED");
  });

  it("reclaims a RUNNING run only after its lease expires", async () => {
    const repository = new MemoryRepository(createRun({
      status: "RUNNING",
      leaseExpiresAt: new Date("2026-07-14T00:00:00.000Z")
    } as ImpactAnalysisRunRecord));
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n), { now: () => new Date("2026-07-14T00:00:01.000Z") });

    await expect(worker.claim(ref(repository.run))).resolves.toMatchObject({ status: "RUNNING", leaseOwner: expect.any(String) });
  });

  it("persists a partial traversal, its result paths, and a resumable frontier", async () => {
    const repository = new MemoryRepository(createRun());
    const graphStore = new StubGraphStore(5n, partialTraversal());
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "PARTIAL", stopReason: "DEPTH_LIMIT_EXCEEDED" });
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
    const graphStore = new StubGraphStore(5n, resumedTraversal());
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    repository.persisted = partialPersistedResult();

    await expect(worker.resume(ref(repository.run))).resolves.toMatchObject({ status: "COMPLETE", resumedFromFrontier: true });
    expect(graphStore.plans[0]?.startNodes).toEqual([dependent]);
    expect(repository.persisted?.nodes.map((node) => node.node)).toEqual([root, dependent, downstream]);
    expect(repository.persisted?.summary.resumeSegments).toEqual([{ roots: [dependent] }]);
  });

  it("lets a concurrent cancellation win instead of writing a terminal result", async () => {
    const repository = new MemoryRepository(createRun());
    repository.cancelOnFinalize = true;
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n));

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "CANCELLED" });
    expect(repository.persisted).toBeUndefined();
  });

  it("cancels instead of traversing when cancellation was requested", async () => {
    const repository = new MemoryRepository(createRun({ status: "CANCELLATION_REQUESTED" }));
    const graphStore = new StubGraphStore(5n);
    const worker = new ImpactAnalysisWorker(repository, graphStore);

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "CANCELLED" });
    expect(graphStore.plans).toEqual([]);
  });

  it("fails an execution whose authorization snapshot no longer permits the exact scope", async () => {
    const repository = new MemoryRepository(createRun({
      authorizationSnapshot: { actor: { ...defaultHuaweiActor, grants: [] }, scope }
    }));
    const worker = new ImpactAnalysisWorker(repository, new StubGraphStore(5n));

    await expect(worker.run(ref(repository.run))).resolves.toMatchObject({ status: "FAILED", stopReason: "SCOPE_ACCESS_DENIED" });
  });
});

describe("PrismaImpactWorkerRepository", () => {
  it("reads a run through its exact enterprise and architecture scope", async () => {
    const calls: unknown[] = [];
    const repository = new PrismaImpactWorkerRepository({
      impactAnalysisRun: {
        findFirst: async (input: unknown) => {
          calls.push(input);
          return null;
        }
      }
    } as unknown as PrismaClient);
    const run = createRun();

    await expect(repository.find(ref(run))).resolves.toBeNull();
    expect(calls).toEqual([{
      where: {
        dbId: run.id,
        enterpriseId: run.enterpriseId,
        applicationServiceId: run.applicationServiceId,
        scopePath: run.scopePath
      }
    }]);
  });
});

class MemoryRepository implements ImpactWorkerRepository {
  readonly execution: ImpactAnalysisExecution;
  persisted: PersistedImpactAnalysis | undefined;
  projectionVersion = 5n;
  cancelOnFinalize = false;
  cancelOnRunningUpdate = false;
  loseLeaseOnRunningUpdate = false;
  run: ImpactAnalysisRunRecord;

  constructor(run: ImpactAnalysisRunRecord) {
    this.run = run;
    this.execution = {
      proposal: proposal(),
      roots: [root]
    };
  }

  async claim(runRef: string | ImpactAnalysisRunRef, leaseOwner = "test-worker") {
    if (!matches(this.run, runRef)) return null;
    const now = new Date("2026-07-14T00:00:01.000Z");
    const expired = this.run.status === "RUNNING" && this.run.leaseExpiresAt && this.run.leaseExpiresAt < now;
    if (!["QUEUED", "WAITING_FOR_PROJECTION"].includes(this.run.status) && !expired) return null;
    this.run = { ...this.run, status: "RUNNING", leaseOwner, leaseExpiresAt: new Date("2026-07-14T00:00:31.000Z"), heartbeatAt: now };
    return this.run;
  }

  async find(runRef: string | ImpactAnalysisRunRef) {
    return matches(this.run, runRef) ? this.run : null;
  }

  async updateRun(runRef: string | ImpactAnalysisRunRef, patch: Partial<ImpactAnalysisRunRecord>) {
    if (!matches(this.run, runRef)) throw new Error("RUN_NOT_FOUND");
    this.run = { ...this.run, ...patch };
    return this.run;
  }

  async updateRunning(runRef: ImpactAnalysisRunRef, leaseOwner: string, patch: Partial<ImpactAnalysisRunRecord>) {
    if (!matches(this.run, runRef) || this.run.status !== "RUNNING" || this.run.leaseOwner !== leaseOwner) return null;
    if (this.loseLeaseOnRunningUpdate) {
      this.run = { ...this.run, leaseOwner: "replacement-worker" };
      return null;
    }
    if (this.cancelOnRunningUpdate) {
      this.run = { ...this.run, status: "CANCELLATION_REQUESTED" };
      return null;
    }
    this.run = { ...this.run, ...patch };
    return this.run;
  }

  async projectionCheckpoint(runRef: ImpactAnalysisRunRef) {
    if (!matches(this.run, runRef)) throw new Error("RUN_NOT_FOUND");
    return this.projectionVersion;
  }

  async heartbeat(runRef: ImpactAnalysisRunRef, leaseOwner: string) {
    if (!matches(this.run, runRef) || this.run.leaseOwner !== leaseOwner || this.run.status !== "RUNNING") return null;
    this.run = { ...this.run, heartbeatAt: new Date(), leaseExpiresAt: new Date(Date.now() + 30_000) };
    return this.run;
  }

  async loadExecution() {
    return this.execution;
  }

  async loadPersistedAnalysis(_run: ImpactAnalysisRunRecord) {
    return this.persisted ?? null;
  }

  async persistAnalysis(runRef: string | ImpactAnalysisRunRef, analysis: PersistedImpactAnalysis) {
    if (!matches(this.run, runRef)) throw new Error("RUN_NOT_FOUND");
    if (this.cancelOnFinalize) this.run = { ...this.run, status: "CANCELLATION_REQUESTED" };
    this.persisted = this.persisted ? {
      ...analysis,
      nodes: [...this.persisted.nodes, ...analysis.nodes],
      paths: [...this.persisted.paths, ...analysis.paths]
    } : analysis;
  }

  async complete(runRef: ImpactAnalysisRunRef, leaseOwner: string, analysis: PersistedImpactAnalysis) {
    if (!matches(this.run, runRef) || this.run.status !== "RUNNING" || this.run.leaseOwner !== leaseOwner) return null;
    if (this.cancelOnFinalize) {
      this.run = { ...this.run, status: "CANCELLATION_REQUESTED" };
      return null;
    }
    this.persisted = analysis;
    this.run = { ...this.run, status: analysis.status, stopReason: analysis.stopReason ?? null, summary: analysis.summary };
    return this.run;
  }

  async fail(runRef: ImpactAnalysisRunRef, leaseOwner: string, stopReason: string) {
    if (!matches(this.run, runRef) || this.run.status !== "RUNNING" || this.run.leaseOwner !== leaseOwner) return null;
    this.run = { ...this.run, status: "FAILED", stopReason };
    return this.run;
  }

  async cancel(runRef: ImpactAnalysisRunRef) {
    if (!matches(this.run, runRef)) return null;
    this.run = { ...this.run, status: "CANCELLED", stopReason: "CANCELLED" };
    return this.run;
  }

  async isCancellationRequested(runRef: string | ImpactAnalysisRunRef) {
    return matches(this.run, runRef) && ["CANCELLATION_REQUESTED", "CANCELLED"].includes(this.run.status);
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

function ref(run: ImpactAnalysisRunRecord): ImpactAnalysisRunRef {
  return {
    id: run.id,
    enterpriseId: run.enterpriseId,
    applicationServiceId: run.applicationServiceId,
    scopePath: run.scopePath
  };
}

function matches(run: ImpactAnalysisRunRecord, value: string | ImpactAnalysisRunRef): boolean {
  if (typeof value === "string") return run.id === value;
  return run.id === value.id
    && run.enterpriseId === value.enterpriseId
    && run.applicationServiceId === value.applicationServiceId
    && run.scopePath === value.scopePath;
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

function partialPersistedResult(): PersistedImpactAnalysis {
  const traversal = partialTraversal();
  const edge = traversal.edges[0]!;
  return {
    status: "PARTIAL",
    stopReason: "DEPTH_LIMIT_EXCEEDED",
    actualGraphCheckpoint: 5n,
    frontier: [dependent],
    summary: { unexploredFrontier: [dependent] },
    nodes: [
      { node: root, impactLevel: "high", certainty: "DIRECT", depth: 0, primaryPath: { nodes: [root], edges: [] }, alternativePaths: [], matchedRules: [], confidence: 1, recommendedActions: [], scope },
      { node: dependent, impactLevel: "high", certainty: "DEFINITE", depth: 1, primaryPath: { nodes: [root, dependent], edges: [edge] }, alternativePaths: [], matchedRules: ["READS"], confidence: 1, recommendedActions: [], scope }
    ],
    paths: [
      { node: root, rank: 0, certainty: "DIRECT", confidence: 1, path: { nodes: [root], edges: [] } },
      { node: dependent, rank: 0, certainty: "DEFINITE", confidence: 1, path: { nodes: [root, dependent], edges: [edge] } }
    ]
  };
}

function resumedTraversal(): GraphTraversalResult {
  const edge = {
    id: "edge-2",
    code: "EMITS" as const,
    source: dependent,
    target: downstream,
    strength: "strong" as const,
    confidence: 1,
    version: 5n
  };
  return {
    status: "COMPLETE",
    nodes: [dependent, downstream],
    edges: [edge],
    paths: [{ nodes: [dependent, downstream], edges: [edge] }],
    graphVersion: 5n,
    elapsedMs: 1,
    frontier: [],
    truncationReasons: []
  };
}
