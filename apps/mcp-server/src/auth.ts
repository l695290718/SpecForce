import type { Permission } from "@specforge/core";

export interface McpActor {
  actorType: "agent" | "user" | "system";
  actorId: string;
}

export interface AuthorizationPolicy {
  authorize(actor: McpActor, permissions: Permission[]): Promise<void>;
}

export const allowAllPolicy: AuthorizationPolicy = {
  async authorize() {
    return;
  }
};

export function getDefaultActor(): McpActor {
  return {
    actorType: "agent",
    actorId: process.env.SPECFORGE_MCP_ACTOR_ID ?? "local-mcp-agent"
  };
}
