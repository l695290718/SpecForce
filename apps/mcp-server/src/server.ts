import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "./prompts";
import { registerResources } from "./resources";
import { registerTools } from "./tools";

export interface SpecForgeMcpConfig {
  name: string;
  version: string;
  transport: "stdio" | "http";
}

export function loadConfig(): SpecForgeMcpConfig {
  return {
    name: process.env.SPECFORGE_MCP_NAME ?? "specforge-design-center",
    version: process.env.SPECFORGE_MCP_VERSION ?? "0.1.0",
    transport: (process.env.SPECFORGE_MCP_TRANSPORT as SpecForgeMcpConfig["transport"]) ?? "stdio"
  };
}

export function createSpecForgeMcpServer(config: SpecForgeMcpConfig = loadConfig()): McpServer {
  const server = new McpServer(
    {
      name: config.name,
      version: config.version
    },
    {
      capabilities: {
        resources: {},
        tools: {},
        prompts: {},
        logging: {}
      }
    }
  );

  registerResources(server);
  registerTools(server);
  registerPrompts(server);

  return server;
}
