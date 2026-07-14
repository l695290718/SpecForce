import { describe, expect, it, vi } from "vitest";
import { PrismaRelationshipRepository, type RelationshipNodeInput, type RelationshipScope } from "./repository";

const scope: RelationshipScope = {
  enterpriseId: "enterprise-test",
  applicationServiceId: "application-service",
  scopePath: "product/application-service"
};

describe("PrismaRelationshipRepository", () => {
  it("uses only the AssetNode composite unique-key fields when finding a node", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const repository = new PrismaRelationshipRepository({ assetNode: { findUnique } } as never);
    const identity: RelationshipNodeInput = {
      applicationServiceId: scope.applicationServiceId,
      scopePath: scope.scopePath,
      nodeType: "api",
      logicalId: "asset-api",
      rootAssetType: "api",
      rootAssetId: "asset-api",
      nodePath: "api/asset-api",
      displayName: "Asset API",
      metadata: { source: "test" }
    };

    await repository.findNode(scope, identity);

    expect(findUnique).toHaveBeenCalledWith({
      where: {
        enterpriseId_applicationServiceId_scopePath_nodeType_logicalId: {
          enterpriseId: scope.enterpriseId,
          applicationServiceId: scope.applicationServiceId,
          scopePath: scope.scopePath,
          nodeType: "api",
          logicalId: "asset-api"
        }
      }
    });
  });

  it("deletes a canonical legacy projection by its AssetLink identity without the ledger enterprise field", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const repository = new PrismaRelationshipRepository({ assetLink: { deleteMany } } as never);

    await repository.deleteLegacyAssetLink(scope, "legacy-asset-link:legacy-row");

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        applicationServiceId: scope.applicationServiceId,
        scopePath: scope.scopePath,
        id: "legacy-row"
      }
    });
  });
});
