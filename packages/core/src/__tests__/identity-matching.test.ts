import { describe, expect, it } from "vitest";
import { matchIdentity } from "../index";

describe("deterministic identity matching", () => {
  const observation = { id: "source-1", observationType: "api-contract" as const, sourcePath: "contracts/openapi-orders.yaml" };

  it("returns one high-confidence candidate for a unique path/name match", () => {
    const result = matchIdentity({ observation, targets: [
      { type: "api", id: "api-orders", name: "Orders API", code: "orders" },
      { type: "api", id: "api-payments", name: "Payments API", code: "payments" }
    ] });

    expect(result.decision).toBe("UNAMBIGUOUS");
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ targetAssetId: "api-orders", confidence: 0.92 });
  });

  it("blocks ambiguous matches instead of choosing by name order", () => {
    const result = matchIdentity({ observation, targets: [
      { type: "api", id: "api-orders-v1", name: "Orders API v1", code: "orders" },
      { type: "api", id: "api-orders-v2", name: "Orders API v2", code: "orders" }
    ] });

    expect(result.decision).toBe("AMBIGUOUS");
    expect(result.matches.map((match) => match.targetAssetId)).toEqual(["api-orders-v1", "api-orders-v2"]);
  });

  it("does not invent a target for an unmatched observation", () => {
    const result = matchIdentity({ observation, targets: [{ type: "api", id: "api-payments", name: "Payments API", code: "payments" }] });

    expect(result.decision).toBe("UNMATCHED");
    expect(result.matches).toEqual([]);
    expect(result.unresolvedQuestions.length).toBeGreaterThan(0);
  });
});
