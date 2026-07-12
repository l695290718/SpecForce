import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { deletePersistedDesignData } from "./persistence";
import {
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
  await deletePersistedDesignData({
    assetIds: legacyDemoAssetIds,
    proposalIds: ["proposal-partial-refund"],
    contextPackIds: ["ctx-partial-refund"]
  });

  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const transport = new StdioClientTransport({
    command,
    args: ["--filter", "@specforge/mcp-server", "dev"],
    cwd: repoRoot,
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
      await client.callTool({ name: "upsert_design_asset", arguments: { assetType, asset } });
    }
  }

  await client.callTool({ name: "upsert_proposal", arguments: { proposal: selfDesignProposal } });
  await client.callTool({ name: "upsert_context_pack", arguments: { contextPack: selfDesignContextPack } });

  for (const link of selfDesignAssetLinks) {
    await client.callTool({ name: "link_assets", arguments: link });
  }

  await client.close();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
