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
} from "../types";

const now = "2026-07-10T00:00:00.000Z";

const selfDesignRefs = [
  { type: "domain", id: "domain-specforge-platform", label: "SpecForge Platform Domain" },
  { type: "dataModel", id: "data-specforge-assets", label: "SpecForge Design Asset Data Model" },
  { type: "dataModel", id: "data-specforge-audit", label: "SpecForge AuditLog Data Model" },
  { type: "api", id: "api-specforge-web-console", label: "SpecForge Web Console API Contract" },
  { type: "api", id: "api-specforge-mcp-tools", label: "SpecForge MCP Tool Contract" },
  { type: "event", id: "event-specforge-context-pack-generated", label: "ContextPackGenerated Event Contract" },
  { type: "event", id: "event-specforge-mcp-tool-called", label: "McpToolCalled Event Contract" },
  { type: "businessRule", id: "rule-specforge-core-service-reuse", label: "Web and MCP must reuse Core Service" },
  { type: "businessRule", id: "rule-specforge-mcp-write-audit", label: "MCP write tools must be audited" },
  { type: "stateMachine", id: "sm-specforge-proposal-lifecycle", label: "SpecForge Proposal Lifecycle" },
  { type: "stateMachine", id: "sm-specforge-context-pack-generation", label: "SpecForge Context Pack Generation Lifecycle" },
  { type: "integration", id: "integration-specforge-mcp-agent", label: "AI Agent to SpecForge MCP Integration" },
  { type: "quality", id: "quality-specforge-mcp-smoke", label: "SpecForge MCP Smoke Quality Requirement" },
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
    description: "Defines the MCP tool-call boundary for agents interacting with SpecForge design assets and workflows.",
    domainId: "domain-specforge-platform",
    providerSystem: "SpecForge MCP Server",
    consumers: ["Codex", "Claude Code", "Cursor", "Copilot", "Generic MCP Client"],
    requestSchema: { name: "string", arguments: "object" },
    responseSchema: { content: "Array<{type:'text',text:string}>", isError: "boolean?" },
    errorCodes: ["TOOL_VALIDATION_FAILED", "ASSET_NOT_FOUND", "GOVERNANCE_CHECK_FAILED"],
    authType: "allowAllPolicy MVP; future OAuth/RBAC",
    idempotency: "Read tools are idempotent; write tools are audited and validated.",
    rateLimit: "Reserved for Streamable HTTP deployment",
    timeout: "10s per tool call",
    compatibilityPolicy: "Tool names and required arguments are stable within an MVP release.",
    openapiSpec: "MCP protocol schema; stdio transport in MVP",
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
    examples: ["create_proposal is audited", "generate_context_pack is audited", "run_governance_checks is audited"],
    relatedAssets: [
      { type: "dataModel", id: "data-specforge-audit", label: "SpecForge AuditLog Data Model" },
      { type: "event", id: "event-specforge-mcp-tool-called", label: "McpToolCalled Event Contract" }
    ],
    severity: "high",
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
  target: "MCP smoke verifies 10 tools, resources, templates, prompts, search, context pack generation, and governance checks.",
  measurement: "pnpm --filter @specforge/mcp-server smoke",
  priority: "high",
  verificationMethod: "Run smoke test after MCP tool/resource/prompt changes.",
  createdAt: now,
  updatedAt: now
};

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
  name: "Make SpecForge manage its own design",
  title: "Make SpecForge manage its own MCP-first design",
  description: "Write SpecForge Design Center's own architecture, MCP surface, governance rules, and implementation context into SpecForge as first-class design assets.",
  domainId: "domain-specforge-platform",
  background: "SpecForge should be self-describing: agents should be able to query SpecForge for the design of SpecForge itself rather than relying only on external docs.",
  goal: "Represent SpecForge's MCP-first design as domain, data, API, event, rule, state-machine, integration, quality, observability, ADR, proposal, and context pack assets.",
  nonGoal: "Do not replace docs/specforge-design-center-spec.md; the design assets complement the spec and make it queryable through Web and MCP.",
  scope: "Core seed data, MCP search, Context Pack generation, governance visibility, and Web asset browsing.",
  impactedAssets: [...selfDesignRefs],
  specChanges: [
    "Add SpecForge Platform Domain",
    "Add MCP Tool and Web Console contracts",
    "Add Core Service reuse and MCP audit rules",
    "Add SpecForge lifecycle state machines",
    "Add ADR for MCP-first architecture"
  ],
  risks: ["high: self-design assets can drift from implementation if tests and docs are not maintained together"],
  rolloutPlan: "Add seed assets, verify search and context pack generation, then expose them through Web and MCP automatically.",
  rollbackPlan: "Remove self-design seed module import and keep external spec documentation only.",
  status: "approved",
  createdAt: now,
  updatedAt: now
};

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
