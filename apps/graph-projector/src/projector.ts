import { createHash, randomUUID } from "node:crypto";

export interface ProjectionScope {
  enterpriseId: string;
  applicationServiceId: string;
  scopePath: string;
}

export interface ClaimedProjection extends ProjectionScope {
  id: string;
  relationshipEventId: string;
  graphVersion: bigint;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  status: "PENDING" | "DELIVERING";
  attemptCount: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
}

export interface ProjectionClaimOptions {
  owner: string;
  now: Date;
  leaseDurationMs: number;
  limit: number;
}

export interface ProjectionRepository {
  claim(input: ProjectionClaimOptions): Promise<ClaimedProjection[]>;
  complete(event: ClaimedProjection, input: { owner: string; now: Date }): Promise<boolean>;
  retry(event: ClaimedProjection, input: { owner: string; availableAt: Date; diagnostic: string; diagnosticRef: string }): Promise<boolean>;
  deadLetter(event: ClaimedProjection, input: { owner: string; now: Date; diagnostic: string; diagnosticRef: string }): Promise<boolean>;
}

export interface GraphGateway {
  project(event: ClaimedProjection): Promise<void>;
}

export interface ProcessSummary {
  claimed: number;
  completed: number;
  retried: number;
  deadLettered: number;
}

export interface GraphProjectorOptions {
  workerId?: string;
  batchSize?: number;
  leaseDurationMs?: number;
  maxAttempts?: number;
  baseRetryDelayMs?: number;
  now?: () => Date;
}

export class GraphProjector {
  private readonly workerId: string;
  private readonly batchSize: number;
  private readonly leaseDurationMs: number;
  private readonly maxAttempts: number;
  private readonly baseRetryDelayMs: number;
  private readonly now: () => Date;

  constructor(
    private readonly repository: ProjectionRepository,
    private readonly gateway: GraphGateway,
    options: GraphProjectorOptions = {}
  ) {
    this.workerId = options.workerId ?? `graph-projector-${randomUUID()}`;
    this.batchSize = options.batchSize ?? 100;
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseRetryDelayMs = options.baseRetryDelayMs ?? 1_000;
    this.now = options.now ?? (() => new Date());
  }

  async processOnce(): Promise<ProcessSummary> {
    const claimed = await this.repository.claim({
      owner: this.workerId,
      now: this.now(),
      leaseDurationMs: this.leaseDurationMs,
      limit: this.batchSize
    });
    const summary: ProcessSummary = { claimed: claimed.length, completed: 0, retried: 0, deadLettered: 0 };
    const blockedScopes = new Set<string>();

    for (const event of claimed) {
      const eventScopeKey = projectionScopeKey(event);
      if (blockedScopes.has(eventScopeKey)) continue;
      try {
        await this.gateway.project(event);
        if (await this.repository.complete(event, { owner: this.workerId, now: this.now() })) summary.completed += 1;
      } catch (error) {
        blockedScopes.add(eventScopeKey);
        const diagnostic = sanitizeDiagnostic(error);
        const diagnosticRef = diagnosticReference(error);
        if (event.attemptCount >= this.maxAttempts) {
          if (await this.repository.deadLetter(event, { owner: this.workerId, now: this.now(), diagnostic, diagnosticRef })) {
            summary.deadLettered += 1;
          }
        } else if (await this.repository.retry(event, {
          owner: this.workerId,
          availableAt: new Date(this.now().getTime() + retryDelayMs(event.attemptCount, this.baseRetryDelayMs)),
          diagnostic,
          diagnosticRef
        })) {
          summary.retried += 1;
        }
      }
    }

    return summary;
  }
}

function projectionScopeKey(scope: ProjectionScope): string {
  return `${scope.enterpriseId}:${scope.applicationServiceId}:${scope.scopePath}`;
}

function retryDelayMs(attemptCount: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** Math.max(0, attemptCount - 1);
}

function sanitizeDiagnostic(_error: unknown): string {
  return "GRAPH_GATEWAY_DELIVERY_FAILED";
}

function diagnosticReference(error: unknown): string {
  const value = error instanceof Error ? `${error.name}:${error.message}` : String(error);
  return createHash("sha256").update(value).digest("hex");
}
