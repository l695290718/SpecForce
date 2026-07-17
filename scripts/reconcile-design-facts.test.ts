import { expect, it } from "vitest";

import { reconcileDesignFacts } from "./reconcile-design-facts";

it("reports a missing ADR as incomplete", async () => {
  const report = await reconcileDesignFacts({
    manifest: {
      decisions: [{
        id: "scope",
        mcpAdrId: "adr-scope",
        scope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" }
      }]
    } as never,
    find: async () => undefined
  });

  expect(report.missing).toEqual(["scope"]);
  expect(report.verified).toEqual([]);
});
