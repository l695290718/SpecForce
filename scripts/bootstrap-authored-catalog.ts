import { bootstrapAuthoredCatalog } from "../apps/mcp-server/src/knowledge/catalog-revision";

const architectureScope = {
  applicationServiceId: "com.huawei.celon.desiner",
  scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner"
};

bootstrapAuthoredCatalog(architectureScope)
  .then((receipt) => console.log(JSON.stringify({ ...receipt, catalogVersion: receipt.catalogVersion.toString() }, null, 2)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
