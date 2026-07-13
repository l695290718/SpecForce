import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deletePersistedDesignData } from "./persistence";
import {
  architectureChangeProposals,
  selfDesignAdrs,
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
import {
  buildSeedAssetInventory,
  createSeedConfiguration,
  defaultArchitectureScope,
  validateSeedLocalizationInventory
} from "./localization-report";

const seedConfiguration = createSeedConfiguration({
  architectureChangeProposals,
  selfDesignAdrs,
  selfDesignApis,
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
});

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
  const localizationReport = validateSeedLocalizationInventory(buildSeedAssetInventory(seedConfiguration));
  console.info(`Validated ${localizationReport.totalAssets} bilingual seed assets.`);

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

  for (const [assetType, assets] of seedConfiguration.designerAssetGroups) {
    for (const asset of assets) {
      await callToolOrThrow(client, "upsert_design_asset", { assetType, asset, architectureScope: defaultArchitectureScope });
    }
  }

  for (const service of seedConfiguration.mockServiceSeeds) {
    await callToolOrThrow(client, "upsert_design_asset", { assetType: "domain", asset: service.domain, architectureScope: service.scope });
    for (const [assetType, asset] of service.assets) {
      await callToolOrThrow(client, "upsert_design_asset", { assetType, asset, architectureScope: service.scope });
    }
  }

  await callToolOrThrow(client, "upsert_proposal", {
    proposal: seedConfiguration.selfDesignProposal,
    architectureScope: defaultArchitectureScope
  });
  for (const proposal of seedConfiguration.architectureChangeProposals) {
    await callToolOrThrow(client, "upsert_proposal", { proposal, architectureScope: defaultArchitectureScope });
  }
  await callToolOrThrow(client, "upsert_context_pack", {
    contextPack: seedConfiguration.selfDesignContextPack,
    architectureScope: defaultArchitectureScope
  });

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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
