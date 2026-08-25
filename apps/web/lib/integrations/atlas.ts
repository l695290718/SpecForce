import { createHash, createHmac } from "node:crypto";
import type { IntegrationContract } from "@specforge/core";
import { scopeById } from "@specforge/core";
import { prisma } from "../db";

export const ATLAS_LIMITS = {
  maxScopes: 50,
  maxContracts: 500,
  maxNodes: 100,
  maxEdges: 200,
  maxPayloadBytes: 524_288,
  timeoutMs: 2_000
} as const;

export type AtlasPartialReason = "MAX_SCOPES" | "MAX_CONTRACTS" | "MAX_NODES" | "MAX_EDGES" | "MAX_PAYLOAD" | "TIMEOUT";

export interface AtlasContractView {
  contractId: string;
  consumerScopeId: string;
  integrationCallKey: string;
  sourceSystem: string;
  targetSystem: string;
  protocolKind: string;
  protocolLocator: string;
  lifecycle: string;
  resolutionStatus: "RESOLVED" | "EXTERNAL" | "UNRESOLVED";
  /** Present only when the viewer may read the provider scope. */
  providerScopeId?: string;
  targetType?: string;
  targetId?: string;
  revisionLabel?: string;
}

export interface AtlasNode {
  id: string;
  kind: "scope" | "external" | "restricted";
  label: string;
  scopeId?: string;
}

export interface AtlasEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  protocolKind: string;
  protocolLocator: string;
  contractId: string;
  lifecycle: string;
  resolutionStatus: AtlasContractView["resolutionStatus"];
}

export interface IntegrationAtlasPage {
  nodes: AtlasNode[];
  edges: AtlasEdge[];
  contracts: AtlasContractView[];
  outbound: AtlasContractView[];
  inbound: AtlasContractView[];
  coverage: { scopesInspected: number; contractsScanned: number; restrictedTargets: number; unresolvedTargets: number };
  partial: { reason: AtlasPartialReason } | null;
  cursor?: string;
}

interface AtlasCursorPayload {
  v: 1;
  waterline: string;
  scopesDone: string[];
  lastKey: string;
  activeScopeId: string;
}

function canonicalIntegrationOrder(contract: IntegrationContract, contractId: string): string {
  const binding = contract.targetResolution?.status === "RESOLVED" ? `${contract.targetKind}:${contract.targetResolution.providerScopeId}` : `EXTERNAL:${contract.targetSystem}`;
  return [contract.consumerScopeId ?? "", binding, contract.protocolKind ?? "", contract.protocolLocator ?? "", contractId].join("\u001f");
}

function atlasSignature(payload: AtlasCursorPayload): string {
  return createHmac("sha256", process.env.SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID ?? "integrations-atlas-cursor").update(JSON.stringify(payload)).digest("base64url").slice(0, 24);
}

function encodeCursor(payload: AtlasCursorPayload): string {
  return Buffer.from(JSON.stringify({ ...payload, sig: atlasSignature(payload) }), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): AtlasCursorPayload | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as AtlasCursorPayload & { sig?: string };
    if (!parsed || parsed.v !== 1 || !parsed.sig || parsed.sig !== atlasSignature(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function parseV1(contract: IntegrationContract, contractId: string, consumerScopeId: string): AtlasContractView {
  const resolution = contract.targetResolution;
  const status = resolution?.status ?? (contract.targetKind === "EXTERNAL" ? "EXTERNAL" : "UNRESOLVED");
  return {
    contractId,
    consumerScopeId,
    integrationCallKey: contract.integrationCallKey ?? contract.id,
    sourceSystem: contract.sourceSystem,
    targetSystem: contract.targetSystem,
    protocolKind: contract.protocolKind ?? "UNNORMALIZED",
    protocolLocator: contract.protocolLocator ?? "",
    lifecycle: contract.lifecycle ?? "ACTIVE",
    resolutionStatus: status,
    ...(status === "RESOLVED" && resolution && "providerScopeId" in resolution ? { providerScopeId: resolution.providerScopeId, targetType: resolution.targetType, targetId: resolution.targetId, revisionLabel: resolution.revisionLabel } : {})
  };
}

function canReadScope(scopeId: string | undefined, readableIds: Set<string>): boolean {
  return typeof scopeId === "string" && readableIds.has(scopeId);
}

export async function loadIntegrationAtlas(
  readableScopes: Array<{ id: string; name: string; scopePath: string }>,
  activeScopeId: string | undefined,
  options: { cursor?: string; language?: string }
): Promise<IntegrationAtlasPage> {
  const startedAt = Date.now();
  const cursor = decodeCursor(options.cursor);
  if (options.cursor && !cursor) throw new Error("ATLAS_CURSOR_INVALID");

  const readableIds = new Set(readableScopes.map((scope) => scope.id));
  const orderedScopes = [...readableScopes].sort((left, right) => left.id.localeCompare(right.id)).filter((scope) => !cursor?.scopesDone.includes(scope.id));
  if (orderedScopes.length > ATLAS_LIMITS.maxScopes) orderedScopes.length = ATLAS_LIMITS.maxScopes;

  const collected: Array<{ view: AtlasContractView; raw: IntegrationContract }> = [];
  const scopesDone = [...(cursor?.scopesDone ?? [])];
  let partial: { reason: AtlasPartialReason } | null = null;
  let scanned = 0;

  for (const scope of orderedScopes) {
    const rows = await prisma.designAsset.findMany({
      where: { applicationServiceId: scope.id, scopePath: scope.scopePath, type: "integration" },
      orderBy: [{ id: "asc" }],
      select: { id: true, payload: true, updatedAt: true }
    });
    scanned += rows.length;
    for (const row of rows) {
      const payload = typeof row.payload === "string" ? (JSON.parse(row.payload) as IntegrationContract) : (row.payload as unknown as IntegrationContract);
      collected.push({ view: parseV1(payload, row.id, scope.id), raw: payload });
    }
    scopesDone.push(scope.id);
    if (collected.length >= ATLAS_LIMITS.maxContracts) { partial = { reason: "MAX_CONTRACTS" }; break; }
    if (scopesDone.length >= ATLAS_LIMITS.maxScopes && scopesDone.length < readableIds.size) partial = { reason: "MAX_SCOPES" };
    if (Date.now() - startedAt > ATLAS_LIMITS.timeoutMs) { partial = { reason: "TIMEOUT" }; break; }
  }

  collected.sort((left, right) => canonicalIntegrationOrder(left.raw, left.view.contractId).localeCompare(canonicalIntegrationOrder(right.raw, right.view.contractId)));

  const nodeIndex = new Map<string, AtlasNode>();
  const ensureScopeNode = (scopeId: string): AtlasNode => {
    const existing = nodeIndex.get(`scope:${scopeId}`);
    if (existing) return existing;
    const scopeName = scopeById(scopeId)?.name ?? scopeId;
    const node: AtlasNode = { id: `scope:${scopeId}`, kind: "scope", label: scopeName, scopeId };
    nodeIndex.set(node.id, node);
    return node;
  };
  const ensureExternalNode = (label: string): AtlasNode => {
    const id = `external:${createHash("sha256").update(label).digest("hex").slice(0, 16)}`;
    const existing = nodeIndex.get(id);
    if (existing) return existing;
    const node: AtlasNode = { id, kind: "external", label };
    nodeIndex.set(node.id, node);
    return node;
  };

  let restrictedCount = 0;
  let unresolvedCount = 0;
  const edges: AtlasEdge[] = [];
  const contractViews: AtlasContractView[] = [];

  for (const { view } of collected) {
    const providerReadable = view.resolutionStatus === "RESOLVED" && canReadScope(view.providerScopeId, readableIds);
    if (view.resolutionStatus === "RESOLVED" && !providerReadable) {
      // ADR-0039 authorization projection: without provider read access the viewer gets no
      // provider identity or asset detail at all — only the deterministic restricted node.
      delete view.providerScopeId;
      delete view.targetType;
      delete view.targetId;
      delete view.revisionLabel;
    }
    contractViews.push(view);
    if (view.resolutionStatus === "UNRESOLVED") unresolvedCount += 1;
    const sourceNode = ensureScopeNode(view.consumerScopeId);
    let targetNode: AtlasNode;
    if (view.resolutionStatus === "RESOLVED") {
      if (providerReadable && view.providerScopeId) {
        targetNode = ensureScopeNode(view.providerScopeId);
      } else {
        restrictedCount += 1;
        targetNode = { id: `restricted:${createHash("sha256").update(`${view.consumerScopeId}:${view.integrationCallKey}`).digest("hex").slice(0, 16)}`, kind: "restricted", label: "__RESTRICTED__" };
        nodeIndex.set(targetNode.id, targetNode);
      }
    } else if (view.resolutionStatus === "EXTERNAL") {
      targetNode = ensureExternalNode(view.targetSystem);
    } else {
      targetNode = { id: `unresolved:${createHash("sha256").update(`${view.consumerScopeId}:${view.integrationCallKey}`).digest("hex").slice(0, 16)}`, kind: "restricted", label: "__UNRESOLVED__" };
      nodeIndex.set(targetNode.id, targetNode);
    }
    if (edges.length < ATLAS_LIMITS.maxEdges) {
      edges.push({ id: `edge:${view.contractId}`, sourceNodeId: sourceNode.id, targetNodeId: targetNode.id, protocolKind: view.protocolKind, protocolLocator: view.protocolLocator, contractId: view.contractId, lifecycle: view.lifecycle, resolutionStatus: view.resolutionStatus });
    }
    if (Date.now() - startedAt > ATLAS_LIMITS.timeoutMs && !partial) partial = { reason: "TIMEOUT" };
  }

  if (!partial && collected.length > ATLAS_LIMITS.maxContracts) partial = { reason: "MAX_CONTRACTS" };
  if (edges.length >= ATLAS_LIMITS.maxEdges && collected.length > 0 && !partial) partial = { reason: "MAX_EDGES" };

  const outbound = activeScopeId ? contractViews.filter((view) => view.consumerScopeId === activeScopeId) : [];
  const inbound = activeScopeId
    ? contractViews.filter(
        (view) =>
          view.consumerScopeId !== activeScopeId &&
          ((view.resolutionStatus === "RESOLVED" && view.providerScopeId === activeScopeId) || (view.resolutionStatus !== "RESOLVED" && view.targetSystem === scopeById(activeScopeId)?.name))
      )
    : [];

  let payloadBytes = Buffer.byteLength(JSON.stringify({ nodes: [...nodeIndex.values()], edges, contracts: contractViews }));
  if (payloadBytes > ATLAS_LIMITS.maxPayloadBytes && !partial) partial = { reason: "MAX_PAYLOAD" };
  while (payloadBytes > ATLAS_LIMITS.maxPayloadBytes && contractViews.length > 1) {
    contractViews.pop();
    payloadBytes = Buffer.byteLength(JSON.stringify({ nodes: [...nodeIndex.values()], edges, contracts: contractViews }));
  }

  const nextCursor = partial ? encodeCursor({ v: 1, waterline: new Date().toISOString(), scopesDone, lastKey: contractViews.at(-1)?.contractId ?? "", activeScopeId: activeScopeId ?? "" }) : undefined;

  const localizedLabel = (node: AtlasNode): AtlasNode => {
    if (node.label === "__RESTRICTED__") return { ...node, label: options.language === "zh" ? "受限目标（无提供方读取权限）" : "Restricted target (provider not readable)" };
    if (node.label === "__UNRESOLVED__") return { ...node, label: options.language === "zh" ? "未解析目标（缺少定位器）" : "Unresolved target (no locator)" };
    return node;
  };

  return {
    nodes: [...nodeIndex.values()].map(localizedLabel),
    edges,
    contracts: contractViews,
    outbound,
    inbound,
    coverage: { scopesInspected: scopesDone.length, contractsScanned: scanned, restrictedTargets: restrictedCount, unresolvedTargets: unresolvedCount },
    partial,
    ...(nextCursor ? { cursor: nextCursor } : {})
  };
}
