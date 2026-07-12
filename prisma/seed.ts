import { generateContextPack, seedData } from "@specforge/core";
import { disconnectMcpPersistence, ensureMcpPersistenceSchema, upsertContextPack, upsertDesignAsset, upsertProposal } from "../apps/mcp-server/src/persistence";
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

async function main() {
  await ensureMcpPersistenceSchema();

  const assetGroups = [
    ["domain", seedData.domains],
    ["dataModel", seedData.dataModels],
    ["api", seedData.apis],
    ["event", seedData.events],
    ["businessRule", seedData.businessRules],
    ["stateMachine", seedData.stateMachines],
    ["integration", seedData.integrations],
    ["quality", seedData.qualityRequirements],
    ["observability", seedData.observabilityDesigns],
    ["adr", seedData.adrs],
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

  for (const proposal of seedData.proposals) {
    await upsertProposal({ proposal });
  }
  await upsertProposal({ proposal: selfDesignProposal });

  await upsertContextPack({ contextPack: await generateContextPack("proposal-partial-refund") });
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
