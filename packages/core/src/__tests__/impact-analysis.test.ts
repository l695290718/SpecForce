import { describe, expect, it } from "vitest";
import { analyzeTransitiveProposalImpact, generateContextPack, seedData, type GraphStore, type SpecForgeDataStore } from "../index";
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

  it("does not re-add an omitted root to a partial traversal", async () => {
    const partial: GraphStore = {
      ...store,
      async traverse() {
        return {
          status: "PARTIAL",
          nodes: [api],
          edges: [],
          paths: [{ nodes: [api], edges: [] }],
          frontier: [event],
          truncationReasons: ["MAX_NODES"],
          graphVersion: 8n,
          elapsedMs: 2
        };
      }
    };

    const result = await analyzeTransitiveProposalImpact({ proposal, roots: [api, event], authorization: { actor: defaultHuaweiActor, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } } }, { graphStore: partial });

    expect(result.nodes.map((item) => item.node.logicalId)).toEqual(["customer-api"]);
    expect(result.nodes.find((item) => item.node.logicalId === "customer-event")).toBeUndefined();
  });

  it("keeps an explicit root DIRECT when longer evidence also returns to it", async () => {
    const loop = { id: "4", code: "REFERENCES" as const, source: entity, target: api, strength: "medium" as const, confidence: 0.8, version: 1n };
    const result = await analyzeTransitiveProposalImpact({ proposal, roots: [api], authorization: { actor: defaultHuaweiActor, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } } }, {
      graphStore: {
        ...store,
        async traverse() {
          return { status: "COMPLETE", nodes: [api, entity], edges: [edges[0]!, loop], paths: [{ nodes: [api], edges: [] }, { nodes: [api, entity, api], edges: [edges[0]!, loop] }], frontier: [], truncationReasons: [], graphVersion: 7n, elapsedMs: 1 };
        }
      }
    });

    expect(result.nodes.find((item) => item.node.logicalId === "customer-api")).toMatchObject({ certainty: "DIRECT", depth: 0, primaryPath: { edges: [] } });
  });

  it("marks returned nodes without a path as NOT_IMPACTED", async () => {
    const result = await analyzeTransitiveProposalImpact({ proposal, roots: [api], authorization: { actor: defaultHuaweiActor, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } } }, {
      graphStore: {
        ...store,
        async traverse() {
          return { status: "COMPLETE", nodes: [api, event], edges: [], paths: [{ nodes: [api], edges: [] }], frontier: [], truncationReasons: [], graphVersion: 7n, elapsedMs: 1 };
        }
      }
    });

    expect(result.nodes.find((item) => item.node.logicalId === "customer-event")).toMatchObject({ certainty: "NOT_IMPACTED", impactLevel: "low", confidence: 0 });
  });

  it("localizes the transitive summary and passes that same summary into Context Pack output", async () => {
    const catalog = localizedCatalog();
    const localizedProposal = catalog.proposals[0]!;
    const localizedApi = node("api-create-refund", "api");
    const localizedEvent = node("event-refund-created", "event");
    const relation = { id: "localized-1", code: "EMITS" as const, source: localizedApi, target: localizedEvent, strength: "strong" as const, confidence: 0.95, version: 1n };
    const impact = await analyzeTransitiveProposalImpact({ proposal: localizedProposal, roots: [localizedApi], authorization: { actor: defaultHuaweiActor, scope: { applicationServiceId: scope.id, scopePath: scope.scopePath } }, catalog, locale: "zh" }, {
      graphStore: {
        ...store,
        async traverse() {
          return { status: "COMPLETE", nodes: [localizedApi, localizedEvent], edges: [relation], paths: [{ nodes: [localizedApi, localizedEvent], edges: [relation] }], frontier: [], truncationReasons: [], graphVersion: 9n, elapsedMs: 1 };
        }
      }
    });
    const pack = await generateContextPack(localizedProposal.id, { catalog, locale: "zh", transitiveImpact: impact });

    expect(impact.affectedDomains).toEqual(["\u4e2d\u6587\u9886\u57df"]);
    expect(impact.impactedAssets.map((asset) => asset.label)).toEqual(["\u4e2d\u6587 API", "\u4e2d\u6587\u4e8b\u4ef6"]);
    expect(impact.implementationTasks.join("\n")).toContain("\u4e2d\u6587\u53d8\u66f4");
    expect(pack.summary).toContain("\u5f71\u54cd 2 \u4e2a\u8d44\u4ea7");
    expect(pack.instructions).toEqual(impact.implementationTasks);
    expect(pack.includedAssets.map((asset) => asset.label)).toEqual(impact.impactedAssets.map((asset) => asset.label));
  });
});

function localizedCatalog(): SpecForgeDataStore {
  const catalog = structuredClone(seedData);
  const proposal = catalog.proposals[0]!;
  const api = catalog.apis.find((asset) => asset.id === "api-create-refund")!;
  const event = catalog.events.find((asset) => asset.id === "event-refund-created")!;
  const domain = catalog.domains.find((asset) => asset.id === "domain-order")!;

  proposal.architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
  api.architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
  event.architectureScope = { applicationServiceId: scope.id, scopePath: scope.scopePath };
  proposal.impactedAssets = [{ type: "api", id: api.id, label: api.name }];
  proposal.risks = [];
  proposal.specChanges = ["Canonical change"];
  proposal.localizedContent = { zh: { name: "\u4e2d\u6587\u63d0\u6848", title: "\u4e2d\u6587\u63d0\u6848", description: "\u4e2d\u6587\u63cf\u8ff0", background: "\u4e2d\u6587\u80cc\u666f", goal: "\u4e2d\u6587\u76ee\u6807", nonGoal: "\u4e2d\u6587\u975e\u76ee\u6807", scope: "\u4e2d\u6587\u8303\u56f4", specChanges: ["\u4e2d\u6587\u53d8\u66f4"], risks: [], rolloutPlan: "\u4e2d\u6587\u53d1\u5e03", rollbackPlan: "\u4e2d\u6587\u56de\u6eda" } };
  api.localizedContent = { zh: { name: "\u4e2d\u6587 API", description: "\u4e2d\u6587 API \u63cf\u8ff0", authType: api.authType, idempotency: api.idempotency, rateLimit: api.rateLimit, timeout: api.timeout, compatibilityPolicy: api.compatibilityPolicy } };
  event.localizedContent = { zh: { name: "\u4e2d\u6587\u4e8b\u4ef6", description: "\u4e2d\u6587\u4e8b\u4ef6\u63cf\u8ff0", triggerTiming: "\u4e4b\u540e", orderingRequirement: event.orderingRequirement, retryPolicy: event.retryPolicy, deadLetterPolicy: event.deadLetterPolicy, compatibilityPolicy: event.compatibilityPolicy } };
  domain.localizedContent = {
    zh: {
      name: "\u4e2d\u6587\u9886\u57df",
      description: "\u4e2d\u6587\u9886\u57df\u63cf\u8ff0",
      entities: domain.entities,
      valueObjects: domain.valueObjects,
      domainServices: domain.domainServices,
      businessCapabilities: domain.businessCapabilities,
      glossaryTerms: domain.glossaryTerms
    }
  };

  return catalog;
}
