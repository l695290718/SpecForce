import { describe, expect, it } from "vitest";
import { toSourceAssertion } from "./repository.js";

describe.skipIf(!process.env.SPECFORGE_3A_INTEGRATION)("3A projection repository integration contract", () => {
  it("normalizes deterministic source assertion sort keys", () => {
    const result = toSourceAssertion({ id: "assertion-1", semanticIdentity: "orders.api", layer: "SYS", factType: "api-contract", value: { method: "POST" }, confidence: 0.9, evidenceRefs: ["evidence-1"] });
    expect(result.sortKey).toBe("SYS|orders.api|assertion-1");
    expect(result.contentDigest).toHaveLength(64);
  });
});
