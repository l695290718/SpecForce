import { bootstrapSystemScanGovernance } from "../apps/mcp-server/src/scanner/governance-bootstrap";
import { upsertScopeScanRuntimeProfile } from "../apps/mcp-server/src/scanner/governance-persistence";

async function main(): Promise<void> {
  await bootstrapSystemScanGovernance();
  const architectureScope = {
    applicationServiceId: "com.specforge.designcenter",
    scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter"
  };
  const profile = await upsertScopeScanRuntimeProfile({
    id: "default-repository-scan",
    architectureScope,
    includePaths: [],
    excludePaths: [".git/**", ".specforge/**", "node_modules/**", "dist/**", ".next/**"],
    frameworkHints: [],
    sensitivePaths: [".env", "**/.env.*", "**/secrets/**"],
    budgets: {}
  });
  console.log(JSON.stringify({ status: "BOOTSTRAPPED", governanceKinds: 6, runtimeProfileId: profile.id, architectureScope }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
