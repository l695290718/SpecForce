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

it("reports a missing linked proposal as incomplete", async () => {
  const report = await reconcileDesignFacts({
    manifest: { decisions: [{ id: "scope", mcpAdrId: "adr-scope", proposalId: "proposal-scope", contextPackId: "ctx-scope", scope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" } }] } as never,
    find: async (type) => type === "adr" ? { id: "adr-scope", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: "scope" }, localizedContent: { zh: {} } } : undefined
  });
  expect(report.missing).toEqual(["scope:proposal"]);
});
