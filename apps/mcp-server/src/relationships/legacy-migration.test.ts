import { describe, expect, it } from "vitest";
import {
  LegacyRelationMigrationError,
  normalizeLegacyAssetLink
} from "./legacy-migration";

const apiToDataModel = {
  sourceType: "api",
  sourceId: "api-ai-generation",
  targetType: "dataModel",
  targetId: "data-ai-generation",
  description: "The endpoint accesses provider request and response data."
};

describe("normalizeLegacyAssetLink", () => {
  it("splits reads-writes into READS and WRITES", () => {
    const link = { ...apiToDataModel, relationType: "reads-writes" };

    expect(normalizeLegacyAssetLink(link)).toEqual([
      { ...apiToDataModel, relationType: "READS" },
      { ...apiToDataModel, relationType: "WRITES" }
    ]);
  });

  it("accepts current aggregate READS and WRITES relation codes", () => {
    expect(normalizeLegacyAssetLink({ ...apiToDataModel, relationType: "READS" }))
      .toEqual([{ ...apiToDataModel, relationType: "READS" }]);
    expect(normalizeLegacyAssetLink({ ...apiToDataModel, relationType: "writes" }))
      .toEqual([{ ...apiToDataModel, relationType: "WRITES" }]);
  });

  it("accepts an API contract CONTAINS relationship", () => {
    const link = {
      sourceType: "api",
      sourceId: "api-mcp-tools",
      targetType: "api",
      targetId: "api-asset-upsert",
      relationType: "contains",
      description: "The MCP contract contains the asset-upsert contract."
    };

    expect(normalizeLegacyAssetLink(link)).toEqual([{ ...link, relationType: "CONTAINS" }]);
  });

  it("rejects an unregistered legacy relation code", () => {
    expect(() => normalizeLegacyAssetLink({ ...apiToDataModel, relationType: "synchronizes" }))
      .toThrow(new LegacyRelationMigrationError("LEGACY_RELATION_UNKNOWN", "synchronizes"));
  });

  it("rejects an unregistered relation with no canonical migration", () => {
    expect(() => normalizeLegacyAssetLink({
      sourceType: "api",
      sourceId: "api-web-console",
      targetType: "api",
      targetId: "api-ai-generation",
      relationType: "synchronizes"
    })).toThrow(new LegacyRelationMigrationError("LEGACY_RELATION_UNKNOWN", "synchronizes"));
  });

  it("maps historical relationship vocabulary to canonical ontology codes", () => {
    expect(normalizeLegacyAssetLink({
      sourceType: "api",
      sourceId: "api-web-console",
      targetType: "api",
      targetId: "api-ai-generation",
      relationType: "calls"
    })).toEqual([{
      sourceType: "api",
      sourceId: "api-web-console",
      targetType: "api",
      targetId: "api-ai-generation",
      relationType: "CALLS"
    }]);

    expect(normalizeLegacyAssetLink({
      sourceType: "event",
      sourceId: "event-asset-upserted",
      targetType: "api",
      targetId: "api-asset-upsert",
      relationType: "emitted-by"
    })).toEqual([{
      sourceType: "event",
      sourceId: "event-asset-upserted",
      targetType: "api",
      targetId: "api-asset-upsert",
      relationType: "EMITTED_BY"
    }]);

    expect(normalizeLegacyAssetLink({
      sourceType: "contextPack",
      sourceId: "ctx-self-design",
      targetType: "proposal",
      targetId: "proposal-self-design",
      relationType: "implements-context-for"
    })).toEqual([{
      sourceType: "contextPack",
      sourceId: "ctx-self-design",
      targetType: "proposal",
      targetId: "proposal-self-design",
      relationType: "IMPLEMENTS_CONTEXT_FOR"
    }]);
  });
});
