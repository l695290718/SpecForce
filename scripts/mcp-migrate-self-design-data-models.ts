import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const applicationServiceId = "com.huawei.celon.desiner";
const scopePath = "pf-huawei/product-celon/subproduct-platform/module-celon-designer/com.huawei.celon.desiner";
const modelIds = [
  "data-specforge-3a-projection-read-model",
  "data-specforge-ai-generation",
  "data-specforge-asset-graph",
  "data-specforge-assets",
  "data-specforge-audit",
  "data-specforge-i18n",
  "data-specforge-mcp-registry",
  "data-specforge-nebula-generation-projection",
  "data-specforge-scan-batch",
  "data-specforge-scan-session",
  "data-specforge-source-observation-v2",
  "data-specforge-web-workspace"
] as const;

type AnyRecord = Record<string, any>;

const explicitOwners: Record<string, Record<string, string>> = {
  "data-specforge-ai-generation": { provider_id: "AIProviderConfig", capability: "AIProviderRequest", prompt: "AIProviderRequest", draft_payload: "GeneratedDraft" },
  "data-specforge-asset-graph": { node_id: "AssetGraphNode", node_type: "AssetGraphNode", edge_label: "AssetGraphEdge", domain_filter: "GraphFilter" },
  "data-specforge-assets": { asset_id: "DesignAsset", asset_type: "DesignAsset", payload: "DesignAsset" },
  "data-specforge-mcp-registry": { name: "McpTool", kind: "McpTool", permissions: "McpTool", read_only: "McpTool" },
  "data-specforge-web-workspace": { draft_key: "AssetDraft", locale: "LocalePreference", filter_payload: "WorkspaceFilter", export_format: "MarkdownExport" },
  "data-specforge-i18n": { message_key: "I18nMessage", locale: "LocalePreference", text: "I18nMessage", fallback_key: "I18nMessage" },
  "data-specforge-audit": { id: "AuditLog", actor_type: "AuditLog", action: "AuditLog", status: "AuditLog", application_service_id: "AuditLog", scope_path: "AuditLog" }
};

function slug(value: string): string { return value.replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-|-$/gu, "").toLowerCase() || "entity"; }
function fieldId(modelId: string, entityId: string, fieldName: string): string { return `field:${modelId}:${entityId}:${slug(fieldName)}`; }
function entityId(modelId: string, entityName: string): string { return `entity:${modelId}:${slug(entityName)}`; }
function chineseFieldLabel(fieldName: string): string { const labels: Record<string, string> = { id: "标识", created_at: "创建时间", updated_at: "更新时间", status: "状态", locale: "语言", name: "名称", payload: "载荷", description: "描述" }; return labels[fieldName] ?? `字段 ${fieldName}`; }
function chineseFieldOverlay(field: AnyRecord): AnyRecord {
  return {
    displayName: chineseFieldLabel(String(field.fieldName)),
    ...(field.meaning ? { meaning: `字段含义：${field.meaning}` } : {}),
    ...(field.constraint ? { constraint: `约束：${field.constraint}` } : {}),
    ...(field.classification ? { classification: `分类：${field.classification}` } : {}),
    ...(field.example ? { example: `示例：${field.example}` } : {})
  };
}

function normalizeEntityDefinitions(asset: AnyRecord): AnyRecord[] {
  const names = Array.isArray(asset.entities) ? asset.entities.map(String) : [];
  const existing = Array.isArray(asset.entityDefinitions) ? asset.entityDefinitions : [];
  return names.map((name: string, ordinal: number) => {
    const current = existing.find((item: AnyRecord) => item.name === name || item.id === name);
    return { ...(current ?? {}), id: current?.id ?? entityId(String(asset.id), name), name, ordinal };
  });
}

function ownerForField(asset: AnyRecord, field: AnyRecord, definitions: AnyRecord[]): string {
  const ownerName = explicitOwners[String(asset.id)]?.[String(field.fieldName)];
  if (ownerName) return definitions.find((entity) => entity.name === ownerName)?.id ?? entityId(String(asset.id), ownerName);
  if (field.entityId && definitions.some((entity) => entity.id === field.entityId)) return String(field.entityId);
  if (definitions.length === 1) return String(definitions[0]!.id);
  throw new Error(`FIELD_OWNERSHIP_AMBIGUOUS:${asset.id}:${field.fieldName}`);
}

function buildLocalizedContent(asset: AnyRecord, definitions: AnyRecord[], fields: AnyRecord[]): AnyRecord {
  const current = asset.localizedContent ?? {};
  const entities = Object.fromEntries(definitions.map((entity) => [entity.id, { displayName: entity.name }]));
  const localizedFields = Object.fromEntries(fields.map((field) => [field.id, chineseFieldOverlay(field)]));
  return {
    ...current,
    en: { ...(current.en ?? {}), name: asset.name, description: asset.description, entities, fields: Object.fromEntries(fields.map((field) => [field.id, { displayName: field.displayName }])) },
    zh: { ...(current.zh ?? {}), name: current.zh?.name ?? `${asset.name} 数据模型`, description: current.zh?.description ?? `${asset.name} 的实体、字段和关系事实。`, relationships: current.zh?.relationships ?? asset.relationships ?? [], constraints: current.zh?.constraints ?? asset.constraints ?? [], lifecycle: current.zh?.lifecycle ?? asset.lifecycle ?? "生命周期由设计事实维护。", lineage: current.zh?.lineage ?? asset.lineage ?? "由 MCP 设计事实维护。", entities, fields: localizedFields }
  };
}

function upgradeAsset(asset: AnyRecord): AnyRecord {
  const definitions = normalizeEntityDefinitions(asset);
  const originalFields = Array.isArray(asset.fields) ? asset.fields : [];
  const nextFields: AnyRecord[] = [];
  const ordinals = new Map<string, number>();
  for (const original of originalFields) {
    const owner = ownerForField(asset, original, definitions);
    const nextOrdinal = ordinals.get(owner) ?? 0;
    ordinals.set(owner, nextOrdinal + 1);
    nextFields.push({ ...original, id: original.id ?? fieldId(String(asset.id), owner, String(original.fieldName)), entityId: owner, ordinal: original.ordinal ?? nextOrdinal });
  }
  for (const definition of definitions) {
    if (nextFields.some((field) => field.entityId === definition.id && field.fieldName === "id")) continue;
    const ordinal = ordinals.get(definition.id) ?? 0;
    nextFields.push({ id: fieldId(String(asset.id), String(definition.id), "id"), fieldName: "id", displayName: "ID", dataType: "string", meaning: "Stable identity of the entity.", nullable: false, primaryKey: true, unique: true, generated: false, owner: "SpecForge Architecture Team", entityId: definition.id, ordinal });
    ordinals.set(definition.id, ordinal + 1);
  }
  return { ...asset, architectureScope: { applicationServiceId, scopePath }, schemaVersion: 2, entityDefinitions: definitions, fields: nextFields, dataRelations: Array.isArray(asset.dataRelations) ? asset.dataRelations : [], localizedContent: buildLocalizedContent(asset, definitions, nextFields) };
}

async function callTool(client: Client, name: string, arguments_: AnyRecord): Promise<AnyRecord> {
  const result = await client.callTool({ name, arguments: arguments_ });
  if (result.isError) throw new Error(result.content?.map((item) => "text" in item ? item.text : "").join("") || `${name} failed`);
  const text = result.content?.map((item) => "text" in item ? item.text : "").filter(Boolean).join("");
  return text ? JSON.parse(text) as AnyRecord : {};
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({ command: process.execPath, args: ["apps/mcp-server/node_modules/tsx/dist/cli.mjs", "apps/mcp-server/src/index.ts"], cwd: process.cwd(), env: { ...process.env, CI: process.env.CI ?? "true", SPECFORGE_MCP_SEED: "1", SPECFORGE_MCP_SEED_SCOPE: applicationServiceId } });
  const client = new Client({ name: "specforge-er-field-migration", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const assets = [] as AnyRecord[];
    for (const assetId of modelIds) {
      const result = await callTool(client, "get_asset_detail", { assetType: "dataModel", assetId, applicationServiceId, format: "json" });
      assets.push(upgradeAsset(result.asset ?? result.canonicalSource));
    }
    const receipts: AnyRecord[] = [];
    for (let index = 0; index < assets.length; index += 2) {
      const batch = assets.slice(index, index + 2);
      receipts.push(await callTool(client, "apply_data_model_change_set", { architectureScope: { applicationServiceId, scopePath }, models: batch, idempotencyKey: `er-field-ownership-migration-20260821-v2-${index / 2 + 1}`, correlationId: `er-field-ownership-correction-20260821-v2-${index / 2 + 1}` }));
    }
    console.log(JSON.stringify({ receipts, models: assets.map((asset) => ({ id: asset.id, entities: asset.entityDefinitions.length, fields: asset.fields.length })) }, null, 2));
  } finally {
    await client.close();
    await transport.close();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
