import { deletePersistedDesignData, disconnectMcpPersistence, ensureMcpPersistenceSchema, upsertContextPack, upsertDesignAsset, upsertProposal } from "../apps/mcp-server/src/persistence";
import {
  selfDesignAdr,
  selfDesignApis,
  selfDesignBusinessRules,
  selfDesignContextPack,
  selfDesignDataModels,
  selfDesignDomain,
  selfDesignEvents,
  selfDesignIntegration,
  selfDesignObservability,
  selfDesignProposal,
  selfDesignQuality,
  selfDesignStateMachines
} from "./data/specforge-self-design";

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
  await ensureMcpPersistenceSchema();
  await deletePersistedDesignData({
    assetIds: legacyDemoAssetIds,
    proposalIds: ["proposal-partial-refund"],
    contextPackIds: ["ctx-partial-refund"]
  });

  const assetGroups = [
    ["domain", [selfDesignDomain]],
    ["dataModel", selfDesignDataModels],
    ["api", selfDesignApis],
    ["event", selfDesignEvents],
    ["businessRule", selfDesignBusinessRules],
    ["stateMachine", selfDesignStateMachines],
    ["integration", [selfDesignIntegration]],
    ["quality", [selfDesignQuality]],
    ["observability", [selfDesignObservability]],
    ["adr", [selfDesignAdr]]
  ] as const;

  for (const [assetType, assets] of assetGroups) {
    for (const asset of assets) {
      await upsertDesignAsset({ assetType, asset });
    }
  }

  await upsertProposal({ proposal: selfDesignProposal });
  await upsertContextPack({ contextPack: selfDesignContextPack });
}

main()
  .then(async () => {
    await disconnectMcpPersistence();
  })
  .catch(async (error) => {
    console.error(error);
    await disconnectMcpPersistence();
    process.exit(1);
  });
