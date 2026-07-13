import { validateAssetLocalization } from "@specforge/core";
import { describe, expect, it } from "vitest";
import {
  buildSeedAssetInventory,
  createSeedConfiguration,
  defaultArchitectureScope,
  type SeedDesignSource,
  validateSeedLocalizationInventory
} from "./localization-report";

const seedModulePath = "../../../prisma/data/" + "specforge-self-design";
const seedSource = await import(seedModulePath) as SeedDesignSource & { selfDesignAssetLinks: unknown[] };
const seedConfiguration = createSeedConfiguration(seedSource);
const { mockServiceSeeds } = seedConfiguration;

describe("MCP bilingual multi-scope seed", () => {
  it("includes the complete Designer record set", () => {
    const report = validateSeedLocalizationInventory(buildSeedAssetInventory(seedConfiguration));
    const designerCounts = report.countsByApplicationService[defaultArchitectureScope.applicationServiceId];

    expect(designerCounts).toMatchObject({
      adr: 2,
      businessRule: 5,
      proposal: 5,
      contextPack: 1
    });
    expect(seedSource.selfDesignAssetLinks).toHaveLength(53);
  });

  it("provides complete meaningful Chinese overlays for every sibling service asset", () => {
    expect(mockServiceSeeds.map((service) => service.scope.applicationServiceId)).toEqual([
      "com.huawei.celon.specstudio",
      "com.huawei.celon.policyhub",
      "com.huawei.celon.integrationgateway"
    ]);

    for (const service of mockServiceSeeds) {
      expect(() => validateAssetLocalization("domain", service.domain)).not.toThrow();
      expect(service.domain.localizedContent?.zh?.name).not.toBe(service.domain.name);
      expect(service.domain.localizedContent?.zh?.description).not.toBe(service.domain.description);

      for (const [assetType, asset] of service.assets) {
        expect(() => validateAssetLocalization(assetType, asset)).not.toThrow();
        expect(asset.localizedContent?.zh?.name).not.toBe(asset.name);
        expect(asset.localizedContent?.zh?.description).not.toBe(asset.description);
      }
    }
  });

  it("reports scope, type, id, code, and path for incomplete localization", () => {
    const inventory = buildSeedAssetInventory(seedConfiguration);
    const invalidEntry = inventory.find((entry) => entry.applicationServiceId === "com.huawei.celon.policyhub");
    expect(invalidEntry).toBeDefined();

    const invalidInventory = inventory.map((entry) =>
      entry === invalidEntry
        ? { ...entry, asset: { ...entry.asset, localizedContent: undefined } }
        : entry
    );

    expect(() => validateSeedLocalizationInventory(invalidInventory)).toThrowError(
      expect.objectContaining({
        message: expect.stringContaining(
          "applicationServiceId=com.huawei.celon.policyhub type=domain id=domain-policyhub code=ASSET_TRANSLATION_REQUIRED path=localizedContent.zh"
        )
      })
    );
  });

  it("returns deterministic counts by application service and asset type", () => {
    const inventory = buildSeedAssetInventory(seedConfiguration);
    const first = validateSeedLocalizationInventory(inventory);
    const second = validateSeedLocalizationInventory([...inventory].reverse());

    expect(second).toEqual(first);
    expect(first.totalAssets).toBe(inventory.length);
    expect(first.countsByApplicationService["com.huawei.celon.specstudio"]).toEqual({
      domain: 1,
      dataModel: 1
    });
    expect(first.countsByApplicationService["com.huawei.celon.policyhub"]).toEqual({
      domain: 1,
      businessRule: 1
    });
    expect(first.countsByApplicationService["com.huawei.celon.integrationgateway"]).toEqual({
      domain: 1,
      api: 1,
      event: 1
    });
  });
});
