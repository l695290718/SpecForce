import { describe, expect, it } from "vitest";
import { validateArchitectureFactBatch } from "./validation";
import type { ArchitectureFactBatchSubmission, ArchitectureFactResolution } from "./types";

const scope = { applicationServiceId: "com.example.orders", scopePath: "pf-orders/product-orders/service-orders" };
const resolved: ArchitectureFactResolution = { unitIdentities: new Set(), assertionIds: new Set(["assertion:order" ]), assetKeys: new Set(["api:api-orders"]), relationshipIdentities: new Set(["relationship:biz-sys", "relationship:sys-tech"]) };

function submission(overrides: Partial<ArchitectureFactBatchSubmission> = {}): ArchitectureFactBatchSubmission {
  return {
    id: "architecture-facts:orders:1",
    idempotencyKey: "orders:architecture:1",
    designChangeSessionId: "design-change-session:orders",
    architectureScope: scope,
    provenance: { actor: "agent:orders", tool: "claude-code" },
    evidenceRefs: ["evidence:repository:orders@sha"],
    units: [
      { id: "unit-revision:biz:orders", unitIdentity: "unit:biz:orders", revision: 1, layer: "BIZ", kind: "CAPABILITY", canonicalName: "Order Fulfillment", canonicalDescription: "The business capability that fulfills orders.", localizedContent: { zh: { name: "订单履约", description: "负责订单履约的业务能力。" } }, aliases: ["orders"], criticality: 0.9, evidenceRefs: ["evidence:repository:orders@sha"] },
      { id: "unit-revision:sys:orders", unitIdentity: "unit:sys:orders", revision: 1, layer: "SYS", kind: "SERVICE", parentUnitIdentity: "unit:biz:orders", canonicalName: "Order Service", canonicalDescription: "The system service that manages order fulfillment.", localizedContent: { zh: { name: "订单服务", description: "管理订单履约的系统服务。" } }, aliases: ["order-service"], criticality: 0.8, evidenceRefs: ["evidence:repository:orders@sha"] },
      { id: "unit-revision:tech:orders", unitIdentity: "unit:tech:orders", revision: 1, layer: "TECH", kind: "TECHNOLOGY_SERVICE", parentUnitIdentity: "unit:sys:orders", canonicalName: "Order Database", canonicalDescription: "The persistence technology service for orders.", localizedContent: { zh: { name: "订单数据库", description: "订单持久化技术服务。" } }, aliases: ["orders-db"], criticality: 0.7, evidenceRefs: ["evidence:repository:orders@sha"] }
    ],
    memberships: [
      { id: "membership-revision:sys:order-api", membershipIdentity: "membership:sys:orders:api", revision: 1, unitIdentity: "unit:sys:orders", assetType: "api", assetId: "api-orders", semanticIdentity: "api.orders", confidence: 0.95, evidenceRefs: ["evidence:repository:orders@sha"] }
    ],
    mappings: [
      { id: "mapping-revision:biz-sys:orders", mappingIdentity: "mapping:biz-sys:orders", revision: 1, sourceUnitIdentity: "unit:biz:orders", targetUnitIdentity: "unit:sys:orders", mappingFamily: "REALIZES", confidence: 0.9, relationshipIdentities: ["relationship:biz-sys"], evidenceRefs: ["evidence:repository:orders@sha"] },
      { id: "mapping-revision:sys-tech:orders", mappingIdentity: "mapping:sys-tech:orders", revision: 1, sourceUnitIdentity: "unit:sys:orders", targetUnitIdentity: "unit:tech:orders", mappingFamily: "PERSISTED_BY", confidence: 0.9, relationshipIdentities: ["relationship:sys-tech"], evidenceRefs: ["evidence:repository:orders@sha"] }
    ],
    ...overrides
  };
}

describe("3A architecture fact validation", () => {
  it("normalizes a bilingual three-layer batch and computes a stable digest", () => {
    const first = validateArchitectureFactBatch(submission(), resolved);
    const second = validateArchitectureFactBatch({ ...submission(), units: [...submission().units].reverse() }, resolved);
    expect(first.contentDigest).toBe(second.contentDigest);
    expect(first.canonicalBytes).toBeGreaterThan(0);
    expect(first.units.map((unit) => unit.unitIdentity)).toEqual(["unit:biz:orders", "unit:sys:orders", "unit:tech:orders"]);
  });

  it("rejects a mapping that skips a layer", () => {
    expect(() => validateArchitectureFactBatch({ ...submission(), mappings: [{ ...submission().mappings[0]!, sourceUnitIdentity: "unit:biz:orders", targetUnitIdentity: "unit:tech:orders" }] }, resolved)).toThrow("ARCHITECTURE_MAPPING_DIRECTION_INVALID");
  });

  it("rejects a membership that has neither an assertion nor an asset", () => {
    expect(() => validateArchitectureFactBatch({ ...submission(), memberships: [{ ...submission().memberships[0]!, assetType: undefined, assetId: undefined, assertionId: undefined }] }, resolved)).toThrow("ARCHITECTURE_MEMBERSHIP_SELECTOR_INVALID");
  });
});
