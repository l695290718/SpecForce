import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deletePersistedDesignData } from "./persistence";
import {
  architectureChangeProposals,
  selfDesignAdr,
  selfDesignApis,
  selfDesignAssetLinks,
  selfDesignBusinessRules,
  selfDesignContextPack,
  selfDesignDataModels,
  selfDesignDomain,
  selfDesignEvents,
  selfDesignIntegration,
  selfDesignObservability,
  selfDesignProposal,
  selfDesignQualityRequirements,
  selfDesignStateMachines
} from "../../../prisma/data/specforge-self-design";

const defaultArchitectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

const legacyDemoAssetIds = [
  "domain-order",
  "data-order",
  "data-refund",
  "api-create-refund",
  "event-refund-created",
  "event-refund-succeeded",
  "rule-refund-amount",
  "sm-refund",
  "integration-payment-refund",
  "quality-refund-latency",
  "obs-refund-success-rate",
  "adr-no-sync-inventory"
];

async function main() {
  process.env.SPECFORGE_MCP_SEED = "1";
  await deletePersistedDesignData({
    assetIds: legacyDemoAssetIds,
    proposalIds: ["proposal-partial-refund"],
    contextPackIds: ["ctx-partial-refund"]
  });

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const command = resolve(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  const transport = new StdioClientTransport({
    command,
    args: [resolve(repoRoot, "apps", "mcp-server", "src", "index.ts")],
    cwd: repoRoot,
    env: {
      SPECFORGE_MCP_SEED: "1",
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {})
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "specforge-seed", version: "0.1.0" }, { capabilities: {} });

  await client.connect(transport);

  const assetGroups = [
    ["domain", [selfDesignDomain]],
    ["dataModel", selfDesignDataModels],
    ["api", selfDesignApis],
    ["event", selfDesignEvents],
    ["businessRule", selfDesignBusinessRules],
    ["stateMachine", selfDesignStateMachines],
    ["integration", [selfDesignIntegration]],
    ["quality", selfDesignQualityRequirements],
    ["observability", [selfDesignObservability]],
    ["adr", [selfDesignAdr]]
  ] as const;

  for (const [assetType, assets] of assetGroups) {
    for (const asset of assets) {
      await callToolOrThrow(client, "upsert_design_asset", { assetType, asset, architectureScope: defaultArchitectureScope });
    }
  }

  const mockServiceSeeds = [
    {
      scope: serviceScope("com.huawei.celon.specstudio"),
      domain: { ...selfDesignDomain, id: "domain-specstudio", name: "Specification Workspace", description: "Specification composition and review boundary." },
      assets: [["dataModel", { ...selfDesignDataModels[0], id: "data-specstudio-document", name: "Specification Document", domainId: "domain-specstudio", description: "Versioned specification document model." }]]
    },
    {
      scope: serviceScope("com.huawei.celon.policyhub"),
      domain: { ...selfDesignDomain, id: "domain-policyhub", name: "Architecture Policy", description: "Policy authoring and enforcement boundary." },
      assets: [["businessRule", { ...selfDesignBusinessRules[0], id: "rule-policyhub-scope-isolation", name: "Application Service Scope Isolation", domainId: "domain-policyhub", description: "Normal reads must remain inside one application service." }]]
    },
    {
      scope: serviceScope("com.huawei.celon.integrationgateway"),
      domain: { ...selfDesignDomain, id: "domain-integrationgateway", name: "Integration Gateway", description: "External contract and event integration boundary." },
      assets: [
        ["api", { ...selfDesignApis[0], id: "api-integrationgateway-contract", name: "Integration Contract API", domainId: "domain-integrationgateway", description: "Publishes governed external integration contracts." }],
        ["event", { ...selfDesignEvents[0], id: "event-integrationgateway-contract-published", name: "Integration Contract Published", domainId: "domain-integrationgateway", description: "Signals publication of an integration contract." }]
      ]
    }
  ] as const;

  for (const service of mockServiceSeeds) {
    await callToolOrThrow(client, "upsert_design_asset", { assetType: "domain", asset: service.domain, architectureScope: service.scope });
    for (const [assetType, asset] of service.assets) {
      await callToolOrThrow(client, "upsert_design_asset", { assetType, asset, architectureScope: service.scope });
    }
  }

  await callToolOrThrow(client, "upsert_proposal", { proposal: selfDesignProposal, architectureScope: defaultArchitectureScope });
  for (const proposal of architectureChangeProposals) {
    await callToolOrThrow(client, "upsert_proposal", { proposal, architectureScope: defaultArchitectureScope });
  }
  await callToolOrThrow(client, "upsert_context_pack", { contextPack: selfDesignContextPack, architectureScope: defaultArchitectureScope });

  for (const link of selfDesignAssetLinks) {
    await callToolOrThrow(client, "link_assets", { ...link, architectureScope: defaultArchitectureScope });
  }

  await client.close();
}

async function callToolOrThrow(client: Client, name: string, arguments_: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: arguments_ });
  if (result.isError) {
    const message = Array.isArray(result.content)
      ? result.content.map((item) => "text" in item ? item.text : "").filter(Boolean).join(" ")
      : "Unknown MCP seed error";
    throw new Error(`${name} failed: ${message}`);
  }
  return result;
}

function serviceScope(applicationServiceId: string) {
  return {
    applicationServiceId,
    scopePath: `pf-huawei/product-celon/subproduct-platform/module-celon-designer/${applicationServiceId}`
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
