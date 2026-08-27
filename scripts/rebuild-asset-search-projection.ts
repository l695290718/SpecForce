import { disconnectMcpPersistence, rebuildAssetSearchProjection } from "../apps/mcp-server/src/persistence";

const applicationServiceId = process.env.SPECFORGE_APPLICATION_SERVICE_ID ?? "com.huawei.celon.desiner";

async function main(): Promise<void> {
  try {
    const result = await rebuildAssetSearchProjection(applicationServiceId);
    console.log(JSON.stringify({ status: "rebuilt", ...result }));
  } finally {
    await disconnectMcpPersistence();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
