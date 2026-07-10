import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSpecForgeMcpServer, loadConfig } from "./server";

async function main() {
  const config = loadConfig();
  if (config.transport !== "stdio") {
    throw new Error("Streamable HTTP transport is reserved for a future SpecForge deployment. Set SPECFORGE_MCP_TRANSPORT=stdio for this MVP.");
  }

  const server = createSpecForgeMcpServer(config);
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error("SpecForge MCP server failed to start.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
