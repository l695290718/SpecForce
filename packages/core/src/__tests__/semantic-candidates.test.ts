import { describe, expect, it } from "vitest";
import { generateSemanticCandidates, type ScanObservation } from "../index";

describe("semantic candidate generation", () => {
  it("keeps mock semantic extraction deterministic and bilingual", async () => {
    const observations: ScanObservation[] = [{
      id: "source:report:observation:orders",
      observationType: "api-contract",
      sourcePath: "contracts/orders.openapi.yaml",
      payload: { path: "contracts/orders.openapi.yaml", digest: "orders" },
      normalizedDigest: "normalized"
    }];

    const first = await generateSemanticCandidates({ observations });
    const second = await generateSemanticCandidates({ observations });

    expect(first.content).toEqual(second.content);
    expect(first.content[0]).toMatchObject({
      sourceObservationId: observations[0]!.id,
      layer: "SYS",
      aspect: "contract",
      value: { summary: { en: expect.any(String), zh: expect.any(String) } },
      confidence: 0.78
    });
    expect(first.usage.mocked).toBe(true);
  });
});
