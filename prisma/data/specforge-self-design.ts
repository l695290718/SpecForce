import type {
  Adr,
  ApiContract,
  BusinessRule,
  ContextPack,
  DataModel,
  DomainModel,
  EventContract,
  IntegrationContract,
  ObservabilityDesign,
  Proposal,
  QualityRequirement,
  StateMachine
} from "@specforge/core";

const now = "2026-07-10T00:00:00.000Z";

const selfDesignRefs = [
  { type: "domain", id: "domain-specforge-platform", label: "SpecForge Platform Domain" },
  { type: "dataModel", id: "data-specforge-assets", label: "SpecForge Design Asset Data Model" },
  { type: "dataModel", id: "data-specforge-audit", label: "SpecForge AuditLog Data Model" },
  { type: "dataModel", id: "data-specforge-mcp-registry", label: "SpecForge MCP Registry Data Model" },
  { type: "dataModel", id: "data-specforge-ai-generation", label: "SpecForge AI Generation Data Model" },
  { type: "dataModel", id: "data-specforge-web-workspace", label: "SpecForge Web Workspace Data Model" },
  { type: "dataModel", id: "data-specforge-asset-graph", label: "SpecForge Asset Graph Data Model" },
  { type: "dataModel", id: "data-specforge-i18n", label: "SpecForge Internationalization Data Model" },
  { type: "api", id: "api-specforge-web-console", label: "SpecForge Web Console API Contract" },
  { type: "api", id: "api-specforge-mcp-tools", label: "SpecForge MCP Tool Contract" },
  { type: "api", id: "api-specforge-asset-upsert", label: "SpecForge Asset Upsert MCP Contract" },
  { type: "api", id: "api-specforge-proposal-upsert", label: "SpecForge Proposal Upsert MCP Contract" },
  { type: "api", id: "api-specforge-context-pack-upsert", label: "SpecForge Context Pack Upsert MCP Contract" },
  { type: "api", id: "api-specforge-asset-link", label: "SpecForge Asset Link MCP Contract" },
  { type: "api", id: "api-specforge-graph-query", label: "SpecForge Asset Graph Query Contract" },
  { type: "api", id: "api-specforge-ai-generation", label: "SpecForge AI Generation Contract" },
  { type: "event", id: "event-specforge-context-pack-generated", label: "ContextPackGenerated Event Contract" },
  { type: "event", id: "event-specforge-mcp-tool-called", label: "McpToolCalled Event Contract" },
  { type: "event", id: "event-specforge-design-asset-upserted", label: "DesignAssetUpserted Event Contract" },
  { type: "event", id: "event-specforge-asset-link-created", label: "AssetLinkCreated Event Contract" },
  { type: "event", id: "event-specforge-governance-check-completed", label: "GovernanceCheckCompleted Event Contract" },
  { type: "businessRule", id: "rule-specforge-core-service-reuse", label: "Web and MCP must reuse Core Service" },
  { type: "businessRule", id: "rule-specforge-mcp-write-audit", label: "MCP write tools must be audited" },
  { type: "businessRule", id: "rule-specforge-seed-through-mcp", label: "Seed writes must call MCP tools" },
  { type: "businessRule", id: "rule-specforge-relationships-required", label: "Design assets require explicit relationships" },
  { type: "stateMachine", id: "sm-specforge-proposal-lifecycle", label: "SpecForge Proposal Lifecycle" },
  { type: "stateMachine", id: "sm-specforge-context-pack-generation", label: "SpecForge Context Pack Generation Lifecycle" },
  { type: "integration", id: "integration-specforge-mcp-agent", label: "AI Agent to SpecForge MCP Integration" },
  { type: "quality", id: "quality-specforge-mcp-smoke", label: "SpecForge MCP Smoke Quality Requirement" },
  { type: "quality", id: "quality-specforge-impact-ready", label: "SpecForge Impact Analysis Readiness Requirement" },
  { type: "observability", id: "obs-specforge-mcp-audit", label: "SpecForge MCP Audit Observability Design" },
  { type: "adr", id: "adr-mcp-first-architecture", label: "ADR: MCP-first architecture" }
] as const;

export const selfDesignDomain: DomainModel = {
  id: "domain-specforge-platform",
  name: "SpecForge Platform Domain",
  code: "SPECFORGE_PLATFORM",
  description: "The bounded context that manages SpecForge Design Center itself as an MCP-native design system.",
  boundedContext: "SpecForge Design Center",
  owner: "SpecForge Core Team",
  entities: ["DesignAsset", "Proposal", "ContextPack", "GovernanceCheck", "AuditLog", "McpTool", "McpResource", "McpPrompt"],
  valueObjects: ["AssetRef", "Permission", "GovernanceSeverity", "AgentTarget", "MarkdownDocument"],
  domainServices: ["CoreDesignService", "ContextPackGenerator", "GovernanceRunner", "McpToolRegistry", "AuditLogger"],
  businessCapabilities: ["MCP-first agent interface", "Design asset management", "Governance checks", "Agent context generation", "Self-documenting design center"],
  glossaryTerms: ["MCP-native", "Core Service", "Agent Context Pack", "Do-not Rules", "AuditLog"],
  createdAt: now,
  updatedAt: now
};

export const selfDesignDataModels: DataModel[] = [
  {
    id: "data-specforge-assets",
    name: "SpecForge Design Asset Data Model",
    code: "SPECFORGE_ASSET_DATA",
    description: "Stores structured design assets such as domains, data models, APIs, events, rules, state machines, ADRs, proposals, and context packs.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["design_assets", "proposals", "context_packs", "governance_check_snapshots"],
    entities: ["DesignAsset", "Proposal", "ContextPack", "GovernanceCheckSnapshot"],
    fields: [
      { fieldName: "asset_id", displayName: "Asset ID", dataType: "string", meaning: "Stable identifier used by Web, MCP resources, and MCP tools.", nullable: false, constraint: "primary key", sensitiveLevel: "none", classification: "business-id", example: "api-specforge-mcp-tools", owner: "SpecForge Core Team" },
      { fieldName: "asset_type", displayName: "Asset Type", dataType: "string", meaning: "Discriminator for asset rendering, governance, routing, and MCP resource exposure.", nullable: false, constraint: "enum AssetType", sensitiveLevel: "none", classification: "metadata", example: "api", owner: "SpecForge Core Team" },
      { fieldName: "payload", displayName: "Payload", dataType: "json", meaning: "Structured asset body used by Core Service renderers and MCP resources.", nullable: false, constraint: "valid JSON object", sensitiveLevel: "internal", classification: "design-knowledge", example: "{\"method\":\"POST\"}", owner: "SpecForge Core Team" }
    ],
    relationships: ["Proposal n..m DesignAsset through impactedAssets", "ContextPack n..m DesignAsset through includedAssets"],
    constraints: ["asset_id is stable once published", "payload must be renderable as agent-readable Markdown"],
    dataClassification: "internal",
    lifecycle: "Design assets are versioned by git for the MVP and persisted by Prisma later.",
    lineage: "Seed data, Web Console edits, and MCP write tools",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "data-specforge-audit",
    name: "SpecForge AuditLog Data Model",
    code: "SPECFORGE_AUDIT_DATA",
    description: "Captures MCP tool calls and future Web/API operations for traceability.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["audit_logs"],
    entities: ["AuditLog"],
    fields: [
      { fieldName: "id", displayName: "Audit ID", dataType: "string", meaning: "Unique audit log identifier.", nullable: false, constraint: "primary key", sensitiveLevel: "none", classification: "technical-id", example: "audit-1", owner: "SpecForge Core Team" },
      { fieldName: "actor_type", displayName: "Actor Type", dataType: "string", meaning: "Origin category for the operation.", nullable: false, constraint: "enum user|agent|system", sensitiveLevel: "none", classification: "audit", example: "agent", owner: "SpecForge Core Team" },
      { fieldName: "action", displayName: "Action", dataType: "string", meaning: "Tool or operation name that was executed.", nullable: false, constraint: "non-empty", sensitiveLevel: "internal", classification: "audit", example: "generate_context_pack", owner: "SpecForge Core Team" },
      { fieldName: "status", displayName: "Status", dataType: "string", meaning: "Whether the operation succeeded or failed.", nullable: false, constraint: "enum success|failed", sensitiveLevel: "none", classification: "audit", example: "success", owner: "SpecForge Core Team" }
    ],
    relationships: ["AuditLog references targetType/targetId instead of hard database foreign keys"],
    constraints: ["All MCP tool calls must produce an audit log", "Database errors must not be returned raw to MCP clients"],
    dataClassification: "internal",
    lifecycle: "Retain MVP audit entries in memory; persist through Prisma in the next backend slice.",
    lineage: "MCP tool wrapper and future Web/API middleware",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "data-specforge-mcp-registry",
    name: "SpecForge MCP Registry Data Model",
    code: "SPECFORGE_MCP_REGISTRY_DATA",
    description: "Describes the protocol-native tools, resources, resource templates, and prompts exposed to AI coding agents.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["mcp_tools", "mcp_resources", "mcp_resource_templates", "mcp_prompts"],
    entities: ["McpTool", "McpResource", "McpResourceTemplate", "McpPrompt"],
    fields: [
      { fieldName: "name", displayName: "Protocol Name", dataType: "string", meaning: "Stable MCP-facing identifier for a tool, resource, template, or prompt.", nullable: false, constraint: "unique per registry kind", sensitiveLevel: "none", classification: "protocol-contract", example: "upsert_design_asset", owner: "SpecForge Core Team" },
      { fieldName: "kind", displayName: "Registry Kind", dataType: "string", meaning: "Distinguishes tools, resources, resource templates, and prompts.", nullable: false, constraint: "enum tool|resource|resource_template|prompt", sensitiveLevel: "none", classification: "metadata", example: "tool", owner: "SpecForge Core Team" },
      { fieldName: "permissions", displayName: "Required Permissions", dataType: "string[]", meaning: "Permissions required before the MCP server executes the operation.", nullable: false, constraint: "must map to Permission union", sensitiveLevel: "internal", classification: "access-control", example: "[\"asset:write\"]", owner: "SpecForge Core Team" },
      { fieldName: "read_only", displayName: "Read-only Hint", dataType: "boolean", meaning: "MCP annotation that tells agents whether the operation mutates state.", nullable: false, constraint: "write tools must be false", sensitiveLevel: "none", classification: "protocol-contract", example: "false", owner: "SpecForge Core Team" }
    ],
    relationships: ["McpTool writes AuditLog", "McpResource reads DesignAsset", "McpPrompt references workflow tools"],
    constraints: ["Tool names are stable within an MVP release", "Write tools must be audited", "Delete tools are not exposed by default"],
    dataClassification: "internal",
    lifecycle: "Registry entries are code-defined in the MVP and persisted as design assets for agent discovery.",
    lineage: "apps/mcp-server/src/tools.ts, resources.ts, prompts.ts",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "data-specforge-ai-generation",
    name: "SpecForge AI Generation Data Model",
    code: "SPECFORGE_AI_GENERATION_DATA",
    description: "Captures mock and future real AI generation requests for proposals, ADRs, business rules, test suggestions, and agent context packs.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["ai_generation_requests", "ai_generation_responses", "ai_provider_configs"],
    entities: ["AIProviderRequest", "AIProviderResponse", "AIProviderConfig", "GeneratedDraft"],
    fields: [
      { fieldName: "provider_id", displayName: "Provider ID", dataType: "string", meaning: "Selected AI provider implementation.", nullable: false, constraint: "registered provider", sensitiveLevel: "none", classification: "configuration", example: "mock", owner: "SpecForge Core Team" },
      { fieldName: "capability", displayName: "Generation Capability", dataType: "string", meaning: "Draft type requested from the provider.", nullable: false, constraint: "enum proposal|adr|businessRule|testSuggestions|agentContextPack", sensitiveLevel: "none", classification: "business-operation", example: "proposal", owner: "SpecForge Core Team" },
      { fieldName: "prompt", displayName: "Prompt", dataType: "string", meaning: "User or agent instruction used to generate the draft.", nullable: false, constraint: "non-empty", sensitiveLevel: "internal", classification: "agent-input", example: "Create refund workflow", owner: "SpecForge Core Team" },
      { fieldName: "draft_payload", displayName: "Draft Payload", dataType: "json", meaning: "Structured generated result before it is accepted as a design asset.", nullable: false, constraint: "valid JSON by capability", sensitiveLevel: "internal", classification: "generated-design", example: "{\"title\":\"Proposal: ...\"}", owner: "SpecForge Core Team" }
    ],
    relationships: ["GeneratedDraft can become Proposal, ADR, BusinessRule, or ContextPack", "AIProviderConfig selects provider behavior"],
    constraints: ["Mock provider must be deterministic", "OpenAI provider interface remains unconfigured until secrets are supplied", "Generated drafts are not authoritative until accepted"],
    dataClassification: "internal",
    lifecycle: "Requests are transient in MVP and can be persisted when provider audit history is added.",
    lineage: "packages/core/src/ai",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "data-specforge-web-workspace",
    name: "SpecForge Web Workspace Data Model",
    code: "SPECFORGE_WEB_WORKSPACE_DATA",
    description: "Models browser-side editing state, draft assets, locale preference, filters, and export actions in the Web Console.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["local_storage_drafts", "workspace_filters", "export_requests"],
    entities: ["AssetDraft", "WorkspaceFilter", "LocalePreference", "MarkdownExport"],
    fields: [
      { fieldName: "draft_key", displayName: "Draft Key", dataType: "string", meaning: "Local storage key for unsaved asset drafts.", nullable: false, constraint: "specforge-draft:{assetType}:{id}", sensitiveLevel: "internal", classification: "ui-state", example: "specforge-draft:dataModel:data-new", owner: "SpecForge Web Team" },
      { fieldName: "locale", displayName: "Locale", dataType: "string", meaning: "Current UI language preference.", nullable: false, constraint: "enum zh|en", sensitiveLevel: "none", classification: "preference", example: "zh", owner: "SpecForge Web Team" },
      { fieldName: "filter_payload", displayName: "Filter Payload", dataType: "json", meaning: "Current query, domain, type, or graph filter state.", nullable: true, constraint: "valid JSON", sensitiveLevel: "none", classification: "ui-state", example: "{\"assetType\":\"api\"}", owner: "SpecForge Web Team" },
      { fieldName: "export_format", displayName: "Export Format", dataType: "string", meaning: "Format requested by the user for downloadable artifacts.", nullable: true, constraint: "enum markdown|json", sensitiveLevel: "none", classification: "user-action", example: "markdown", owner: "SpecForge Web Team" }
    ],
    relationships: ["AssetDraft can become DesignAsset through MCP write tools", "LocalePreference reads I18nMessage", "MarkdownExport reads ContextPack"],
    constraints: ["Drafts do not become source of truth until persisted", "Locale fallback must resolve missing strings", "Exports must not mutate design assets"],
    dataClassification: "internal",
    lifecycle: "Browser state is ephemeral; accepted assets are persisted through MCP write tools.",
    lineage: "apps/web components and app routes",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "data-specforge-asset-graph",
    name: "SpecForge Asset Graph Data Model",
    code: "SPECFORGE_ASSET_GRAPH_DATA",
    description: "Represents nodes and edges used to filter and visualize relationships between domains, assets, proposals, and context packs.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["asset_graph_nodes", "asset_graph_edges", "asset_links"],
    entities: ["AssetGraphNode", "AssetGraphEdge", "AssetLink", "GraphFilter"],
    fields: [
      { fieldName: "node_id", displayName: "Node ID", dataType: "string", meaning: "Stable id of a graph node, usually the asset id.", nullable: false, constraint: "unique", sensitiveLevel: "none", classification: "business-id", example: "api-specforge-mcp-tools", owner: "SpecForge Core Team" },
      { fieldName: "node_type", displayName: "Node Type", dataType: "string", meaning: "Asset type rendered and filtered in the graph.", nullable: false, constraint: "AssetType", sensitiveLevel: "none", classification: "metadata", example: "api", owner: "SpecForge Core Team" },
      { fieldName: "edge_label", displayName: "Edge Label", dataType: "string", meaning: "Human-readable relation such as owns, impacts, emits, or includes.", nullable: false, constraint: "non-empty", sensitiveLevel: "none", classification: "relationship", example: "impacts", owner: "SpecForge Core Team" },
      { fieldName: "domain_filter", displayName: "Domain Filter", dataType: "string", meaning: "Optional domain used to constrain the rendered graph.", nullable: true, constraint: "domain id", sensitiveLevel: "none", classification: "query", example: "domain-specforge-platform", owner: "SpecForge Web Team" }
    ],
    relationships: ["Proposal impacts AssetGraphNode", "ContextPack includes AssetGraphNode", "AssetLink creates AssetGraphEdge"],
    constraints: ["Edges must reference existing nodes when persisted", "Graph filters must not hide selected node details", "Graph rendering must support type and domain filters together"],
    dataClassification: "internal",
    lifecycle: "Graph is derived from assets and links at read time in the MVP.",
    lineage: "packages/core/src/graph and apps/web/app/graph",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "data-specforge-i18n",
    name: "SpecForge Internationalization Data Model",
    code: "SPECFORGE_I18N_DATA",
    description: "Describes bilingual UI message keys and fallback behavior for Chinese and English.",
    modelType: "logical",
    domainId: "domain-specforge-platform",
    tables: ["i18n_messages", "locale_preferences"],
    entities: ["I18nMessage", "LocaleCatalog", "LocalePreference"],
    fields: [
      { fieldName: "message_key", displayName: "Message Key", dataType: "string", meaning: "Stable code-facing key used by UI components.", nullable: false, constraint: "unique per locale", sensitiveLevel: "none", classification: "ui-contract", example: "nav.dataModels", owner: "SpecForge Web Team" },
      { fieldName: "locale", displayName: "Locale", dataType: "string", meaning: "Language and region bucket for a message.", nullable: false, constraint: "enum zh|en", sensitiveLevel: "none", classification: "localization", example: "zh", owner: "SpecForge Web Team" },
      { fieldName: "text", displayName: "Translated Text", dataType: "string", meaning: "Rendered UI copy.", nullable: false, constraint: "non-empty", sensitiveLevel: "none", classification: "ui-copy", example: "数据模型", owner: "SpecForge Web Team" },
      { fieldName: "fallback_key", displayName: "Fallback Key", dataType: "string", meaning: "Optional fallback message when a translation is missing.", nullable: true, constraint: "existing message key", sensitiveLevel: "none", classification: "localization", example: "asset.dataModels", owner: "SpecForge Web Team" }
    ],
    relationships: ["LocalePreference selects LocaleCatalog", "UI components read I18nMessage by key"],
    constraints: ["Chinese and English catalogs must contain the same keys", "Missing keys should fall back visibly during development", "Navigation labels must be localized"],
    dataClassification: "public",
    lifecycle: "Catalogs live in code for the MVP and may move to database-managed content later.",
    lineage: "apps/web/lib/i18n.ts",
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignApis: ApiContract[] = [
  {
    id: "api-specforge-web-console",
    name: "SpecForge Web Console API Contract",
    method: "POST",
    path: "/api/context-packs/generate",
    description: "Allows the Web Console to request Context Pack generation through the shared Core Service.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge Web",
    consumers: ["SpecForge Web Console"],
    requestSchema: { proposalId: "string", targetAgent: "codex|claude-code|cursor|copilot|generic" },
    responseSchema: { id: "string", generatedMarkdown: "string", includedAssets: "AssetRef[]" },
    errorCodes: ["PROPOSAL_NOT_FOUND", "CONTEXT_PACK_GENERATION_FAILED"],
    authType: "local-mvp-session",
    idempotency: "Repeated generation for the same proposal is deterministic for seed data.",
    rateLimit: "Local MVP only",
    timeout: "5s",
    compatibilityPolicy: "Additive response fields only.",
    openapiSpec: "openapi: 3.1.0\npaths:\n  /api/context-packs/generate:\n    post:\n      operationId: generateContextPack",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-mcp-tools",
    name: "SpecForge MCP Tool Contract",
    method: "POST",
    path: "mcp://tools/call",
    description: "Defines the MCP tool-call boundary for agents interacting with SpecForge design assets, persisted writes, and workflows.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["Codex", "Claude Code", "Cursor", "Copilot", "Generic MCP Client"],
    requestSchema: { name: "string", arguments: "object" },
    responseSchema: { content: "Array<{type:'text',text:string}>", isError: "boolean?" },
    errorCodes: ["TOOL_VALIDATION_FAILED", "ASSET_NOT_FOUND", "GOVERNANCE_CHECK_FAILED", "PERSISTENCE_WRITE_FAILED"],
    authType: "allowAllPolicy MVP; future OAuth/RBAC",
    idempotency: "Read tools are idempotent; upsert write tools are audited, validated, and safe to retry for the same id.",
    rateLimit: "Reserved for Streamable HTTP deployment",
    timeout: "10s per tool call",
    compatibilityPolicy: "Tool names and required arguments are stable within an MVP release. New write tools are additive.",
    openapiSpec: "MCP protocol schema; stdio transport in MVP",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-asset-upsert",
    name: "SpecForge Asset Upsert MCP Contract",
    method: "POST",
    path: "mcp://tools/upsert_design_asset",
    description: "Persists a domain, data model, API, event, rule, state machine, integration, quality requirement, observability design, or ADR through the MCP write boundary.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["SpecForge Seed Client", "AI Coding Agents"],
    requestSchema: { assetType: "AssetType", asset: "DesignAsset payload" },
    responseSchema: { id: "string", type: "AssetType", status: "upserted" },
    errorCodes: ["TOOL_VALIDATION_FAILED", "PERSISTENCE_WRITE_FAILED"],
    authType: "allowAllPolicy MVP; future RBAC asset:write",
    idempotency: "Idempotent by asset.id.",
    rateLimit: "Local MVP only",
    timeout: "10s",
    compatibilityPolicy: "Required envelope fields assetType and asset remain stable.",
    openapiSpec: "MCP tool schema: upsert_design_asset",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-proposal-upsert",
    name: "SpecForge Proposal Upsert MCP Contract",
    method: "POST",
    path: "mcp://tools/upsert_proposal",
    description: "Persists an MCP-native Proposal payload and keeps it queryable for Web, MCP resources, and future impact analysis.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["SpecForge Seed Client", "AI Coding Agents"],
    requestSchema: { proposal: "Proposal payload" },
    responseSchema: { id: "string", status: "upserted" },
    errorCodes: ["TOOL_VALIDATION_FAILED", "PERSISTENCE_WRITE_FAILED"],
    authType: "allowAllPolicy MVP; future RBAC proposal:write",
    idempotency: "Idempotent by proposal.id.",
    rateLimit: "Local MVP only",
    timeout: "10s",
    compatibilityPolicy: "Proposal status and impactedAssets remain part of the contract.",
    openapiSpec: "MCP tool schema: upsert_proposal",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-context-pack-upsert",
    name: "SpecForge Context Pack Upsert MCP Contract",
    method: "POST",
    path: "mcp://tools/upsert_context_pack",
    description: "Persists an Agent Context Pack generated or curated for a proposal.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["SpecForge Seed Client", "AI Coding Agents"],
    requestSchema: { contextPack: "ContextPack payload" },
    responseSchema: { id: "string", proposalId: "string", status: "upserted" },
    errorCodes: ["TOOL_VALIDATION_FAILED", "PERSISTENCE_WRITE_FAILED"],
    authType: "allowAllPolicy MVP; future RBAC context-pack:generate",
    idempotency: "Idempotent by contextPack.id.",
    rateLimit: "Local MVP only",
    timeout: "10s",
    compatibilityPolicy: "generatedMarkdown remains required for export.",
    openapiSpec: "MCP tool schema: upsert_context_pack",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-asset-link",
    name: "SpecForge Asset Link MCP Contract",
    method: "POST",
    path: "mcp://tools/link_assets",
    description: "Persists a typed relationship between two design assets for graph traversal and future impact analysis.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["SpecForge Seed Client", "AI Coding Agents", "SpecForge Graph View"],
    requestSchema: { sourceType: "AssetType", sourceId: "string", targetType: "AssetType", targetId: "string", relationType: "string", description: "string?" },
    responseSchema: { id: "string", relationType: "string", status: "upserted" },
    errorCodes: ["TOOL_VALIDATION_FAILED", "RELATIONSHIP_WRITE_FAILED"],
    authType: "allowAllPolicy MVP; future RBAC asset:write",
    idempotency: "Idempotent by source, target, and relationType.",
    rateLimit: "Local MVP only",
    timeout: "10s",
    compatibilityPolicy: "Relation type strings are additive and must not be silently repurposed.",
    openapiSpec: "MCP tool schema: link_assets",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-graph-query",
    name: "SpecForge Asset Graph Query Contract",
    method: "GET",
    path: "specforge://graph",
    description: "Reads persisted design assets and AssetLink edges as an agent-readable graph.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["AI Coding Agents", "SpecForge Web Graph"],
    requestSchema: { domainId: "string?", assetType: "AssetType?" },
    responseSchema: { nodes: "AssetGraphNode[]", edges: "AssetGraphEdge[]" },
    errorCodes: ["GRAPH_RENDER_FAILED"],
    authType: "asset:read + graph:read",
    idempotency: "Read-only.",
    rateLimit: "Local MVP only",
    timeout: "5s",
    compatibilityPolicy: "Nodes and edges are additive.",
    openapiSpec: "MCP resource schema: specforge://graph",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "api-specforge-ai-generation",
    name: "SpecForge AI Generation Contract",
    method: "POST",
    path: "/api/ai/generate",
    description: "Requests mock AI generation for proposals, ADRs, business rules, tests, and agent context packs while preserving a provider abstraction.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge Web",
    consumers: ["SpecForge Web Console"],
    requestSchema: { capability: "proposal|adr|businessRule|testSuggestions|agentContextPack", prompt: "string", providerId: "mock|openai" },
    responseSchema: { providerId: "string", content: "GeneratedDraft", warnings: "string[]" },
    errorCodes: ["AI_PROVIDER_NOT_FOUND", "AI_GENERATION_FAILED"],
    authType: "local-mvp-session",
    idempotency: "Mock provider is deterministic for the same prompt.",
    rateLimit: "Local MVP only",
    timeout: "10s",
    compatibilityPolicy: "New capabilities are additive.",
    openapiSpec: "Next route /api/ai/generate",
    exposure: "internal",
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignEvents: EventContract[] = [
  {
    id: "event-specforge-context-pack-generated",
    name: "ContextPackGenerated Event Contract",
    topic: "specforge.context_pack.generated",
    eventType: "ContextPackGenerated",
    description: "Published conceptually when a Context Pack is generated for an agent implementation workflow.",
    domainId: "domain-specforge-platform",
    producer: "ContextPackGenerator",
    consumers: ["AuditLogger", "Agent Workflow Monitor"],
    schema: { eventId: "string", eventType: "ContextPackGenerated", version: "1.0", timestamp: "string", traceId: "string", contextPackId: "string", proposalId: "string", targetAgent: "string" },
    triggerTiming: "After context pack markdown is generated",
    idempotencyKey: "contextPackId",
    orderingRequirement: "Ordered by proposalId",
    retryPolicy: "Retry conceptual event publication through audit pipeline",
    deadLetterPolicy: "Store failed publication in audit log for MVP",
    compatibilityPolicy: "No field removal in v1.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "event-specforge-mcp-tool-called",
    name: "McpToolCalled Event Contract",
    topic: "specforge.mcp.tool.called",
    eventType: "McpToolCalled",
    description: "Represents the auditable fact that an MCP client invoked a SpecForge tool.",
    domainId: "domain-specforge-platform",
    producer: "McpToolWrapper",
    consumers: ["AuditLogger", "Security Review"],
    schema: { eventId: "string", eventType: "McpToolCalled", version: "1.0", timestamp: "string", traceId: "string", toolName: "string", actorId: "string", status: "success|failed" },
    triggerTiming: "Around every MCP tool call",
    idempotencyKey: "eventId",
    orderingRequirement: "No strict ordering required",
    retryPolicy: "Audit write must be attempted once in MVP; durable retry is future work",
    deadLetterPolicy: "Expose failed audit write as internal error metric",
    compatibilityPolicy: "Additive fields only.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "event-specforge-design-asset-upserted",
    name: "DesignAssetUpserted Event Contract",
    topic: "specforge.design_asset.upserted",
    eventType: "DesignAssetUpserted",
    description: "Represents a persisted write of a design asset through the MCP upsert_design_asset tool.",
    domainId: "domain-specforge-platform",
    producer: "upsert_design_asset",
    consumers: ["AssetGraphBuilder", "ImpactAnalysisEngine", "AuditLogger"],
    schema: { eventId: "string", eventType: "DesignAssetUpserted", version: "1.0", timestamp: "string", assetType: "AssetType", assetId: "string", actorId: "string" },
    triggerTiming: "After a design asset upsert succeeds",
    idempotencyKey: "assetType + assetId + updatedAt",
    orderingRequirement: "Ordered by assetId",
    retryPolicy: "Re-run idempotent upsert through MCP if seed/import fails",
    deadLetterPolicy: "Record failure in audit log for MVP",
    compatibilityPolicy: "Additive fields only.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "event-specforge-asset-link-created",
    name: "AssetLinkCreated Event Contract",
    topic: "specforge.asset_link.created",
    eventType: "AssetLinkCreated",
    description: "Represents a persisted relationship between two design assets.",
    domainId: "domain-specforge-platform",
    producer: "link_assets",
    consumers: ["AssetGraphBuilder", "ImpactAnalysisEngine"],
    schema: { eventId: "string", eventType: "AssetLinkCreated", version: "1.0", timestamp: "string", sourceType: "AssetType", sourceId: "string", targetType: "AssetType", targetId: "string", relationType: "string" },
    triggerTiming: "After a link_assets call succeeds",
    idempotencyKey: "source + relationType + target",
    orderingRequirement: "No strict ordering required",
    retryPolicy: "Safe to retry the same relation write",
    deadLetterPolicy: "Expose relation write failure through MCP error result",
    compatibilityPolicy: "Relation payload is additive.",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "event-specforge-governance-check-completed",
    name: "GovernanceCheckCompleted Event Contract",
    topic: "specforge.governance.check.completed",
    eventType: "GovernanceCheckCompleted",
    description: "Represents governance evaluation completion for an asset, proposal, or context pack.",
    domainId: "domain-specforge-platform",
    producer: "run_governance_checks",
    consumers: ["Governance Dashboard", "ImpactAnalysisEngine", "AuditLogger"],
    schema: { eventId: "string", eventType: "GovernanceCheckCompleted", version: "1.0", timestamp: "string", targetType: "asset|proposal|context-pack", targetId: "string", resultCount: "number", failedCount: "number" },
    triggerTiming: "After governance checks return",
    idempotencyKey: "targetType + targetId + timestamp",
    orderingRequirement: "Ordered by target id for UI snapshots",
    retryPolicy: "Read operation can be repeated",
    deadLetterPolicy: "No DLQ in MVP; return sanitized MCP error",
    compatibilityPolicy: "Additive fields only.",
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignBusinessRules: BusinessRule[] = [
  {
    id: "rule-specforge-core-service-reuse",
    name: "Web and MCP must reuse Core Service",
    code: "SPECFORGE_CORE_REUSE",
    description: "Web UI and MCP Server must call packages/core for design asset operations and must not duplicate business logic.",
    domainId: "domain-specforge-platform",
    ruleType: "validation",
    condition: "Any design operation exposed by apps/web or apps/mcp-server has a corresponding packages/core function.",
    action: "Allow app layer composition only when the behavior is delegated to Core Service.",
    exception: "Reject duplicated business logic in app routes or MCP handlers.",
    examples: ["generate_context_pack delegates to generateContextPack()", "Web proposal impact route delegates to analyzeProposalImpact()"],
    relatedAssets: [
      { type: "api", id: "api-specforge-web-console", label: "SpecForge Web Console API Contract" },
      { type: "api", id: "api-specforge-mcp-tools", label: "SpecForge MCP Tool Contract" }
    ],
    severity: "high",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "rule-specforge-mcp-write-audit",
    name: "MCP write tools must be audited",
    code: "SPECFORGE_MCP_WRITE_AUDIT",
    description: "Every MCP tool call, especially write operations, must record an AuditLog entry with actor, action, target, input summary, output summary, and status.",
    domainId: "domain-specforge-platform",
    ruleType: "validation",
    condition: "Tool is registered in apps/mcp-server/src/tools.ts",
    action: "Wrap the tool handler with auditToolCall().",
    exception: "Return sanitized failure and preserve audit failure details internally.",
    examples: ["upsert_design_asset is audited", "upsert_proposal is audited", "upsert_context_pack is audited", "generate_context_pack is audited"],
    relatedAssets: [
      { type: "dataModel", id: "data-specforge-audit", label: "SpecForge AuditLog Data Model" },
      { type: "event", id: "event-specforge-mcp-tool-called", label: "McpToolCalled Event Contract" }
    ],
    severity: "high",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "rule-specforge-seed-through-mcp",
    name: "Seed writes must call MCP tools",
    code: "SPECFORGE_SEED_THROUGH_MCP",
    description: "Database seed/import routines must call MCP write tools instead of directly calling Prisma upserts for design asset data.",
    domainId: "domain-specforge-platform",
    ruleType: "validation",
    condition: "A script populates DesignAsset, Proposal, ContextPack, or AssetLink records.",
    action: "Use the SpecForge MCP stdio client and call upsert_design_asset, upsert_proposal, upsert_context_pack, and link_assets.",
    exception: "Schema bootstrap and legacy cleanup may use internal persistence functions before MCP calls begin.",
    examples: ["pnpm db:seed launches apps/mcp-server seed client", "SpecForge self-design assets are written through MCP tool calls"],
    relatedAssets: [
      { type: "api", id: "api-specforge-asset-upsert", label: "SpecForge Asset Upsert MCP Contract" },
      { type: "api", id: "api-specforge-asset-link", label: "SpecForge Asset Link MCP Contract" }
    ],
    severity: "high",
    createdAt: now,
    updatedAt: now
  },
  {
    id: "rule-specforge-relationships-required",
    name: "Design assets require explicit relationships",
    code: "SPECFORGE_RELATIONSHIPS_REQUIRED",
    description: "Related design assets must be connected with typed AssetLink records so graph queries and future impact analysis can traverse dependencies.",
    domainId: "domain-specforge-platform",
    ruleType: "validation",
    condition: "A persisted asset references another asset in description, schema, lifecycle, governance, or workflow semantics.",
    action: "Create a link_assets relation with a stable relationType such as owns, governs, writes, emits, reads, generates, impacts, or verifies.",
    exception: "Pure leaf assets with no dependency may omit explicit links.",
    examples: ["upsert_design_asset writes DesignAsset", "ContextPack includes Proposal and impacted assets", "Governance rule governs MCP write APIs"],
    relatedAssets: [
      { type: "dataModel", id: "data-specforge-asset-graph", label: "SpecForge Asset Graph Data Model" },
      { type: "api", id: "api-specforge-asset-link", label: "SpecForge Asset Link MCP Contract" }
    ],
    severity: "medium",
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignStateMachines: StateMachine[] = [
  {
    id: "sm-specforge-proposal-lifecycle",
    name: "SpecForge Proposal Lifecycle",
    description: "Controls the lifecycle of a design change proposal from draft to implementation.",
    domainId: "domain-specforge-platform",
    states: ["draft", "reviewing", "approved", "implemented", "archived"],
    transitions: [
      { from: "draft", to: "reviewing", trigger: "submit_for_review", action: "run governance checks", idempotent: true },
      { from: "reviewing", to: "approved", trigger: "approve", condition: "blocking governance errors resolved", action: "mark proposal approved", idempotent: true },
      { from: "approved", to: "implemented", trigger: "implementation_done", action: "attach context pack and verification evidence", idempotent: true },
      { from: "implemented", to: "archived", trigger: "archive", action: "hide from active workflow", idempotent: true }
    ],
    initialState: "draft",
    terminalStates: ["archived"],
    events: ["ProposalCreated", "GovernanceCheckRun", "ContextPackGenerated"],
    guards: ["required fields present", "impacted assets linked", "rollback plan present for high risk"],
    actions: ["run governance checks", "generate context pack", "record audit log"],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "sm-specforge-context-pack-generation",
    name: "SpecForge Context Pack Generation Lifecycle",
    description: "Describes how an Agent Context Pack is generated from a proposal and impacted design assets.",
    domainId: "domain-specforge-platform",
    states: ["requested", "collecting_assets", "rendering_markdown", "ready", "failed"],
    transitions: [
      { from: "requested", to: "collecting_assets", trigger: "generate_context_pack", action: "load proposal and impacted assets", idempotent: true },
      { from: "collecting_assets", to: "rendering_markdown", trigger: "assets_loaded", action: "render sections", idempotent: true },
      { from: "rendering_markdown", to: "ready", trigger: "markdown_rendered", action: "return markdown or JSON", emitsEvent: "ContextPackGenerated", idempotent: true },
      { from: "rendering_markdown", to: "failed", trigger: "render_failed", action: "return sanitized error", idempotent: true }
    ],
    initialState: "requested",
    terminalStates: ["ready", "failed"],
    events: ["ContextPackGenerated"],
    guards: ["proposal exists", "included asset ids are valid", "Do-not Rules are present"],
    actions: ["render markdown", "record audit log", "return MCP text result"],
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignIntegration: IntegrationContract = {
  id: "integration-specforge-mcp-agent",
  name: "AI Agent to SpecForge MCP Integration",
  description: "Local AI Coding Agents connect to SpecForge over MCP stdio to read design assets and call design workflow tools.",
  domainId: "domain-specforge-platform",
  sourceSystem: "AI Coding Agent",
  targetSystem: "SpecForge MCP Server",
  protocol: "MCP stdio",
  dataMapping: "MCP tool arguments -> Core Service input DTOs; Core Service outputs -> MCP text result",
  errorMapping: "Core errors -> sanitized MCP tool errors; full details stay in audit logs",
  sla: "Local tool calls should return within 10 seconds for seed data",
  timeout: "10s",
  retryStrategy: "Client may retry read tools; write tools are audited and should be treated carefully",
  fallbackStrategy: "Use Web Console resources if MCP client is unavailable",
  circuitBreaker: "Reserved for Streamable HTTP deployment",
  owner: "SpecForge Core Team",
  createdAt: now,
  updatedAt: now
};

export const selfDesignQuality: QualityRequirement = {
  id: "quality-specforge-mcp-smoke",
  name: "SpecForge MCP Smoke Quality Requirement",
  description: "The MCP Server must expose tools, resources, prompts, and pass a real stdio client smoke test.",
  assetType: "api",
  assetId: "api-specforge-mcp-tools",
  domainId: "domain-specforge-platform",
  category: "reliability",
  target: "MCP smoke verifies read tools, persisted write tools, resources, templates, prompts, search, context pack generation, and governance checks.",
  measurement: "pnpm --filter @specforge/mcp-server smoke",
  priority: "high",
  verificationMethod: "Run smoke test after MCP tool/resource/prompt changes.",
  createdAt: now,
  updatedAt: now
};

export const selfDesignQualityRequirements: QualityRequirement[] = [
  selfDesignQuality,
  {
    id: "quality-specforge-impact-ready",
    name: "SpecForge Impact Analysis Readiness Requirement",
    description: "Persisted assets must include enough explicit AssetLink relationships for future impact analysis to traverse affected contracts, rules, models, workflows, and context packs.",
    assetType: "dataModel",
    assetId: "data-specforge-asset-graph",
    domainId: "domain-specforge-platform",
    category: "reliability",
    target: "At least 30 persisted AssetLink records connect SpecForge self-design assets after seed.",
    measurement: "SELECT COUNT(*) FROM AssetLink",
    priority: "high",
    verificationMethod: "Run pnpm db:seed and verify graph page plus MCP graph resource include explicit relation edges.",
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignObservability: ObservabilityDesign = {
  id: "obs-specforge-mcp-audit",
  name: "SpecForge MCP Audit Observability Design",
  description: "Tracks MCP tool calls, audit failures, and context pack generation outcomes.",
  assetType: "api",
  assetId: "api-specforge-mcp-tools",
  domainId: "domain-specforge-platform",
  metrics: ["mcp.tool.call.count", "mcp.tool.error.count", "mcp.audit.write.count", "context_pack.generated.count"],
  logs: ["actorId", "toolName", "targetType", "targetId", "status", "errorMessage"],
  traces: ["MCP Client", "McpToolWrapper", "Core Service", "AuditLogger"],
  alerts: ["mcp.tool.error.count > 10 in 5m", "mcp.audit.write.count == 0 while mcp.tool.call.count > 0"],
  dashboards: ["SpecForge MCP Operations"],
  runbook: "Check tool input validation, asset ids, audit log writes, and Core Service exceptions.",
  slo: "99% of seed-data MCP tool calls complete successfully in local smoke tests.",
  createdAt: now,
  updatedAt: now
};

export const selfDesignAdr: Adr = {
  id: "adr-mcp-first-architecture",
  name: "MCP-first architecture",
  title: "Use MCP as the primary AI Agent interface",
  description: "SpecForge exposes design knowledge and design workflows through MCP first, while the Web UI remains the human management console.",
  domainId: "domain-specforge-platform",
  status: "accepted",
  context: "SpecForge is built for AI Coding Agents that need structured design facts, governance checks, and implementation context before changing code.",
  decision: "Build an independent MCP Server that reuses packages/core with the Web Console. Use stdio for the MVP and reserve Streamable HTTP plus OAuth/RBAC for future remote deployments.",
  alternatives: ["Expose only REST APIs to agents", "Embed all design workflows inside the Web UI", "Let each agent parse documentation files directly"],
  consequences: ["Agents get a stable protocol-native interface", "Core Service boundaries become mandatory", "Audit and permissions can be enforced per tool call"],
  constraints: ["MCP tools must not expose delete operations by default", "MCP write tools must use Zod validation", "MCP errors must be sanitized"],
  relatedAssets: [
    { type: "api", id: "api-specforge-mcp-tools", label: "SpecForge MCP Tool Contract" },
    { type: "businessRule", id: "rule-specforge-core-service-reuse", label: "Web and MCP must reuse Core Service" }
  ],
  owner: "SpecForge Architecture",
  createdAt: now,
  updatedAt: now
};

export const selfDesignProposal: Proposal = {
  id: "proposal-specforge-self-design",
  name: "SpecForge MCP-first self-design",
  title: "SpecForge MCP-first Self-Design Proposal",
  description: "Make SpecForge manage its own architecture, MCP surface, governance rules, AI provider abstraction, PostgreSQL persistence, and agent context as first-class design assets.",
  domainId: "domain-specforge-platform",
  background: [
    "SpecForge is intended to be an MCP-native design center for AI Coding Agents, not only a human-facing catalog. Agents need a reliable source of truth for domain concepts, data models, API contracts, event contracts, state machines, business rules, ADRs, governance checks, and context packs before they change code.",
    "Therefore SpecForge should be self-describing: the design of SpecForge itself must live inside SpecForge and be written through the same MCP persistence path that future agents will use."
  ].join("\n\n"),
  goal: [
    "Establish a complete self-design proposal that makes SpecForge's MCP-first architecture queryable from both Web and MCP clients.",
    "Persist the platform's design assets through MCP tools into PostgreSQL, covering domain, data, API, event, business rule, state machine, integration, quality, observability, ADR, proposal, context pack, and asset relationship data.",
    "Keep the system ready for future AI generation capabilities without connecting to real models yet by using MockAIProvider and reserving the OpenAIProvider boundary."
  ].join("\n\n"),
  nonGoal: [
    "Do not replace the written specification documents; database-backed design assets complement docs by making them queryable, governable, and linkable.",
    "Do not connect to a real LLM provider in this proposal; provider abstraction and mock generation are sufficient for the MVP.",
    "Do not expose destructive raw database operations through MCP. All writes must remain typed, validated, auditable, and aligned with design assets."
  ].join("\n\n"),
  scope: [
    "In scope: MCP write tools, PostgreSQL persistence, seeded self-design assets, asset relationship links, Web browsing pages, proposal detail content, graph filtering, governance visibility, Context Pack generation, and AI Provider abstraction.",
    "The proposal covers how SpecForge should be maintained as its own first customer: design changes should update the asset graph and context packs, not only code."
  ].join("\n\n"),
  impactedAssets: [...selfDesignRefs],
  specChanges: [
    "Define the SpecForge Platform bounded context.",
    "Persist expanded data models for design assets, MCP registry, AI generation, Web workspace, asset graph, i18n, and audit logs.",
    "Maintain MCP tool contracts for asset upsert, proposal upsert, context pack upsert, asset search, governance checks, impact analysis, markdown export, and relationship links.",
    "Keep API, event, and state machine assets strong enough for later impact analysis.",
    "Preserve Core Service reuse between Web and MCP surfaces.",
    "Keep MockAIProvider active and reserve OpenAIProvider for future real-model integration.",
    "Use PostgreSQL as the local durable store and seed/update data through MCP tools."
  ],
  risks: [
    "high: Self-design assets can drift from implementation if code, seed data, database state, and docs are not verified together.",
    "medium: MCP write tools increase power and therefore require audit, validation, and relationship checks."
  ],
  rolloutPlan: [
    "First, update the self-design seed data and write it into PostgreSQL through the MCP seed client.",
    "Second, verify the Proposal detail page, MCP smoke test, typecheck, lint, and graph pages.",
    "Third, use this proposal as the default reference for future SpecForge implementation tasks and context packs."
  ].join("\n\n"),
  rollbackPlan: [
    "Re-run MCP seed with the previous selfDesignProposal payload, or remove the self-design proposal from the seed module if the design center should fall back to external docs only.",
    "Database rollback does not require schema changes because this update only changes Proposal payload content."
  ].join("\n\n"),
  status: "approved",
  localizedContent: {
    zh: {
      name: "SpecForge MCP 优先自设计",
      title: "SpecForge MCP 优先自设计提案",
      description: "将 SpecForge 自身的架构、MCP 能力面、治理规则、AI Provider 抽象、PostgreSQL 持久化和 Agent 上下文沉淀为一等设计资产。",
      background: [
        "SpecForge 的定位是面向 AI Coding Agent 的 MCP-native 设计中心，而不仅是给人看的资产目录。Agent 在改代码前，需要能查询领域概念、数据模型、API 契约、事件契约、状态机、业务规则、ADR、治理检查和 Context Pack 等可信设计事实。",
        "因此 SpecForge 应该自描述：SpecForge 自身的设计也必须进入 SpecForge，并且通过未来 Agent 会使用的同一条 MCP 持久化链路写入。"
      ].join("\n\n"),
      goal: [
        "建立一份完整的自设计提案，让 SpecForge 的 MCP 优先架构可以同时被 Web 和 MCP 客户端查询。",
        "通过 MCP 工具将平台设计资产写入 PostgreSQL，覆盖领域、数据、API、事件、业务规则、状态机、集成、质量、可观测性、ADR、提案、Context Pack 和资产关系数据。",
        "在暂不接入真实模型的前提下，通过 MockAIProvider 和预留 OpenAIProvider 边界，为未来生成 Proposal、ADR、规则、测试建议和 Agent Context Pack 做好准备。"
      ].join("\n\n"),
      nonGoal: [
        "不替代已有书面 spec 文档；数据库中的设计资产是对文档的补充，使其可查询、可治理、可建立关系。",
        "本提案不接入真实大模型；MVP 阶段完成 Provider 抽象和 Mock 生成即可。",
        "不通过 MCP 暴露破坏性的原始数据库操作。所有写入必须保持类型化、可校验、可审计，并与设计资产模型对齐。"
      ].join("\n\n"),
      scope: [
        "范围内：MCP 写入工具、PostgreSQL 持久化、自设计种子资产、资产关系、Web 浏览页面、提案详情内容、关系图过滤、治理可见性、Context Pack 生成和 AI Provider 抽象。",
        "本提案约定 SpecForge 要把自己当成第一个客户维护：设计变更不仅要改代码，也要更新资产图谱和 Context Pack。"
      ].join("\n\n"),
      specChanges: [
        "定义 SpecForge Platform 限界上下文。",
        "持久化设计资产、MCP 注册表、AI 生成、Web 工作区、资产图谱、国际化和审计日志等数据模型。",
        "维护资产写入、提案写入、Context Pack 写入、资产搜索、治理检查、影响分析、Markdown 导出和关系链接等 MCP 工具契约。",
        "保持 API、事件和状态机资产足够完整，为后续影响分析提供依据。",
        "保持 Web 与 MCP 两个入口复用 Core Service。",
        "当前启用 MockAIProvider，并为未来真实模型接入预留 OpenAIProvider。",
        "使用 PostgreSQL 作为本地持久化存储，并通过 MCP 工具写入和更新数据。"
      ],
      risks: [
        "high: 如果代码、种子数据、数据库状态和文档没有一起校验，自设计资产可能与实现漂移。",
        "medium: MCP 写入工具能力更强，因此必须配套审计、校验和关系检查。"
      ],
      rolloutPlan: [
        "第一步，更新自设计种子数据，并通过 MCP seed client 写入 PostgreSQL。",
        "第二步，验证 Proposal 详情页、MCP smoke、typecheck、lint 和关系图页面。",
        "第三步，把这份提案作为后续 SpecForge 实现任务和 Context Pack 的默认设计入口。"
      ].join("\n\n"),
      rollbackPlan: [
        "可以用旧的 selfDesignProposal payload 重新执行 MCP seed；如果设计中心需要退回到只依赖外部文档，则从种子模块移除自设计提案。",
        "本次只更新 Proposal payload 内容，不涉及数据库 schema，因此数据库回滚不需要结构变更。"
      ].join("\n\n")
    },
    en: {
      name: "SpecForge MCP-first self-design",
      title: "SpecForge MCP-first Self-Design Proposal",
      description: "Make SpecForge manage its own architecture, MCP surface, governance rules, AI provider abstraction, PostgreSQL persistence, and agent context as first-class design assets."
    }
  },
  createdAt: now,
  updatedAt: now
};

export const architectureChangeProposals: Proposal[] = [
  {
    id: "proposal-strict-application-service-isolation",
    name: "Strict application-service isolation",
    title: "Enforce Application-Service Scope as a Hard Data Boundary",
    description: "Bind every normal Web and MCP read or write to one explicit, authorized Huawei application service.",
    domainId: "domain-specforge-platform",
    background: "The previous implementation allowed unscoped database rows, implicit Designer fallback, and service switches that did not consistently change dashboard, asset, graph, governance, and API results.",
    goal: "Make application-service scope mandatory and consistent across Web pages, API routes, repositories, MCP tools, PostgreSQL queries, graph construction, and governance views.",
    nonGoal: "Do not provide a multi-service aggregation or comparison view in this change. Cross-service traversal remains limited to a future explicit impact-analysis workflow.",
    scope: "Introduce shared scope resolution, inherited read authorization, service-only write checks, scoped links and counts, URL/cookie scope persistence, and fail-closed handling for missing or unauthorized scope.",
    impactedAssets: [
      { type: "api", id: "api-specforge-web-console", label: "SpecForge Web Console API Contract" },
      { type: "api", id: "api-specforge-mcp-tools", label: "SpecForge MCP Tool Contract" },
      { type: "dataModel", id: "data-specforge-assets", label: "SpecForge Design Asset Data Model" },
      { type: "dataModel", id: "data-specforge-asset-graph", label: "SpecForge Asset Graph Data Model" },
      { type: "businessRule", id: "rule-specforge-core-service-reuse", label: "Web and MCP must reuse Core Service" }
    ],
    specChanges: [
      "Require an authorized applicationServiceId for all database-backed reads.",
      "Remove legacy in-memory and default-service fallbacks from normal views.",
      "Filter dashboard totals, proposals, context packs, governance checks, graph nodes, links, and API responses by the active service.",
      "Preserve the selected service in URLs and a validated browser cookie.",
      "Require architectureScope on MCP writes and applicationServiceId on MCP reads."
    ],
    risks: [
      "Existing null-scope rows become invisible until migrated through MCP seed.",
      "A missing scope now fails closed, so every caller must propagate service context."
    ],
    rolloutPlan: "Deploy shared scope validation first, migrate persisted records through MCP seed, then enable scoped Web and MCP queries and verify service-specific counts.",
    rollbackPlan: "Revert the strict repository and MCP signatures together, then restore the previous seed payload. Do not partially restore implicit fallback because that would reintroduce cross-service leakage.",
    status: "implemented",
    localizedContent: {
      en: {
        name: "Strict application-service isolation",
        title: "Enforce Application-Service Scope as a Hard Data Boundary",
        description: "Bind every normal Web and MCP read or write to one explicit, authorized Huawei application service.",
        background: "The previous implementation allowed unscoped database rows, implicit Designer fallback, and service switches that did not consistently change dashboard, asset, graph, governance, and API results.",
        goal: "Make application-service scope mandatory and consistent across Web pages, API routes, repositories, MCP tools, PostgreSQL queries, graph construction, and governance views.",
        nonGoal: "Do not provide a multi-service aggregation or comparison view in this change. Cross-service traversal remains limited to a future explicit impact-analysis workflow.",
        scope: "Introduce shared scope resolution, inherited read authorization, service-only write checks, scoped links and counts, URL/cookie scope persistence, and fail-closed handling for missing or unauthorized scope.",
        specChanges: ["Require explicit scope for all reads and writes.", "Remove fallback data paths.", "Filter every normal view by one service.", "Persist and validate the selected service.", "Align Web and MCP authorization."],
        risks: ["Null-scope legacy rows require migration.", "Callers missing scope fail closed."],
        rolloutPlan: "Deploy validation, migrate records through MCP seed, and verify service-specific results.",
        rollbackPlan: "Revert repository and MCP contracts together and restore the previous seed; never restore only part of the boundary."
      },
      zh: {
        name: "应用服务严格隔离",
        title: "将应用服务 Scope 建设为强制数据边界",
        description: "所有常规 Web 与 MCP 读写都必须绑定一个明确且已授权的华为应用服务。",
        background: "此前存在无 scope 数据、隐式回退 Designer，以及切换应用服务后仪表盘、设计资产、关系图、治理和 API 结果未完全变化的问题。",
        goal: "让应用服务 scope 在 Web 页面、API 路由、仓储、MCP 工具、PostgreSQL 查询、关系图和治理视图中保持强制且一致。",
        nonGoal: "本次不提供多应用服务聚合或对比视图；跨服务遍历仅保留给后续显式影响分析流程。",
        scope: "增加统一 scope 解析、继承式读权限、仅应用服务可写校验、按服务过滤的关系与统计、URL/Cookie 状态保持，以及缺失或越权时的失败关闭。",
        specChanges: ["所有读写必须显式携带 scope。", "删除内存预置和默认服务回退。", "所有常规视图按单一应用服务过滤。", "持久化并校验用户选择的服务。", "统一 Web 与 MCP 授权边界。"],
        risks: ["历史无 scope 数据必须先迁移。", "未传 scope 的调用方将直接失败。"],
        rolloutPlan: "先发布统一校验，再通过 MCP seed 迁移数据，最后验证各应用服务结果完全独立。",
        rollbackPlan: "仓储与 MCP 契约必须一起回滚并恢复旧 seed，禁止只恢复局部隐式回退。"
      }
    },
    createdAt: now,
    updatedAt: now
  },
  {
    id: "proposal-agent-service-workspace",
    name: "Agent service workspace",
    title: "Create an Agent-by-Application-Service Workspace",
    description: "Replace the global dashboard assumption with one workspace per Agent and application service.",
    domainId: "domain-specforge-platform",
    background: "A global dashboard mixes an Agent's recent work, drafts, pending tasks, and generation history across services even though design assets belong to a specific application service.",
    goal: "Persist and restore independent workspace state for each Agent and authorized application service while keeping service design assets shared facts.",
    nonGoal: "Do not duplicate service assets per Agent and do not implement the deferred multi-service comparison dashboard.",
    scope: "Add AgentServiceWorkspace keyed by agentType, agentId, and applicationServiceId; scope dashboard metrics and recent work to the selected service.",
    impactedAssets: [
      { type: "dataModel", id: "data-specforge-web-workspace", label: "SpecForge Web Workspace Data Model" },
      { type: "api", id: "api-specforge-web-console", label: "SpecForge Web Console API Contract" },
      { type: "businessRule", id: "rule-specforge-relationships-required", label: "Design assets require explicit relationships" }
    ],
    specChanges: ["Persist one workspace per Agent and service.", "Restore service-specific recent assets, drafts, tasks, and generation history.", "Scope dashboard totals to the active service.", "Keep shared service assets independent from personal workspace state."],
    risks: ["Workspace state can drift if service selection is not preserved.", "Personal state must never alter shared design-asset ownership."],
    rolloutPlan: "Create the workspace model, initialize it on first service visit, then switch dashboard queries to the selected service.",
    rollbackPlan: "Stop reading AgentServiceWorkspace and return to service-only dashboards; retain workspace rows for later migration because they do not own design assets.",
    status: "implemented",
    localizedContent: {
      en: {
        name: "Agent service workspace", title: "Create an Agent-by-Application-Service Workspace", description: "Replace the global dashboard assumption with one workspace per Agent and application service.",
        background: "A global dashboard mixes Agent activity across services even though design assets belong to a specific application service.", goal: "Persist and restore independent workspace state for each Agent and authorized service.", nonGoal: "Do not duplicate service assets per Agent or add multi-service comparison.", scope: "Persist AgentServiceWorkspace and scope dashboard state to one service.",
        specChanges: ["Persist one workspace per Agent and service.", "Restore service-specific activity.", "Scope dashboard totals.", "Keep shared assets outside personal state."], risks: ["Selection persistence can cause workspace drift.", "Personal state must not own shared assets."], rolloutPlan: "Create the model, initialize on first visit, and switch dashboard queries.", rollbackPlan: "Return to service-only dashboards while retaining non-owning workspace rows."
      },
      zh: {
        name: "Agent 应用服务工作区", title: "建设 Agent × 应用服务独立工作区", description: "将全局仪表盘改为每个 Agent、每个应用服务一份独立工作区。",
        background: "全局仪表盘会混合 Agent 在不同服务中的最近工作、草稿、待办和生成历史，而设计资产本身属于特定应用服务。", goal: "为每个 Agent 和已授权应用服务持久化并恢复独立工作区状态，同时保持服务设计资产为共享事实。", nonGoal: "不为每个 Agent 复制服务资产，也不实现多服务对比仪表盘。", scope: "增加 AgentServiceWorkspace，并让仪表盘状态绑定单一服务。",
        specChanges: ["每个 Agent 和服务持久化一个工作区。", "恢复服务级最近活动、草稿和待办。", "仪表盘统计按当前服务过滤。", "个人状态与共享资产所有权分离。"], risks: ["服务选择未保持会造成工作区漂移。", "个人状态不得改变共享资产归属。"], rolloutPlan: "创建模型，首次访问服务时初始化，并切换仪表盘查询。", rollbackPlan: "退回仅服务级仪表盘，保留不拥有设计资产的工作区记录供后续迁移。"
      }
    },
    createdAt: now,
    updatedAt: now
  },
  {
    id: "proposal-mcp-native-scoped-seeding",
    name: "MCP-native scoped seeding",
    title: "Seed Scoped Multi-Service Design Data Through MCP",
    description: "Make seed data exercise the same validated and audited MCP write path used by future Agents.",
    domainId: "domain-specforge-platform",
    background: "Direct or legacy seed data produced null-scope rows and left mock application services empty, hiding isolation defects and making service switching appear ineffective.",
    goal: "Migrate all design fixtures through MCP and provide distinct, queryable assets for Designer, Spec Studio, Policy Hub, and Integration Gateway.",
    nonGoal: "Do not grant the normal Agent write permission to read-only sibling services and do not expose a general administrative bypass.",
    scope: "Use a seed-only system actor, fail fast on MCP tool errors, write architectureScope explicitly, and create minimal domain-specific fixtures for each mock service.",
    impactedAssets: [
      { type: "api", id: "api-specforge-asset-upsert", label: "SpecForge Asset Upsert MCP Contract" },
      { type: "api", id: "api-specforge-proposal-upsert", label: "SpecForge Proposal Upsert MCP Contract" },
      { type: "businessRule", id: "rule-specforge-seed-through-mcp", label: "Seed writes must call MCP tools" },
      { type: "quality", id: "quality-specforge-mcp-smoke", label: "SpecForge MCP Smoke Quality Requirement" }
    ],
    specChanges: ["Add a seed-only system actor with module write access.", "Propagate the seed actor only to the MCP child process.", "Fail seed execution when any MCP tool returns isError.", "Write distinct assets for four application services.", "Verify PostgreSQL counts by applicationServiceId."],
    risks: ["A leaked seed flag could broaden write access in the local process.", "Non-idempotent fixtures could create duplicate design assets."],
    rolloutPlan: "Enable the seed actor only in the seed child process, upsert deterministic IDs, and verify per-service database counts after every run.",
    rollbackPlan: "Remove the seed-only fixtures and actor selection, then rerun the previous MCP seed. Existing deterministic rows can be deleted by their stable IDs.",
    status: "implemented",
    localizedContent: {
      en: {
        name: "MCP-native scoped seeding", title: "Seed Scoped Multi-Service Design Data Through MCP", description: "Make seed data exercise the same validated and audited MCP write path used by future Agents.",
        background: "Legacy seed data produced null-scope rows and empty sibling services.", goal: "Write all fixtures through MCP and provide distinct assets for four services.", nonGoal: "Do not widen normal Agent permissions or expose an administrative bypass.", scope: "Use a seed-only actor, fail-fast MCP calls, explicit scope, and deterministic fixtures.",
        specChanges: ["Add a seed-only actor.", "Pass it only to the MCP child process.", "Fail on MCP isError.", "Seed four services.", "Verify service counts."], risks: ["The seed flag must remain process-local.", "Fixtures must remain idempotent."], rolloutPlan: "Use deterministic MCP upserts and verify counts after every seed.", rollbackPlan: "Remove seed fixtures and rerun the previous MCP seed; delete deterministic rows by stable IDs if needed."
      },
      zh: {
        name: "MCP-native 分服务种子数据", title: "通过 MCP 写入分 Scope 的多应用服务设计数据", description: "让种子数据走未来 Agent 使用的同一条可校验、可审计 MCP 写入链路。",
        background: "旧种子数据产生了无 scope 记录，并让其他 mock 应用服务为空，既掩盖隔离缺陷，也让服务切换看起来无效。", goal: "所有设计样例通过 MCP 迁移，并为 Designer、Spec Studio、Policy Hub 和 Integration Gateway 提供不同且可查询的资产。", nonGoal: "不扩大普通 Agent 对只读兄弟服务的写权限，也不暴露通用管理绕过。", scope: "使用仅 seed 生效的 system actor、MCP 错误快速失败、显式 architectureScope 和确定性服务样例。",
        specChanges: ["增加仅 seed 使用的 system actor。", "只向 MCP 子进程传递 seed 权限。", "MCP 返回 isError 时立即失败。", "为四个应用服务写入不同资产。", "按 applicationServiceId 验证数据库数量。"], risks: ["seed 标记必须限制在进程内。", "样例必须保持幂等，避免重复资产。"], rolloutPlan: "使用稳定 ID 执行 MCP upsert，并在每次 seed 后核对分服务统计。", rollbackPlan: "移除 seed 专用样例和 actor 选择，重新运行旧 MCP seed；必要时按稳定 ID 删除记录。"
      }
    },
    createdAt: now,
    updatedAt: now
  }
];

export const selfDesignContextPack: ContextPack = {
  id: "ctx-specforge-self-design",
  name: "SpecForge Self-Design Agent Context Pack",
  proposalId: "proposal-specforge-self-design",
  targetAgent: "codex",
  summary: "Implementation context for maintaining SpecForge as an MCP-native design center that manages its own design.",
  includedAssets: [...selfDesignRefs],
  constraints: [
    "Do not duplicate business logic outside packages/core.",
    "Do not expose delete tools or raw database access through MCP.",
    "Do not return raw database errors to MCP clients.",
    "All MCP tool calls must remain auditable."
  ],
  instructions: [
    "Start by reading specforge://proposals/proposal-specforge-self-design.",
    "Use search_design_assets before inventing new asset ids.",
    "Run run_governance_checks after adding or changing assets.",
    "Run pnpm typecheck, pnpm test, and MCP smoke before completion."
  ],
  generatedMarkdown: [
    "# Agent Context Pack",
    "",
    "## Feature Summary",
    "SpecForge manages its own MCP-first architecture as first-class design assets.",
    "",
    "## Business Background",
    "The design center is more useful to agents when the system's own architecture is queryable through the same MCP-native interface.",
    "",
    "## Goals",
    "- Keep SpecForge self-describing.",
    "- Make MCP-first architecture visible in Web and MCP resources.",
    "- Preserve Core Service reuse and audit rules.",
    "",
    "## Constraints and Do-not Rules",
    "- Do not duplicate Core Service logic.",
    "- Do not expose destructive MCP tools by default.",
    "- Do not bypass audit logging for tool calls."
  ].join("\n"),
  createdAt: now
};

export const selfDesignAssetLinks = [
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-assets", relationType: "owns", description: "The platform domain owns the persisted design asset model." },
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-audit", relationType: "owns", description: "The platform domain owns audit logging data." },
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-mcp-registry", relationType: "owns", description: "The platform domain owns MCP registry data." },
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-ai-generation", relationType: "owns", description: "The platform domain owns AI generation request data." },
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-web-workspace", relationType: "owns", description: "The platform domain owns Web workspace state data." },
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "owns", description: "The platform domain owns graph and relation data." },
  { sourceType: "domain", sourceId: "domain-specforge-platform", targetType: "dataModel", targetId: "data-specforge-i18n", relationType: "owns", description: "The platform domain owns i18n catalog data." },
  { sourceType: "api", sourceId: "api-specforge-asset-upsert", targetType: "dataModel", targetId: "data-specforge-assets", relationType: "writes", description: "The asset upsert MCP tool writes DesignAsset rows." },
  { sourceType: "api", sourceId: "api-specforge-proposal-upsert", targetType: "dataModel", targetId: "data-specforge-assets", relationType: "writes", description: "The proposal upsert MCP tool writes Proposal rows." },
  { sourceType: "api", sourceId: "api-specforge-context-pack-upsert", targetType: "dataModel", targetId: "data-specforge-assets", relationType: "writes", description: "The context pack upsert MCP tool writes ContextPack rows." },
  { sourceType: "api", sourceId: "api-specforge-asset-link", targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "writes", description: "The asset link MCP tool writes AssetLink rows." },
  { sourceType: "api", sourceId: "api-specforge-graph-query", targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "reads", description: "The graph resource reads nodes and explicit links." },
  { sourceType: "api", sourceId: "api-specforge-ai-generation", targetType: "dataModel", targetId: "data-specforge-ai-generation", relationType: "reads-writes", description: "The AI generation endpoint consumes provider request and response data." },
  { sourceType: "api", sourceId: "api-specforge-mcp-tools", targetType: "api", targetId: "api-specforge-asset-upsert", relationType: "contains", description: "The MCP tool contract contains the asset upsert tool contract." },
  { sourceType: "api", sourceId: "api-specforge-mcp-tools", targetType: "api", targetId: "api-specforge-proposal-upsert", relationType: "contains", description: "The MCP tool contract contains the proposal upsert tool contract." },
  { sourceType: "api", sourceId: "api-specforge-mcp-tools", targetType: "api", targetId: "api-specforge-context-pack-upsert", relationType: "contains", description: "The MCP tool contract contains the context pack upsert tool contract." },
  { sourceType: "api", sourceId: "api-specforge-mcp-tools", targetType: "api", targetId: "api-specforge-asset-link", relationType: "contains", description: "The MCP tool contract contains the asset relationship tool contract." },
  { sourceType: "api", sourceId: "api-specforge-web-console", targetType: "api", targetId: "api-specforge-ai-generation", relationType: "calls", description: "The Web Console can call AI generation." },
  { sourceType: "api", sourceId: "api-specforge-web-console", targetType: "api", targetId: "api-specforge-graph-query", relationType: "reads", description: "The Web Console displays the graph query result." },
  { sourceType: "event", sourceId: "event-specforge-mcp-tool-called", targetType: "dataModel", targetId: "data-specforge-audit", relationType: "records", description: "MCP tool calls are recorded in audit data." },
  { sourceType: "event", sourceId: "event-specforge-design-asset-upserted", targetType: "api", targetId: "api-specforge-asset-upsert", relationType: "emitted-by", description: "Asset upsert emits the design asset upserted event." },
  { sourceType: "event", sourceId: "event-specforge-asset-link-created", targetType: "api", targetId: "api-specforge-asset-link", relationType: "emitted-by", description: "Asset link writes emit the asset link created event." },
  { sourceType: "event", sourceId: "event-specforge-governance-check-completed", targetType: "api", targetId: "api-specforge-mcp-tools", relationType: "emitted-by", description: "Governance tool calls complete with a governance check event." },
  { sourceType: "businessRule", sourceId: "rule-specforge-core-service-reuse", targetType: "api", targetId: "api-specforge-web-console", relationType: "governs", description: "The core reuse rule governs Web API composition." },
  { sourceType: "businessRule", sourceId: "rule-specforge-core-service-reuse", targetType: "api", targetId: "api-specforge-mcp-tools", relationType: "governs", description: "The core reuse rule governs MCP tool composition." },
  { sourceType: "businessRule", sourceId: "rule-specforge-mcp-write-audit", targetType: "api", targetId: "api-specforge-asset-upsert", relationType: "governs", description: "Asset upsert writes must be audited." },
  { sourceType: "businessRule", sourceId: "rule-specforge-mcp-write-audit", targetType: "api", targetId: "api-specforge-proposal-upsert", relationType: "governs", description: "Proposal upsert writes must be audited." },
  { sourceType: "businessRule", sourceId: "rule-specforge-mcp-write-audit", targetType: "api", targetId: "api-specforge-context-pack-upsert", relationType: "governs", description: "Context pack upsert writes must be audited." },
  { sourceType: "businessRule", sourceId: "rule-specforge-seed-through-mcp", targetType: "api", targetId: "api-specforge-asset-upsert", relationType: "requires", description: "Seed import must call the asset upsert MCP tool." },
  { sourceType: "businessRule", sourceId: "rule-specforge-seed-through-mcp", targetType: "api", targetId: "api-specforge-asset-link", relationType: "requires", description: "Seed import must call the asset link MCP tool." },
  { sourceType: "businessRule", sourceId: "rule-specforge-relationships-required", targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "governs", description: "Relationship completeness is enforced through graph data." },
  { sourceType: "stateMachine", sourceId: "sm-specforge-proposal-lifecycle", targetType: "api", targetId: "api-specforge-proposal-upsert", relationType: "uses", description: "Proposal lifecycle state is persisted through proposal upsert." },
  { sourceType: "stateMachine", sourceId: "sm-specforge-context-pack-generation", targetType: "api", targetId: "api-specforge-context-pack-upsert", relationType: "uses", description: "Context pack lifecycle state is persisted through context pack upsert." },
  { sourceType: "integration", sourceId: "integration-specforge-mcp-agent", targetType: "api", targetId: "api-specforge-mcp-tools", relationType: "connects-to", description: "AI agents connect through the MCP tool contract." },
  { sourceType: "quality", sourceId: "quality-specforge-mcp-smoke", targetType: "api", targetId: "api-specforge-mcp-tools", relationType: "verifies", description: "MCP smoke verifies the tool surface." },
  { sourceType: "quality", sourceId: "quality-specforge-impact-ready", targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "verifies", description: "Impact readiness verifies graph relation completeness." },
  { sourceType: "observability", sourceId: "obs-specforge-mcp-audit", targetType: "dataModel", targetId: "data-specforge-audit", relationType: "observes", description: "MCP observability watches audit data and tool outcomes." },
  { sourceType: "adr", sourceId: "adr-mcp-first-architecture", targetType: "api", targetId: "api-specforge-mcp-tools", relationType: "decides", description: "The ADR chooses MCP as the primary agent interface." },
  { sourceType: "proposal", sourceId: "proposal-specforge-self-design", targetType: "api", targetId: "api-specforge-asset-upsert", relationType: "impacts", description: "The self-design proposal impacts asset upsert behavior." },
  { sourceType: "proposal", sourceId: "proposal-specforge-self-design", targetType: "dataModel", targetId: "data-specforge-asset-graph", relationType: "impacts", description: "The self-design proposal impacts graph data." },
  { sourceType: "contextPack", sourceId: "ctx-specforge-self-design", targetType: "proposal", targetId: "proposal-specforge-self-design", relationType: "implements-context-for", description: "The context pack implements agent context for the self-design proposal." }
] as const;
