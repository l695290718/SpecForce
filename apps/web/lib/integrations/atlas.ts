import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Evidence, IntegrationContract } from "@specforge/core";
import { prisma } from "../db";

export const ATLAS_LIMITS = { maxScopes: 50, maxContracts: 500, maxNodes: 100, maxEdges: 200, maxPayloadBytes: 524_288, timeoutMs: 2_000 } as const;
export type AtlasPartialReason = "MAX_SCOPES" | "MAX_CONTRACTS" | "MAX_NODES" | "MAX_EDGES" | "MAX_PAYLOAD" | "TIMEOUT";
export type AtlasResolutionStatus = "RESOLVED" | "EXTERNAL" | "UNRESOLVED" | "RESTRICTED";
export type AtlasVerificationState = "ATTESTED" | "DRIFT" | "BLOCKED_ATTESTATION" | "UNATTESTED";

export class IntegrationAtlasReadError extends Error {
  constructor(readonly code: "ATLAS_CURSOR_INVALID" | "ATLAS_CURSOR_STALE" | "ATLAS_SCOPE_UNAUTHORIZED" | "ATLAS_SUBJECT_REQUIRED" | "ATLAS_CURSOR_KEY_REQUIRED" | "ATLAS_CURSOR_KEY_INVALID") { super(code); }
}

export interface AtlasContractView {
  contractId: string; consumerScopeId: string; integrationCallKey: string; sourceSystem: string; targetSystem: string;
  protocolKind: string; protocolLocator: string; lifecycle: string; resolutionStatus: AtlasResolutionStatus; restricted: boolean;
  verificationState: AtlasVerificationState;
  providerScopeId?: string; targetType?: string; targetId?: string; revisionLabel?: string;
}
export interface AtlasNode { id: string; kind: "scope" | "external" | "restricted"; label: string; scopeId?: string; }
export interface AtlasEdge {
  id: string; sourceNodeId: string; targetNodeId: string; protocolKind: string; protocolLocator: string;
  contractId: string; lifecycle: string; resolutionStatus: AtlasResolutionStatus; restricted: boolean;
  verificationState: AtlasVerificationState;
}
export interface IntegrationAtlasPage {
  nodes: AtlasNode[]; edges: AtlasEdge[]; contracts: AtlasContractView[]; outbound: AtlasContractView[]; inbound: AtlasContractView[];
  coverage: { scopesInspected: number; contractsScanned: number; restrictedTargets: number; unresolvedTargets: number; attestedContracts: number; driftContracts: number };
  partial: { reason: AtlasPartialReason } | null;
  canvasPartial: { reason: Extract<AtlasPartialReason, "MAX_NODES" | "MAX_EDGES" | "MAX_PAYLOAD"> } | null;
  cursor?: string;
}
interface AtlasCursorPayload { v: 3; kid: string; subject: string; activeScopeId: string; readableScopeDigest: string; waterline: string; scopeIndex: number; lastSortKey: string; }
interface CursorKeyring { activeKeyId: string; keys: Record<string, Buffer>; }
interface ScopedLogicalIdentity { enterpriseId: string; applicationServiceId: string; scopePath: string; logicalId: string; }
interface AtlasScopeWaterline extends Omit<ScopedLogicalIdentity, "logicalId"> { catalogVersion: string; relationshipVersion: string; }
interface RawAtlasContract { view: AtlasContractView; internalProviderScopeId?: string; consumerScopePath: string; enterpriseId: string; }
const RESTRICTED = "__RESTRICTED__";
const UNRESOLVED = "__UNRESOLVED__";

function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function readCursorKeyring(): CursorKeyring {
  const raw = process.env.SPECFORGE_3A_CURSOR_KEYS?.trim();
  const activeKeyId = process.env.SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID ?? "local-development";
  if (!raw) {
    if (process.env.NODE_ENV === "production" && process.env.SPECFORGE_MCP_SEED !== "1") throw new IntegrationAtlasReadError("ATLAS_CURSOR_KEY_REQUIRED");
    return { activeKeyId, keys: { [activeKeyId]: Buffer.from("specforge-local-development-cursor-key", "utf8") } };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    const keys = Object.fromEntries(Object.entries(parsed).flatMap(([key, value]) => typeof value === "string" && value ? [[key, Buffer.from(value, "base64")]] : [])) as Record<string, Buffer>;
    if (!keys[activeKeyId]?.length) throw new Error("active missing");
    return { activeKeyId, keys };
  } catch { throw new IntegrationAtlasReadError("ATLAS_CURSOR_KEY_INVALID"); }
}
function encodeCursor(payload: Omit<AtlasCursorPayload, "v" | "kid">, keyring = readCursorKeyring()): string {
  const body = Buffer.from(JSON.stringify({ ...payload, v: 3, kid: keyring.activeKeyId }), "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", keyring.keys[keyring.activeKeyId]!).update(body).digest("base64url")}`;
}
function decodeCursor(raw: string | undefined, keyring = readCursorKeyring()): AtlasCursorPayload | undefined {
  if (!raw) return undefined;
  try {
    const [body, signature] = raw.split(".", 2);
    if (!body || !signature) throw new Error("format");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AtlasCursorPayload;
    const key = payload?.kid ? keyring.keys[payload.kid] : undefined;
    if (!key || payload.v !== 3) throw new Error("key");
    const expected = createHmac("sha256", key).update(body).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("signature");
    return payload;
  } catch { throw new IntegrationAtlasReadError("ATLAS_CURSOR_INVALID"); }
}
function parseContract(contract: IntegrationContract, contractId: string, scope: { id: string; scopePath: string }): RawAtlasContract {
  const resolution = contract.targetResolution;
  const status = resolution?.status ?? (contract.targetKind === "EXTERNAL" ? "EXTERNAL" : "UNRESOLVED");
  const resolvedTarget = status === "RESOLVED" && resolution && "providerScopeId" in resolution ? resolution : undefined;
  const providerScopeId = resolvedTarget?.providerScopeId;
  return { view: {
    contractId, consumerScopeId: scope.id, integrationCallKey: contract.integrationCallKey ?? contractId, sourceSystem: scope.id,
    targetSystem: contract.targetSystem, protocolKind: contract.protocolKind ?? "UNNORMALIZED", protocolLocator: contract.protocolLocator ?? "",
    lifecycle: contract.lifecycle ?? "ACTIVE", resolutionStatus: status, restricted: false, verificationState: "UNATTESTED",
    ...(providerScopeId ? { providerScopeId, targetType: resolvedTarget!.targetType, targetId: resolvedTarget!.targetId, revisionLabel: resolvedTarget!.revisionLabel } : {})
  }, internalProviderScopeId: providerScopeId, consumerScopePath: scope.scopePath, enterpriseId: configuredEnterpriseId() };
}
function redactProvider(view: AtlasContractView): AtlasContractView {
  return { ...view, integrationCallKey: RESTRICTED, targetSystem: RESTRICTED, protocolLocator: "", resolutionStatus: "RESTRICTED", restricted: true, providerScopeId: undefined, targetType: undefined, targetId: undefined, revisionLabel: undefined };
}
function localizeNode(node: AtlasNode, language: string | undefined): AtlasNode {
  if (node.label === RESTRICTED) return { ...node, label: language === "zh" ? "受限目标（无提供方读取权限）" : "Restricted target (provider not readable)" };
  if (node.label === UNRESOLVED) return { ...node, label: language === "zh" ? "未解析目标（缺少定位器）" : "Unresolved target (no locator)" };
  return node;
}
function configuredEnterpriseId(): string { return process.env.SPECFORGE_ENTERPRISE_ID?.trim() || "legacy-enterprise"; }
function scopedKey(identity: ScopedLogicalIdentity): string { return JSON.stringify([identity.enterpriseId, identity.applicationServiceId, identity.scopePath, identity.logicalId]); }

async function currentWaterline(client: Prisma.TransactionClient, scopes: Array<{ id: string; scopePath: string }>): Promise<string> {
  if (scopes.length === 0) return digest([]);
  const scopePredicates = scopes.map((scope) => ({ applicationServiceId: scope.id, scopePath: scope.scopePath }));
  const [catalogRows, relationshipRows] = await Promise.all([
    client.authoredCatalogCursor.findMany({ where: { OR: scopePredicates }, select: { applicationServiceId: true, scopePath: true, nextVersion: true } }),
    client.relationshipEvent.groupBy({ by: ["enterpriseId", "applicationServiceId", "scopePath"], where: { enterpriseId: configuredEnterpriseId(), OR: scopePredicates }, _max: { graphVersion: true } })
  ]);
  const catalogByScope = new Map(catalogRows.map((row) => [`${row.applicationServiceId}|${row.scopePath}`, row.nextVersion.toString()]));
  const relationshipByScope = new Map(relationshipRows.map((row) => [`${row.applicationServiceId}|${row.scopePath}`, row._max.graphVersion?.toString() ?? "0"]));
  const vector: AtlasScopeWaterline[] = scopes
    .map((scope) => ({
      enterpriseId: configuredEnterpriseId(),
      applicationServiceId: scope.id,
      scopePath: scope.scopePath,
      catalogVersion: catalogByScope.get(`${scope.id}|${scope.scopePath}`) ?? "0",
      relationshipVersion: relationshipByScope.get(`${scope.id}|${scope.scopePath}`) ?? "0"
    }))
    .sort((left, right) => `${left.enterpriseId}|${left.applicationServiceId}|${left.scopePath}`.localeCompare(`${right.enterpriseId}|${right.applicationServiceId}|${right.scopePath}`));
  return digest(vector);
}

export async function loadIntegrationAtlas(readableScopes: Array<{ id: string; name: string; scopePath: string }>, activeScopeId: string | undefined, options: { subject: string; cursor?: string; language?: string }): Promise<IntegrationAtlasPage> {
  if (!options.subject?.trim()) throw new IntegrationAtlasReadError("ATLAS_SUBJECT_REQUIRED");
  const orderedScopes = [...readableScopes].sort((left, right) => left.id.localeCompare(right.id));
  const readableScopeDigest = digest(orderedScopes.map((scope) => [scope.id, scope.scopePath]));
  if (activeScopeId && !orderedScopes.some((scope) => scope.id === activeScopeId)) throw new IntegrationAtlasReadError("ATLAS_SCOPE_UNAUTHORIZED");
  const keyring = readCursorKeyring();
  const cursor = decodeCursor(options.cursor, keyring);
  return prisma.$transaction(
    (transaction) => loadIntegrationAtlasSnapshot(transaction, orderedScopes, activeScopeId, options, readableScopeDigest, cursor, keyring),
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
  );
}

function parseEvidence(payload: unknown): Evidence | undefined {
  try {
    return (typeof payload === "string" ? JSON.parse(payload) : payload) as Evidence;
  } catch {
    return undefined;
  }
}

function verificationState(status: string): AtlasVerificationState {
  return status === "passed" ? "ATTESTED" : status === "failed" ? "DRIFT" : "BLOCKED_ATTESTATION";
}

async function loadIntegrationAtlasSnapshot(
  client: Prisma.TransactionClient,
  orderedScopes: Array<{ id: string; name: string; scopePath: string }>,
  activeScopeId: string | undefined,
  options: { subject: string; cursor?: string; language?: string },
  readableScopeDigest: string,
  cursor: AtlasCursorPayload | undefined,
  keyring: CursorKeyring
): Promise<IntegrationAtlasPage> {
  const waterline = await currentWaterline(client, orderedScopes);
  if (cursor && (cursor.subject !== options.subject || cursor.activeScopeId !== (activeScopeId ?? "") || cursor.readableScopeDigest !== readableScopeDigest)) throw new IntegrationAtlasReadError("ATLAS_CURSOR_INVALID");
  if (cursor && cursor.waterline !== waterline) throw new IntegrationAtlasReadError("ATLAS_CURSOR_STALE");
  const startedAt = Date.now(); let scopeIndex = cursor?.scopeIndex ?? 0; let lastSortKey = cursor?.lastSortKey ?? ""; let inspectedScopes = 0; let scanned = 0;
  const rawContracts: RawAtlasContract[] = []; let continuation: { scopeIndex: number; lastSortKey: string; reason: AtlasPartialReason } | undefined;
  while (scopeIndex < orderedScopes.length && inspectedScopes < ATLAS_LIMITS.maxScopes) {
    if (Date.now() - startedAt > ATLAS_LIMITS.timeoutMs) { continuation = { scopeIndex, lastSortKey, reason: "TIMEOUT" }; break; }
    const scope = orderedScopes[scopeIndex]!; const remaining = ATLAS_LIMITS.maxContracts - rawContracts.length;
    if (remaining <= 0) { continuation = { scopeIndex, lastSortKey, reason: "MAX_CONTRACTS" }; break; }
    const rows = await client.designAsset.findMany({
      where: { applicationServiceId: scope.id, scopePath: scope.scopePath, type: "integration", ...(lastSortKey ? { integrationSortKey: { gt: lastSortKey } } : {}) },
      orderBy: [{ integrationSortKey: "asc" }, { id: "asc" }], take: remaining + 1, select: { id: true, payload: true, integrationSortKey: true }
    });
    inspectedScopes += 1; scanned += Math.min(rows.length, remaining);
    const pageRows = rows.slice(0, remaining);
    for (const row of pageRows) rawContracts.push(parseContract(typeof row.payload === "string" ? JSON.parse(row.payload) as IntegrationContract : row.payload as unknown as IntegrationContract, row.id, scope));
    if (rows.length > remaining) { continuation = { scopeIndex, lastSortKey: String(pageRows.at(-1)?.integrationSortKey ?? pageRows.at(-1)?.id ?? lastSortKey), reason: "MAX_CONTRACTS" }; break; }
    scopeIndex += 1; lastSortKey = "";
  }
  if (!continuation && scopeIndex < orderedScopes.length) continuation = { scopeIndex, lastSortKey, reason: "MAX_SCOPES" };

  // Verification states (ADR-0041): the latest canonical VALIDATES evidence per contract decides the state.
  const verificationByContract = new Map<string, AtlasVerificationState>();
  const contractGroups = new Map<string, { enterpriseId: string; applicationServiceId: string; scopePath: string; targetIds: Set<string> }>();
  for (const raw of rawContracts) {
    const key = `${raw.enterpriseId}|${raw.view.consumerScopeId}|${raw.consumerScopePath}`;
    const group = contractGroups.get(key) ?? { enterpriseId: raw.enterpriseId, applicationServiceId: raw.view.consumerScopeId, scopePath: raw.consumerScopePath, targetIds: new Set<string>() };
    group.targetIds.add(raw.view.contractId);
    contractGroups.set(key, group);
  }
  const relationshipRows = rawContracts.length > 0 && Date.now() - startedAt <= ATLAS_LIMITS.timeoutMs
    ? await client.relationshipCurrent.findMany({
      where: {
        relationType: "VALIDATES",
        lifecycleStatus: "ACTIVE",
        OR: [...contractGroups.values()].map((group) => ({
          enterpriseId: group.enterpriseId,
          applicationServiceId: group.applicationServiceId,
          scopePath: group.scopePath,
          targetNode: { nodeType: "integration", logicalId: { in: [...group.targetIds] } }
        }))
      },
      select: {
        enterpriseId: true,
        applicationServiceId: true,
        scopePath: true,
        sourceNode: { select: { nodeType: true, logicalId: true } },
        targetNode: { select: { nodeType: true, logicalId: true } }
      }
    })
    : [];
  const evidenceGroups = new Map<string, { enterpriseId: string; applicationServiceId: string; scopePath: string; ids: Set<string> }>();
  for (const row of relationshipRows) {
    if (row.sourceNode.nodeType !== "evidence" || row.targetNode.nodeType !== "integration") continue;
    const key = `${row.enterpriseId}|${row.applicationServiceId}|${row.scopePath}`;
    const group = evidenceGroups.get(key) ?? { enterpriseId: row.enterpriseId, applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, ids: new Set<string>() };
    group.ids.add(row.sourceNode.logicalId);
    evidenceGroups.set(key, group);
  }
  const evidenceRows = evidenceGroups.size > 0
    ? await client.designAsset.findMany({
      where: {
        type: "evidence",
        OR: [...evidenceGroups.values()].map((group) => ({ applicationServiceId: group.applicationServiceId, scopePath: group.scopePath, id: { in: [...group.ids] } }))
      },
      select: { id: true, payload: true, applicationServiceId: true, scopePath: true }
    })
    : [];
  const evidenceById = new Map(evidenceRows.map((row) => [scopedKey({ enterpriseId: configuredEnterpriseId(), applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, logicalId: row.id }), parseEvidence(row.payload)]));
  const latest = new Map<string, { recordedAt: number; id: string; status: string }>();
  for (const row of relationshipRows) {
    if (row.sourceNode.nodeType !== "evidence" || row.targetNode.nodeType !== "integration") continue;
    const evidence = evidenceById.get(scopedKey({ enterpriseId: row.enterpriseId, applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, logicalId: row.sourceNode.logicalId }));
    if (!evidence?.recordedAt || !["passed", "failed", "blocked"].includes(evidence.status)) continue;
    const recordedAt = Date.parse(evidence.recordedAt);
    if (!Number.isFinite(recordedAt)) continue;
    const contractKey = scopedKey({ enterpriseId: row.enterpriseId, applicationServiceId: row.applicationServiceId, scopePath: row.scopePath, logicalId: row.targetNode.logicalId });
    const incumbent = latest.get(contractKey);
    if (!incumbent || recordedAt > incumbent.recordedAt || (recordedAt === incumbent.recordedAt && row.sourceNode.logicalId > incumbent.id)) latest.set(contractKey, { recordedAt, id: row.sourceNode.logicalId, status: evidence.status });
  }
  for (const raw of rawContracts) {
    const identity = scopedKey({ enterpriseId: raw.enterpriseId, applicationServiceId: raw.view.consumerScopeId, scopePath: raw.consumerScopePath, logicalId: raw.view.contractId });
    const attestation = latest.get(identity);
    verificationByContract.set(identity, attestation ? verificationState(attestation.status) : "UNATTESTED");
  }
  for (const raw of rawContracts) {
    const identity = scopedKey({ enterpriseId: raw.enterpriseId, applicationServiceId: raw.view.consumerScopeId, scopePath: raw.consumerScopePath, logicalId: raw.view.contractId });
    raw.view.verificationState = verificationByContract.get(identity) ?? "UNATTESTED";
  }

  const readableIds = new Set(orderedScopes.map((scope) => scope.id)); const scopeNames = new Map(orderedScopes.map((scope) => [scope.id, scope.name]));
  const nodeIndex = new Map<string, AtlasNode>(); const edges: AtlasEdge[] = []; const contractViews: AtlasContractView[] = []; const outbound: AtlasContractView[] = []; const inbound: AtlasContractView[] = [];
  let restrictedTargets = 0; let unresolvedTargets = 0; let attestedContracts = 0; let driftContracts = 0;
  let canvasReason: Extract<AtlasPartialReason, "MAX_NODES" | "MAX_EDGES" | "MAX_PAYLOAD"> | undefined = undefined;
  const addNode = (node: AtlasNode): AtlasNode | undefined => { const existing = nodeIndex.get(node.id); if (existing) return existing; if (nodeIndex.size >= ATLAS_LIMITS.maxNodes) { canvasReason ??= "MAX_NODES"; return undefined; } nodeIndex.set(node.id, node); return node; };
  const scopeNode = (scopeId: string) => addNode({ id: `scope:${scopeId}`, kind: "scope", label: scopeNames.get(scopeId) ?? scopeId, scopeId });
  const externalNode = (label: string) => addNode({ id: `external:${digest(label).slice(0, 16)}`, kind: "external", label });
  const restrictedNode = (consumerScopeId: string, contractId: string, label: string) => addNode({ id: `restricted:${digest([consumerScopeId, contractId]).slice(0, 16)}`, kind: "restricted", label });
  for (const raw of rawContracts) {
    const providerReadable = Boolean(raw.internalProviderScopeId && readableIds.has(raw.internalProviderScopeId));
    const view = raw.view.resolutionStatus === "RESOLVED" && !providerReadable ? redactProvider(raw.view) : raw.view;
    const identity = scopedKey({ enterpriseId: raw.enterpriseId, applicationServiceId: view.consumerScopeId, scopePath: raw.consumerScopePath, logicalId: view.contractId });
    view.verificationState = verificationByContract.get(identity) ?? "UNATTESTED";
    if (view.verificationState === "ATTESTED") attestedContracts += 1;
    if (view.verificationState === "DRIFT") driftContracts += 1;
    if (view.restricted) restrictedTargets += 1; if (view.resolutionStatus === "UNRESOLVED") unresolvedTargets += 1;
    contractViews.push(view); if (activeScopeId && view.consumerScopeId === activeScopeId) outbound.push(view); if (activeScopeId && raw.internalProviderScopeId === activeScopeId) inbound.push(view);
    const source = scopeNode(view.consumerScopeId);
    const target = view.restricted ? restrictedNode(view.consumerScopeId, view.contractId, RESTRICTED) : view.resolutionStatus === "RESOLVED" && view.providerScopeId ? scopeNode(view.providerScopeId) : view.resolutionStatus === "EXTERNAL" ? externalNode(view.targetSystem) : restrictedNode(view.consumerScopeId, view.contractId, UNRESOLVED);
    if (!source || !target) continue;
    if (edges.length >= ATLAS_LIMITS.maxEdges) { canvasReason ??= "MAX_EDGES"; continue; }
    edges.push({ id: `edge:${digest([raw.enterpriseId, raw.consumerScopePath, view.consumerScopeId, view.contractId]).slice(0, 16)}`, sourceNodeId: source.id, targetNodeId: target.id, protocolKind: view.protocolKind, protocolLocator: view.protocolLocator, contractId: view.contractId, lifecycle: view.lifecycle, resolutionStatus: view.resolutionStatus, restricted: view.restricted, verificationState: view.verificationState });
  }
  let payloadBytes = Buffer.byteLength(JSON.stringify({ nodes: [...nodeIndex.values()], edges, contracts: contractViews }));
  if (payloadBytes > ATLAS_LIMITS.maxPayloadBytes) { canvasReason ??= "MAX_PAYLOAD"; while (edges.length > 1 && payloadBytes > ATLAS_LIMITS.maxPayloadBytes) { edges.pop(); payloadBytes = Buffer.byteLength(JSON.stringify({ nodes: [...nodeIndex.values()], edges, contracts: contractViews })); } }
  const nextCursor = continuation ? encodeCursor({ subject: options.subject, activeScopeId: activeScopeId ?? "", readableScopeDigest, waterline, scopeIndex: continuation.scopeIndex, lastSortKey: continuation.lastSortKey }, keyring) : undefined;
  return { nodes: [...nodeIndex.values()].map((node) => localizeNode(node, options.language)), edges, contracts: contractViews, outbound, inbound, coverage: { scopesInspected: inspectedScopes, contractsScanned: scanned, restrictedTargets, unresolvedTargets, attestedContracts, driftContracts }, partial: continuation ? { reason: continuation.reason } : null, canvasPartial: canvasReason ? { reason: canvasReason } : null, ...(nextCursor ? { cursor: nextCursor } : {}) };
}
