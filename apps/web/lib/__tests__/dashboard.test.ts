import { describe, expect, it } from "vitest";
import type { GovernanceCheckResult, SpecForgeDataStore } from "@specforge/core";
import { buildDashboardScopeView } from "../dashboard";

function emptyCatalog(): SpecForgeDataStore {
  return {
    domains: [], dataModels: [], apis: [], events: [], businessRules: [], stateMachines: [], integrations: [],
    qualityRequirements: [], observabilityDesigns: [], adrs: [], proposals: [], contextPacks: []
  };
}

describe("scoped dashboard presentation", () => {
  it("shows only PolicyHub counts and generic shortcuts", () => {
    const catalog = emptyCatalog();
    catalog.domains = [{ id: "policy-domain" } as SpecForgeDataStore["domains"][number]];
    catalog.businessRules = [{ id: "policy-rule" } as SpecForgeDataStore["businessRules"][number]];

    const view = buildDashboardScopeView(catalog, []);

    expect(view).toMatchObject({
      designAssetCount: 2,
      proposalCount: 0,
      contextPackCount: 0,
      proposalLinkedAssetCount: 0,
      businessRuleCount: 1,
      governanceIssueCount: 0,
      showSelfDesignProposal: false
    });
    expect(view.specificShortcuts).toEqual([]);
    expect(view.pipeline).toEqual({ proposals: 0, assets: 2, rules: 1, contextPacks: 0 });
  });

  it("retains Designer shortcuts only when their exact scoped records exist", () => {
    const catalog = emptyCatalog();
    catalog.apis = [{ id: "api-specforge-mcp-tools" } as SpecForgeDataStore["apis"][number]];
    catalog.stateMachines = [{ id: "sm-specforge-proposal-lifecycle" } as SpecForgeDataStore["stateMachines"][number]];
    catalog.businessRules = [{ id: "rule-a" } as SpecForgeDataStore["businessRules"][number]];
    catalog.proposals = [{
      id: "proposal-specforge-self-design",
      impactedAssets: [
        { type: "api", id: "api-specforge-mcp-tools", label: "MCP tools" },
        { type: "api", id: "api-specforge-mcp-tools", label: "MCP tools duplicate" },
        { type: "stateMachine", id: "sm-specforge-proposal-lifecycle", label: "Lifecycle" }
      ]
    } as SpecForgeDataStore["proposals"][number]];
    catalog.contextPacks = [{ id: "ctx-specforge-self-design" } as SpecForgeDataStore["contextPacks"][number]];
    const governance = [{ status: "fail" }, { status: "pass" }] as GovernanceCheckResult[];

    const view = buildDashboardScopeView(catalog, governance);

    expect(view.showSelfDesignProposal).toBe(true);
    expect(view.proposalLinkedAssetCount).toBe(2);
    expect(view.businessRuleCount).toBe(1);
    expect(view.governanceIssueCount).toBe(1);
    expect(view.specificShortcuts).toEqual(["mcpTools", "proposalLifecycle", "selfContextPack"]);
  });

  it("does not expose a shortcut when only a similarly named record exists", () => {
    const catalog = emptyCatalog();
    catalog.apis = [{ id: "api-specforge-mcp-tools-copy" } as SpecForgeDataStore["apis"][number]];
    catalog.proposals = [{ id: "proposal-specforge-self-design-copy", impactedAssets: [] } as unknown as SpecForgeDataStore["proposals"][number]];
    catalog.contextPacks = [{ id: "ctx-specforge-self-design-copy" } as SpecForgeDataStore["contextPacks"][number]];

    const view = buildDashboardScopeView(catalog, []);
    expect(view.showSelfDesignProposal).toBe(false);
    expect(view.specificShortcuts).toEqual([]);
  });
});
