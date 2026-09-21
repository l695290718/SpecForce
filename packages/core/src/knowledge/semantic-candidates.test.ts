import { describe, expect, it } from "vitest";
import {
  fullAssetFamilies,
  factTypeForAssetFamily,
  classifyFullAssetCandidateRisk,
  semanticEvidenceClusterDigest,
  validateFullAssetSemanticCandidate,
  validateSemanticEvidenceCluster,
  type FullAssetFamily,
  type FullAssetSemanticCandidate,
  type SemanticEvidenceCluster
} from "./semantic-candidates";

const scope = {
  applicationServiceId: "com.specforge.designcenter",
  scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
};
const observationIds = ["source:scan-1:observation-1", "source:scan-1:observation-2"];

function cluster(overrides: Partial<SemanticEvidenceCluster> = {}): SemanticEvidenceCluster {
  const base: Omit<SemanticEvidenceCluster, "clusterDigest"> = {
    id: "cluster:platform",
    architectureScope: scope,
    domainHint: "platform",
    observationIds,
    evidenceTypes: ["source-code", "executable-test"],
    tokenEstimate: 200
  };
  const value = { ...base, ...overrides };
  return { ...value, clusterDigest: overrides.clusterDigest ?? semanticEvidenceClusterDigest(value) };
}

function candidate(assetFamily: FullAssetFamily, overrides: Partial<FullAssetSemanticCandidate> = {}): FullAssetSemanticCandidate {
  const canonicalContent = { name: `${assetFamily} candidate`, description: `Verified ${assetFamily} meaning.` };
  const localizedContent = { zh: { name: `${assetFamily} 候选`, description: `已验证的 ${assetFamily} 语义。` } };
  return {
    semanticIdentity: `specforge.${assetFamily}.candidate`,
    normalizedDigest: "a".repeat(64),
    factType: factTypeForAssetFamily[assetFamily],
    layer: "SYS",
    aspect: "structure",
    value: { canonicalContent, localizedContent },
    confidence: 0.95,
    matchingEvidence: ["source-code:evidence", "executable-test:evidence"],
    counterEvidence: [],
    unresolvedQuestions: [],
    evidenceRefs: ["source-code:evidence", "executable-test:evidence"],
    sourceObservationIds: observationIds,
    domainCluster: "platform",
    identityDecision: "UNAMBIGUOUS",
    assetFamily,
    promptPackDigest: "b".repeat(64),
    policyDigest: "c".repeat(64),
    clusterId: "cluster:platform",
    evidenceTypes: ["source-code", "executable-test"],
    canonicalContent,
    localizedContent,
    ...overrides
  };
}

describe("full-asset semantic candidate governance", () => {
  it.each(fullAssetFamilies)("validates %s candidates", (assetFamily) => {
    expect(validateFullAssetSemanticCandidate(candidate(assetFamily), cluster())).toMatchObject({ assetFamily });
  });

  it("rejects high-impact semantics supported only by a name", () => {
    expect(() => validateFullAssetSemanticCandidate(candidate("businessRule", {
      factType: "business-rule",
      evidenceTypes: ["symbol-name"],
      matchingEvidence: ["symbol-name:RefundPolicy"],
      evidenceRefs: ["symbol-name:RefundPolicy"]
    }), cluster({ evidenceTypes: ["symbol-name"] }))).toThrow("SEMANTIC_MULTI_EVIDENCE_REQUIRED");
  });

  it("rejects human-facing content without English and Chinese", () => {
    expect(() => validateFullAssetSemanticCandidate(candidate("serviceFeature", {
      localizedContent: { zh: {} },
      value: { canonicalContent: { summary: "Create an order" }, localizedContent: { zh: {} } }
    }), cluster())).toThrow("CANDIDATE_BILINGUAL_CONTENT_MISSING");
  });

  it("rejects observations outside the bounded evidence cluster", () => {
    expect(() => validateFullAssetSemanticCandidate(candidate("api", {
      factType: "api-contract",
      sourceObservationIds: ["source:scan-1:not-in-cluster"]
    }), cluster())).toThrow("SEMANTIC_CLUSTER_MEMBERSHIP_INVALID");
  });

  it("verifies immutable cluster digests", () => {
    expect(validateSemanticEvidenceCluster(cluster())).toMatchObject({ id: "cluster:platform" });
    expect(() => validateSemanticEvidenceCluster(cluster({ clusterDigest: "d".repeat(64) }))).toThrow("SEMANTIC_CLUSTER_DIGEST_MISMATCH");
  });

  it("classifies identity ambiguity, public contracts, and low-risk facts server-side", () => {
    expect(classifyFullAssetCandidateRisk(candidate("api"))).toBe("T2");
    expect(classifyFullAssetCandidateRisk(candidate("dataModel", { identityDecision: "AMBIGUOUS" }))).toBe("T3");
    expect(classifyFullAssetCandidateRisk(candidate("businessRule", { semanticIdentity: "specforge.authorization.scope-isolation" }))).toBe("T3");
    expect(classifyFullAssetCandidateRisk(candidate("quality"))).toBe("T1");
    expect(classifyFullAssetCandidateRisk(candidate("quality", { confidence: 0.99 }), true)).toBe("T0");
  });
});
