import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IntegrationContract } from "@specforge/core";
import { prisma } from "../db";

export const ATLAS_LIMITS = { maxScopes: 50, maxContracts: 500, maxNodes: 100, maxEdges: 200, maxPayloadBytes: 524_288, timeoutMs: 2_000 } as const;
export type AtlasPartialReason = "MAX_SCOPES" | "MAX_CONTRACTS" | "MAX_NODES" | "MAX_EDGES" | "MAX_PAYLOAD" | "TIMEOUT";
export type AtlasResolutionStatus = "RESOLVED" | "EXTERNAL" | "UNRESOLVED" | "RESTRICTED";

export class IntegrationAtlasReadError extends Error {
  constructor(readonly code: "ATLAS_CURSOR_INVALID" | "ATLAS_CURSOR_STALE" | "ATLAS_SCOPE_UNAUTHORIZED" | "ATLAS_SUBJECT_REQUIRED" | "ATLAS_CURSOR_KEY_REQUIRED" | "ATLAS_CURSOR_KEY_INVALID") { super(code); }
}

export interface AtlasContractView {
  contractId: string; consumerScopeId: string; integrationCallKey: string; sourceSystem: string; targetSystem: string;
  protocolKind: string; protocolLocator: string; lifecycle: string; resolutionStatus: AtlasResolutionStatus; restricted: boolean;
  providerScopeId?: string; targetType?: string; targetId?: string; revisionLabel?: string;
}
export interface AtlasNode { id: string; kind: "scope" | "external" | "restricted"; label: string; scopeId?: string; }
export interface AtlasEdge {
  id: string; sourceNodeId: string; targetNodeId: string; protocolKind: string; protocolLocator: string;
  contractId: string; lifecycle: string; resolutionStatus: AtlasResolutionStatus; restricted: boolean;
}
export interface IntegrationAtlasPage {
  nodes: AtlasNode[]; edges: AtlasEdge[]; contracts: AtlasContractView[]; outbound: AtlasContractView[]; inbound: AtlasContractView[];
  coverage: { scopesInspected: number; contractsScanned: number; restrictedTargets: number; unresolvedTargets: number };
  partial: { reason: AtlasPartialReason } | null;
  canvasPartial: { reason: Extract<AtlasPartialReason, "MAX_NODES" | "MAX_EDGES" | "MAX_PAYLOAD"> } | null;
  cursor?: string;
}
interface AtlasCursorPayload { v: 2; kid: string; subject: string; activeScopeId: string; readableScopeDigest: string; waterline: string; scopeIndex: number; lastSortKey: string; }
interface CursorKeyring { activeKeyId: string; keys: Record<string, Buffer>; }
interface RawAtlasContract { view: AtlasContractView; internalProviderScopeId?: string; }
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
  const body = Buffer.from(JSON.stringify({ ...payload, v: 2, kid: keyring.activeKeyId }), "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", keyring.keys[keyring.activeKeyId]!).update(body).digest("base64url")}`;
}
function decodeCursor(raw: string | undefined, keyring = readCursorKeyring()): AtlasCursorPayload | undefined {
  if (!raw) return undefined;
  try {
    const [body, signature] = raw.split(".", 2);
    if (!body || !signature) throw new Error("format");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AtlasCursorPayload;
    const key = payload?.kid ? keyring.keys[payload.kid] : undefined;
    if (!key || payload.v !== 2) throw new Error("key");
    const expected = createHmac("sha256", key).update(body).digest("base64url");
    if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error("signature");
    return payload;
  } catch { throw new IntegrationAtlasReadError("ATLAS_CURSOR_INVALID"); }
}
function parseContract(contract: IntegrationContract, contractId: string, consumerScopeId: string): RawAtlasContract {
  const resolution = contract.targetResolution;
  const status = resolution?.status ?? (contract.targetKind === "EXTERNAL" ? "EXTERNAL" : "UNRESOLVED");
  const providerScopeId = status === "RESOLVED" && resolution && "providerScopeId" in resolution ? resolution.providerScopeId : undefined;
  return { view: {
    contractId, consumerScopeId, integrationCallKey: contract.integrationCallKey ?? contractId, sourceSystem: consumerScopeId,
    targetSystem: contract.targetSystem, protocolKind: contract.protocolKind ?? "UNNORMALIZED", protocolLocator: contract.protocolLocator ?? "",
    lifecycle: contract.lifecycle ?? "ACTIVE", resolutionStatus: status, restricted: false,
    ...(providerScopeId ? { providerScopeId, targetType: resolution.targetType, targetId: resolution.targetId, revisionLabel: resolution.revisionLabel } : {})
  }, internalProviderScopeId: providerScopeId };
}
function redactProvider(view: AtlasContractView): AtlasContractView {
  return { ...view, integrationCallKey: RESTRICTED, targetSystem: RESTRICTED, protocolLocator: "", resolutionStatus: "RESTRICTED", restricted: true, providerScopeId: undefined, targetType: undefined, targetId: undefined, revisionLabel: undefined };
}
function localizeNode(node: AtlasNode, language: string | undefined): AtlasNode {
  if (node.label === RESTRICTED) return { ...node, label: language === "zh" ? "受限目标（无提供方读取权限）" : "Restricted target (provider not readable)" };
  if (node.label === UNRESOLVED) return { ...node, label: language === "zh" ? "未解析目标（缺少定位器）" : "Unresolved target (no locator)" };
  return node;
}
async function currentWaterline(scopes: Array<{ id: string; scopePath: string }>): Promise<string> {
  const aggregate = await prisma.designAsset.aggregate({ where: { type: "integration", OR: scopes.map((scope) => ({ applicationServiceId: scope.id, scopePath: scope.scopePath })) }, _count: { _all: true }, _max: { updatedAt: true } });
  return digest({ count: aggregate._count._all, updatedAt: aggregate._max.updatedAt?.toISOString() ?? null });
}

export async function loadIntegrationAtlas(readableScopes: Array<{ id: string; name: string; scopePath: string }>, activeScopeId: string | undefined, options: { subject: string; cursor?: string; language?: string }): Promise<IntegrationAtlasPage> {
  if (!options.subject?.trim()) throw new IntegrationAtlasReadError("ATLAS_SUBJECT_REQUIRED");
  const orderedScopes = [...readableScopes].sort((left, right) => left.id.localeCompare(right.id));
  const readableScopeDigest = digest(orderedScopes.map((scope) => [scope.id, scope.scopePath]));
  if (activeScopeId && !orderedScopes.some((scope) => scope.id === activeScopeId)) throw new IntegrationAtlasReadError("ATLAS_SCOPE_UNAUTHORIZED");
  const keyring = readCursorKeyring();
  const cursor = decodeCursor(options.cursor, keyring);
  const waterline = await currentWaterline(orderedScopes);
  if (cursor && (cursor.subject !== options.subject || cursor.activeScopeId !== (activeScopeId ?? "") || cursor.readableScopeDigest !== readableScopeDigest)) throw new IntegrationAtlasReadError("ATLAS_CURSOR_INVALID");
  if (cursor && cursor.waterline !== waterline) throw new IntegrationAtlasReadError("ATLAS_CURSOR_STALE");

  const startedAt = Date.now(); let scopeIndex = cursor?.scopeIndex ?? 0; let lastSortKey = cursor?.lastSortKey ?? ""; let inspectedScopes = 0; let scanned = 0;
  const rawContracts: RawAtlasContract[] = []; let continuation: { scopeIndex: number; lastSortKey: string; reason: AtlasPartialReason } | undefined;
  while (scopeIndex < orderedScopes.length && inspectedScopes < ATLAS_LIMITS.maxScopes) {
    if (Date.now() - startedAt > ATLAS_LIMITS.timeoutMs) { continuation = { scopeIndex, lastSortKey, reason: "TIMEOUT" }; break; }
    const scope = orderedScopes[scopeIndex]!; const remaining = ATLAS_LIMITS.maxContracts - rawContracts.length;
    if (remaining <= 0) { continuation = { scopeIndex, lastSortKey, reason: "MAX_CONTRACTS" }; break; }
    const rows = await prisma.designAsset.findMany({
      where: { applicationServiceId: scope.id, scopePath: scope.scopePath, type: "integration", ...(lastSortKey ? { integrationSortKey: { gt: lastSortKey } } : {}) },
      orderBy: [{ integrationSortKey: "asc" }, { id: "asc" }], take: remaining + 1, select: { id: true, payload: true, integrationSortKey: true }
    });
    inspectedScopes += 1; scanned += Math.min(rows.length, remaining);
    const pageRows = rows.slice(0, remaining);
    for (const row of pageRows) rawContracts.push(parseContract(typeof row.payload === "string" ? JSON.parse(row.payload) as IntegrationContract : row.payload as unknown as IntegrationContract, row.id, scope.id));
    if (rows.length > remaining) { continuation = { scopeIndex, lastSortKey: String(pageRows.at(-1)?.integrationSortKey ?? pageRows.at(-1)?.id ?? lastSortKey), reason: "MAX_CONTRACTS" }; break; }
    scopeIndex += 1; lastSortKey = "";
  }
  if (!continuation && scopeIndex < orderedScopes.length) continuation = { scopeIndex, lastSortKey, reason: "MAX_SCOPES" };

  const readableIds = new Set(orderedScopes.map((scope) => scope.id)); const scopeNames = new Map(orderedScopes.map((scope) => [scope.id, scope.name]));
  const nodeIndex = new Map<string, AtlasNode>(); const edges: AtlasEdge[] = []; const contractViews: AtlasContractView[] = []; const outbound: AtlasContractView[] = []; const inbound: AtlasContractView[] = [];
  let restrictedTargets = 0; let unresolvedTargets = 0; let canvasReason: IntegrationAtlasPage["canvasPartial"] extends { reason: infer R } | null ? R : never;
  const addNode = (node: AtlasNode): AtlasNode | undefined => { const existing = nodeIndex.get(node.id); if (existing) return existing; if (nodeIndex.size >= ATLAS_LIMITS.maxNodes) { canvasReason ??= "MAX_NODES"; return undefined; } nodeIndex.set(node.id, node); return node; };
  const scopeNode = (scopeId: string) => addNode({ id: `scope:${scopeId}`, kind: "scope", label: scopeNames.get(scopeId) ?? scopeId, scopeId });
  const externalNode = (label: string) => addNode({ id: `external:${digest(label).slice(0, 16)}`, kind: "external", label });
  const restrictedNode = (consumerScopeId: string, contractId: string, label: string) => addNode({ id: `restricted:${digest([consumerScopeId, contractId]).slice(0, 16)}`, kind: "restricted", label });
  for (const raw of rawContracts) {
    const providerReadable = Boolean(raw.internalProviderScopeId && readableIds.has(raw.internalProviderScopeId));
    const view = raw.view.resolutionStatus === "RESOLVED" && !providerReadable ? redactProvider(raw.view) : raw.view;
    if (view.restricted) restrictedTargets += 1; if (view.resolutionStatus === "UNRESOLVED") unresolvedTargets += 1;
    contractViews.push(view); if (activeScopeId && view.consumerScopeId === activeScopeId) outbound.push(view); if (activeScopeId && raw.internalProviderScopeId === activeScopeId) inbound.push(view);
    const source = scopeNode(view.consumerScopeId);
    const target = view.restricted ? restrictedNode(view.consumerScopeId, view.contractId, RESTRICTED) : view.resolutionStatus === "RESOLVED" && view.providerScopeId ? scopeNode(view.providerScopeId) : view.resolutionStatus === "EXTERNAL" ? externalNode(view.targetSystem) : restrictedNode(view.consumerScopeId, view.contractId, UNRESOLVED);
    if (!source || !target) continue;
    if (edges.length >= ATLAS_LIMITS.maxEdges) { canvasReason ??= "MAX_EDGES"; continue; }
    edges.push({ id: `edge:${view.contractId}`, sourceNodeId: source.id, targetNodeId: target.id, protocolKind: view.protocolKind, protocolLocator: view.protocolLocator, contractId: view.contractId, lifecycle: view.lifecycle, resolutionStatus: view.resolutionStatus, restricted: view.restricted });
  }
  let payloadBytes = Buffer.byteLength(JSON.stringify({ nodes: [...nodeIndex.values()], edges, contracts: contractViews }));
  if (payloadBytes > ATLAS_LIMITS.maxPayloadBytes) { canvasReason ??= "MAX_PAYLOAD"; while (edges.length > 1 && payloadBytes > ATLAS_LIMITS.maxPayloadBytes) { edges.pop(); payloadBytes = Buffer.byteLength(JSON.stringify({ nodes: [...nodeIndex.values()], edges, contracts: contractViews })); } }
  const nextCursor = continuation ? encodeCursor({ subject: options.subject, activeScopeId: activeScopeId ?? "", readableScopeDigest, waterline, scopeIndex: continuation.scopeIndex, lastSortKey: continuation.lastSortKey }, keyring) : undefined;
  return { nodes: [...nodeIndex.values()].map((node) => localizeNode(node, options.language)), edges, contracts: contractViews, outbound, inbound, coverage: { scopesInspected: inspectedScopes, contractsScanned: scanned, restrictedTargets, unresolvedTargets }, partial: continuation ? { reason: continuation.reason } : null, canvasPartial: canvasReason ? { reason: canvasReason } : null, ...(nextCursor ? { cursor: nextCursor } : {}) };
}
