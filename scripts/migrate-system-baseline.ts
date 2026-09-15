import { createRequire } from "node:module";
import { resolve } from "node:path";
import { upgradeLegacyDataModel } from "@specforge/core";

type Scope = { applicationServiceId: string; scopePath: string };
type ToolResult = { content?: Array<{ text?: string }>; isError?: boolean };
type Client = { callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<ToolResult>; connect(transport: unknown): Promise<void>; close(): Promise<void> };

const source: Scope = { applicationServiceId: "com.huawei.celon.desiner", scopePath: "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner" };
const target: Scope = { applicationServiceId: "com.specforge.designcenter", scopePath: "pf-specforge/product-design-center/governance/design-facts/com.specforge.designcenter" };
const targetSession = process.env.SPECFORGE_TARGET_MIGRATION_SESSION;
const batchKey = process.env.SPECFORGE_BASELINE_MIGRATION_BATCH ?? "system-baseline-2026-09-15";

const legacyDataModelOwnership: Record<string, Record<string, string>> = {
  "data-specforge-ai-generation": {
    provider_id: "AIProviderConfig",
    capability: "AIProviderRequest",
    prompt: "AIProviderRequest",
    draft_payload: "GeneratedDraft"
  }
};

function upgradeWithExplicitOwnership(model: any) {
  const ownership = legacyDataModelOwnership[model.id];
  if (!ownership) throw new Error(`DATA_MODEL_OWNERSHIP_RULE_MISSING:${model.id}`);
  const entityIds = new Set(model.entities ?? []);
  const fields = model.fields.map((field: any) => {
    const entityName = ownership[field.fieldName];
    if (!entityName || !entityIds.has(entityName)) throw new Error(`DATA_MODEL_OWNERSHIP_INVALID:${model.id}:${field.fieldName}`);
    return { ...field, entityId: `entity:${model.id}:${entityName}` };
  });
  return upgradeLegacyDataModel({ ...model, fields });
}

function parse(result: ToolResult, name: string): any {
  const text = result.content?.map((item) => item.text ?? "").join("") ?? "";
  if (result.isError) throw new Error(`${name}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function connect(scope: Scope): Promise<{ client: Client; close(): Promise<void> }> {
  const root = process.cwd();
  const requireFromMcp = createRequire(resolve(root, "apps/mcp-server/package.json"));
  const { Client: McpClient } = requireFromMcp("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = requireFromMcp("@modelcontextprotocol/sdk/client/stdio.js");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(root, "apps/mcp-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "apps/mcp-server/src/index.ts")],
    cwd: root,
    env: { ...process.env, SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: scope.applicationServiceId }
  });
  const client = new McpClient({ name: "system-baseline-migration", version: "0.1.0" }, { capabilities: {} }) as Client;
  await client.connect(transport);
  return { client, close: async () => { await client.close(); await transport.close(); } };
}

async function call(client: Client, name: string, arguments_: Record<string, unknown>) { return parse(await client.callTool({ name, arguments: arguments_ }), name); }

async function snapshot(client: Client, scope: Scope) {
  const request = { architectureScope: scope, knowledgeProfile: "DESIGN_CATALOG_CURATION", selectors: [], purpose: "Complete governed system baseline migration", locale: "en", pageSize: 200 };
  const readiness = await call(client, "evaluate_system_knowledge_readiness", request);
  if (readiness.accessDecision !== "ALLOW" || !readiness.receiptId) throw new Error(`MIGRATION_READINESS_DENIED:${(readiness.reasonCodes ?? []).join(",")}`);
  const result = await call(client, "read_system_knowledge_snapshot", { ...request, receiptId: readiness.receiptId });
  if (result.accessDecision !== "ALLOW") throw new Error(`MIGRATION_SNAPSHOT_DENIED:${(result.reasonCodes ?? []).join(",")}`);
  return result;
}

async function migrate() {
  if (!targetSession) throw new Error("SPECFORGE_TARGET_MIGRATION_SESSION is required");
  const sourceConnection = await connect(source);
  const targetConnection = await connect(target);
  try {
    const [sourceSnapshot, targetSnapshot] = await Promise.all([snapshot(sourceConnection.client, source), snapshot(targetConnection.client, target)]);
    const featureAssets = sourceSnapshot.assets.filter((asset: any) => asset.type === "serviceFeature" || asset.type === "functionalFeature");
    const dataModels = sourceSnapshot.assets.filter((asset: any) => asset.type === "dataModel");
    const standardAssets = sourceSnapshot.assets.filter((asset: any) => asset.type !== "serviceFeature" && asset.type !== "functionalFeature" && asset.type !== "dataModel");
    const sourceAssetIds = new Set(sourceSnapshot.assets.map((asset: any) => asset.id));
    const sourceProposalIds = new Set(sourceSnapshot.proposals.map((proposal: any) => proposal.id));
    const sourceContextPackIds = new Set(sourceSnapshot.contextPacks.map((pack: any) => pack.id));
    const linkKey = (link: any) => [link.sourceType, link.sourceId, link.relationType, link.targetType, link.targetId].join("|");
    const sourceLinkKeys = new Set(sourceSnapshot.assetLinks.map(linkKey));
    const stale = {
      assetIds: targetSnapshot.assets.filter((asset: any) => !sourceAssetIds.has(asset.id)).map((asset: any) => asset.id),
      proposalIds: targetSnapshot.proposals.filter((proposal: any) => !sourceProposalIds.has(proposal.id)).map((proposal: any) => proposal.id),
      contextPackIds: targetSnapshot.contextPacks.filter((pack: any) => !sourceContextPackIds.has(pack.id)).map((pack: any) => pack.id),
      links: targetSnapshot.assetLinks.filter((link: any) => !sourceLinkKeys.has(linkKey(link)))
    };
    console.log(JSON.stringify({ phase: "dry-run", batchKey, sourceDigest: sourceSnapshot.manifestDigest, source: { assets: sourceSnapshot.assets.length, proposals: sourceSnapshot.proposals.length, contextPacks: sourceSnapshot.contextPacks.length, links: sourceSnapshot.assetLinks.length }, target: { assets: targetSnapshot.assets.length, proposals: targetSnapshot.proposals.length, contextPacks: targetSnapshot.contextPacks.length, links: targetSnapshot.assetLinks.length }, stale: { assets: stale.assetIds.length, proposals: stale.proposalIds.length, contextPacks: stale.contextPackIds.length, links: stale.links.length } }, null, 2));
    if (stale.links.length) await call(targetConnection.client, "delete_seed_asset_links", { architectureScope: target });
    if (stale.assetIds.length || stale.proposalIds.length || stale.contextPackIds.length) await call(targetConnection.client, "delete_seed_design_data", { architectureScope: target, assetIds: stale.assetIds, proposalIds: stale.proposalIds, contextPackIds: stale.contextPackIds });
    for (const asset of standardAssets) await call(targetConnection.client, "upsert_design_asset", { assetType: asset.type, asset: asset.payload, architectureScope: target });
    for (let index = 0; index < dataModels.length; index += 1) {
      const sourceModel = dataModels[index];
      let prepared: any;
      try {
        prepared = await call(sourceConnection.client, "upgrade_data_model", {
          applicationServiceId: source.applicationServiceId,
          architectureScope: source,
          assetId: sourceModel.id
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!legacyDataModelOwnership[sourceModel.id]) throw new Error(`DATA_MODEL_UPGRADE_FAILED:${sourceModel.id}:${message}`);
        prepared = { dataModel: upgradeWithExplicitOwnership(sourceModel.payload) };
      }
      await call(targetConnection.client, "apply_data_model_change_set", {
        architectureScope: target,
        models: [prepared.dataModel],
        idempotencyKey: `${batchKey}:data-model:${sourceModel.id}`,
        correlationId: `${batchKey}:data-model:${index}`
      });
    }
    if (featureAssets.length) await call(targetConnection.client, "apply_feature_change_set", { architectureScope: target, designChangeSessionId: targetSession, correlationId: `${batchKey}:features`, idempotencyKey: `${batchKey}:features`, assets: featureAssets.map((asset: any) => ({ assetType: asset.type, asset: { ...asset.payload, architectureScope: target } })), relationships: [] });
    for (const proposal of sourceSnapshot.proposals) await call(targetConnection.client, "upsert_proposal", { proposal: proposal.payload, architectureScope: target });
    for (const contextPack of sourceSnapshot.contextPacks) await call(targetConnection.client, "upsert_context_pack", { contextPack: contextPack.payload, architectureScope: target });
    for (const link of sourceSnapshot.assetLinks) await call(targetConnection.client, "link_assets", { sourceType: link.sourceType, sourceId: link.sourceId, targetType: link.targetType, targetId: link.targetId, relationType: link.relationType, ...(link.description ? { description: link.description } : {}), architectureScope: target });
    const reconciled = await snapshot(targetConnection.client, target);
    const expected = JSON.stringify({ assets: sourceSnapshot.assets.map((item: any) => [item.type, item.id]).sort(), proposals: sourceSnapshot.proposals.map((item: any) => item.id).sort(), contextPacks: sourceSnapshot.contextPacks.map((item: any) => item.id).sort(), links: sourceSnapshot.assetLinks.map((item: any) => [item.sourceType, item.sourceId, item.relationType, item.targetType, item.targetId]).sort() });
    const actual = JSON.stringify({ assets: reconciled.assets.map((item: any) => [item.type, item.id]).sort(), proposals: reconciled.proposals.map((item: any) => item.id).sort(), contextPacks: reconciled.contextPacks.map((item: any) => item.id).sort(), links: reconciled.assetLinks.map((item: any) => [item.sourceType, item.sourceId, item.relationType, item.targetType, item.targetId]).sort() });
    if (expected !== actual) throw new Error("MIGRATION_RECONCILIATION_FAILED");
    console.log(JSON.stringify({ phase: "converged", batchKey, sourceDigest: sourceSnapshot.manifestDigest, targetDigest: reconciled.manifestDigest }, null, 2));
  } finally { await sourceConnection.close(); await targetConnection.close(); }
}

void migrate().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
