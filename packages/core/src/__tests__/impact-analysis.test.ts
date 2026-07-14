import { describe, expect, it } from "vitest";
import { analyzeTransitiveProposalImpact, type GraphStore } from "../index";
import { defaultHuaweiActor, huaweiArchitectureScopes } from "../architecture/mock";
import type { AssetNodeIdentity } from "../relationships/types";
import type { Proposal } from "../types";

const scope = huaweiArchitectureScopes.find((item) => item.level === "applicationService")!;
const node = (logicalId: string, nodeType: AssetNodeIdentity["nodeType"]): AssetNodeIdentity => ({ applicationServiceId: scope.id, scopePath: scope.scopePath, logicalId, nodeType, rootAssetId: logicalId, rootAssetType: nodeType === "dataEntity" || nodeType === "dataField" ? "dataModel" : nodeType === "applicationService" ? "domain" : nodeType === "apiOperation" ? "api" : nodeType });
const api = node("customer-api", "api");
const entity = node("customer-entity", "dataEntity");
const event = node("customer-event", "event");
const service = node("crm-service", "applicationService");
const edges = [
  { id: "1", code: "READS" as const, source: api, target: entity, strength: "strong" as const, confidence: 0.95, version: 1n },
  { id: "2", code: "CARRIES" as const, source: event, target: entity, strength: "strong" as const, confidence: 0.95, version: 1n },
  { id: "3", code: "SUBSCRIBES" as const, source: service, target: event, strength: "strong" as const, confidence: 0.9, version: 1n }
];
const path = { nodes: [api, entity, event, service], edges };
const store: GraphStore = { async traverse() { return { status: "COMPLETE", nodes: path.nodes, edges, paths: [path], frontier: [], truncationReasons: [], graphVersion: 7n, elapsedMs: 1 }; }, async upsertProjection(batch) { return { graphVersion: batch.graphVersion, projectedNodeCount: batch.nodes.length, projectedEdgeCount: batch.edges.length }; }, async checkpoint() { return 7n; } };
const proposal = { id: "p1", name: "P", title: "P", description: "P", background: "B", goal: "G", nonGoal: "N", scope: "S", impactedAssets: [], specChanges: ["Change schema type and security constraint"], risks: [], rolloutPlan: "R", status: "draft", createdAt: "2026-01-01", updatedAt: "2026-01-01", architectureScope: { applicationServiceId: scope.id, scopePath: scope.scopePath } } as Proposal;

describe("transitive impact evaluation", () => {
  it("ranks an explainable transitive path and preserves change semantics", async () => {
    const result = await analyzeTransitiveProposalImpact({ proposal, roots: [api], authorization: { actor: defaultHuaweiActor, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } } }, { graphStore: store });
    expect(result.nodes.find((item) => item.node.logicalId === "crm-service")).toMatchObject({ certainty: "DEFINITE", impactLevel: "high", depth: 3 });
    expect(result.nodes.find((item) => item.node.logicalId === "crm-service")?.primaryPath.edges.map((edge) => edge.code)).toEqual(["READS", "CARRIES", "SUBSCRIBES"]);
    expect(result.changes).toEqual(expect.arrayContaining(["TYPE_CHANGE", "SECURITY_CHANGE", "CONSTRAINT_CHANGE"]));
  });
  it("passes PARTIAL and frontier through without claiming completeness", async () => {
    const partial: GraphStore = { ...store, async traverse() { return { status: "PARTIAL", nodes: [api], edges: [], paths: [], frontier: [entity], truncationReasons: ["MAX_NODES"], graphVersion: 8n, elapsedMs: 2 }; } };
    const result = await analyzeTransitiveProposalImpact({ proposal, roots: [api], authorization: { actor: defaultHuaweiActor, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } } }, { graphStore: partial });
    expect(result).toMatchObject({ status: "PARTIAL", truncationReasons: ["MAX_NODES"] });
    expect(result.frontier).toEqual([entity]);
  });
});
