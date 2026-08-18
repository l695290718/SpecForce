import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("managed graph verification lifecycle", () => {
  it("keeps Compose lifecycle operations project-scoped and service-limited", async () => {
    const script = await readFile(resolve(root, "deploy/graph/verify-projection.ps1"), "utf8");
    expect(script).toContain('"specforge-graph-verify-$RunId"');
    expect(script).toContain('(@("up", "-d", "--build") + $managedGraphServices)');
    expect(script).toContain('(@("stop") + $managedGraphServices)');
    expect(script).toContain('(@("rm", "--force", "--stop") + $managedGraphServices)');
    expect(script).not.toContain('docker ps --filter "label=com.docker.compose.service=graph-projector"');
  });

  it("loads host and container database URLs separately", async () => {
    const script = await readFile(resolve(root, "deploy/graph/verify-projection.ps1"), "utf8");
    expect(script).toContain('SPECFORGE_GRAPH_HEALTH_DATABASE_URL');
    expect(script).toContain('Get-DotEnvValue $graphEnvFile "DATABASE_URL"');
    expect(script).toContain("GRAPH_LIVE_CONTAINER_DATABASE_NOT_CANONICAL");
  });

  it("uses Docker-assigned live ports while retaining deterministic config defaults", async () => {
    const compose = await readFile(resolve(root, "deploy/compose.graph-verify.yaml"), "utf8");
    expect(compose).toContain("SPECFORGE_GRAPH_GATEWAY_HOST_PORT:-18088");
    expect(compose).toContain("SPECFORGE_GRAPH_PROJECTOR_HOST_PORT:-18090");
  });
});
