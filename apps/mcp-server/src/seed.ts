import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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
import { upgradeLegacyDataModel, type DataModel } from "@specforge/core";
import { normalizeLegacyAssetLink } from "./relationships/legacy-migration";

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

const dataModelFieldOwners: Record<string, Record<string, string>> = {
  "data-specforge-ai-generation": { provider_id: "AIProviderConfig", capability: "AIProviderRequest", prompt: "AIProviderRequest", draft_payload: "GeneratedDraft" },
  "data-specforge-asset-graph": { node_id: "AssetGraphNode", node_type: "AssetGraphNode", edge_label: "AssetGraphEdge", domain_filter: "GraphFilter" },
  "data-specforge-assets": { asset_id: "DesignAsset", asset_type: "DesignAsset", payload: "DesignAsset" },
  "data-specforge-mcp-registry": { name: "McpTool", kind: "McpTool", permissions: "McpTool", read_only: "McpTool" },
  "data-specforge-web-workspace": { draft_key: "AssetDraft", locale: "LocalePreference", filter_payload: "WorkspaceFilter", export_format: "MarkdownExport" },
  "data-specforge-i18n": { message_key: "I18nMessage", locale: "LocalePreference", text: "I18nMessage", fallback_key: "I18nMessage" },
  "data-specstudio-document": { document_id: "SpecificationDocument", current_version: "SpecificationVersion", content_markdown: "SpecificationVersion", review_status: "ReviewThread" }
};

function normalizeSeedDataModel(asset: DataModel): DataModel {
  const owners = dataModelFieldOwners[asset.id];
  if (!owners) return upgradeLegacyDataModel(asset);
  const entityIds = new Map(asset.entities.map((name) => [name, `entity:${asset.id}:${name}`]));
  const fields = asset.fields.map((field) => {
    if (field.entityId) return field;
    const owner = owners[field.fieldName];
    const entityId = owner ? entityIds.get(owner) : undefined;
    if (!entityId) throw new Error(`FIELD_OWNERSHIP_AMBIGUOUS:${asset.id}:${field.fieldName}`);
    return { ...field, entityId };
  });
  return upgradeLegacyDataModel({ ...asset, fields });
}

async function main() {
  const localizationReport = validateSeedLocalizationInventory(buildSeedAssetInventory(seedConfiguration));
  console.info(`Validated ${localizationReport.totalAssets} bilingual seed assets.`);

  process.env.SPECFORGE_MCP_SEED = "1";
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
    stderr: "inherit"
  });
  const client = new Client({ name: "specforge-seed", version: "0.1.0" }, { capabilities: {} });

  await client.connect(transport);

  await callToolOrThrow(client, "delete_seed_design_data", {
    architectureScope: defaultArchitectureScope,
    assetIds: legacyDemoAssetIds,
    proposalIds: ["proposal-partial-refund"],
    contextPackIds: ["ctx-partial-refund"]
  });

  for (const [assetType, assets] of seedConfiguration.designerAssetGroups) {
    for (const asset of assets) {
      const normalizedAsset = assetType === "dataModel" ? normalizeSeedDataModel(asset as DataModel) : asset;
      try {
        await callToolOrThrow(client, "upsert_design_asset", { assetType, asset: normalizedAsset, architectureScope: defaultArchitectureScope });
      } catch (error) {
        console.error(`[specforge-seed] failed asset ${assetType}/${String(asset.id)}: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
  }

  for (const service of seedConfiguration.mockServiceSeeds) {
    await callToolOrThrow(client, "upsert_design_asset", { assetType: "domain", asset: service.domain, architectureScope: service.scope });
    for (const [assetType, asset] of service.assets) {
      const normalizedAsset = assetType === "dataModel" ? normalizeSeedDataModel(asset as DataModel) : asset;
      await callToolOrThrow(client, "upsert_design_asset", { assetType, asset: normalizedAsset, architectureScope: service.scope });
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
    for (const normalizedLink of normalizeLegacyAssetLink(link)) {
      await callToolOrThrow(client, "link_assets", { ...normalizedLink, architectureScope: defaultArchitectureScope });
    }
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
