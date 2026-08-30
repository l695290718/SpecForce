import { createServer, type IncomingMessage } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createSpecForgeMcpServer, loadConfig } from "./server";

async function main() {
  const config = loadConfig();
  if (config.transport === "http") {
    await startHttpServer();
    return;
  }

  const server = createSpecForgeMcpServer(config);
  await server.connect(new StdioServerTransport());
}

async function startHttpServer(): Promise<void> {
  const expectedToken = process.env.SPECFORGE_MCP_BEARER_TOKEN;
  if (!expectedToken) throw new Error("SPECFORGE_MCP_BEARER_TOKEN is required for HTTP transport.");
  const server = createSpecForgeMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  const httpServer = createServer(async (request, response) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/mcp") {
      response.writeHead(404).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${expectedToken}`) {
      response.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ error: "AUTHENTICATION_REQUIRED" }));
      return;
    }
    try {
      const auth = buildAuthInfo();
      const body = request.method === "POST" ? await readJsonBody(request) : undefined;
      await transport.handleRequest(Object.assign(request, { auth }) as IncomingMessage & { auth: never }, response, body);
    } catch (error) {
      if (!response.headersSent) response.writeHead(400, { "content-type": "application/json" });
      if (!response.writableEnded) response.end(JSON.stringify({ error: error instanceof Error && error.message === "MCP_REQUEST_TOO_LARGE" ? "MCP_REQUEST_TOO_LARGE" : "MCP_PROTOCOL_ERROR" }));
    }
  });
  const port = Number(process.env.SPECFORGE_MCP_HTTP_PORT ?? "3001");
  await new Promise<void>((resolve) => httpServer.listen(port, "0.0.0.0", resolve));
  console.error(`[specforge-mcp] streamable HTTP listening on :${port}/mcp`);
}

function buildAuthInfo() {
  const configuredClaims = process.env.SPECFORGE_MCP_TOKEN_CLAIMS;
  if (configuredClaims) {
    try {
      const parsed = JSON.parse(configuredClaims) as Record<string, unknown>;
      return {
        clientId: String(parsed.clientId ?? "specforge-cli"),
        scopes: Array.isArray(parsed.scopes) ? parsed.scopes as string[] : [],
        tenantId: typeof parsed.tenantId === "string" ? parsed.tenantId : process.env.SPECFORGE_MCP_TENANT_ID,
        authSource: "static-bearer",
        extra: parsed.extra ?? parsed
      };
    } catch {
      throw new Error("SPECFORGE_MCP_TOKEN_CLAIMS must be valid JSON.");
    }
  }
  const scopeIds = (process.env.SPECFORGE_MCP_TOKEN_SCOPE_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  return {
    clientId: "specforge-cli",
    scopes: ["asset:read", "asset:write", "governance:run", "graph:read", "knowledge:consume"],
    tenantId: process.env.SPECFORGE_MCP_TENANT_ID ?? "local-development",
    authSource: "static-bearer",
    extra: {
      actorType: "agent",
      actorId: process.env.SPECFORGE_MCP_ACTOR_ID ?? "specforge-cli",
      grants: scopeIds.flatMap((scopeId) => [{ scopeId, action: "read" }, { scopeId, action: "write" }])
    }
  };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1024 * 1024) throw new Error("MCP_REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

main().catch((error) => {
  console.error("SpecForge MCP server failed to start.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
