import type { ArchitectureScopeRef } from "./architecture/types";

export type AssetType =
  | "domain"
  | "dataModel"
  | "api"
  | "event"
  | "businessRule"
  | "stateMachine"
  | "integration"
  | "quality"
  | "observability"
  | "adr"
  | "proposal"
  | "contextPack";

export type AssetLocale = "zh" | "en";
export type LocalizedContent = Partial<Record<AssetLocale, Partial<Record<string, unknown>>>>;

export type GovernanceSeverity = "info" | "warning" | "error";
export type GovernanceStatus = "pass" | "fail";
export type AuditActorType = "user" | "agent" | "system";
export type AuditChannel = "web" | "mcp" | "api";
export type AuditStatus = "success" | "failed";
export type Permission =
  | "asset:read"
  | "asset:write"
  | "proposal:read"
  | "proposal:write"
  | "context-pack:generate"
  | "governance:run"
  | "adr:write"
  | "graph:read";

export interface BaseAsset {
  id: string;
  name: string;
  description: string;
  domainId?: string;
  createdAt: string;
  updatedAt: string;
  architectureScope?: ArchitectureScopeRef;
  localizedContent?: LocalizedContent;
}

export interface DomainModel extends BaseAsset {
  code: string;
  boundedContext: string;
  owner: string;
  entities: string[];
  valueObjects: string[];
  domainServices: string[];
  businessCapabilities: string[];
  glossaryTerms: string[];
}

export interface DataField {
  fieldName: string;
  displayName: string;
  dataType: string;
  meaning?: string;
  nullable: boolean;
  defaultValue?: string;
  constraint?: string;
  sensitiveLevel?: "none" | "internal" | "confidential" | "restricted";
  classification?: string;
  example?: string;
  owner: string;
}

export interface DataModel extends BaseAsset {
  code: string;
  modelType: "conceptual" | "logical" | "physical";
  domainId: string;
  tables: string[];
  entities: string[];
  fields: DataField[];
  relationships: string[];
  constraints: string[];
  dataClassification: string;
  lifecycle: string;
  lineage: string;
}

export interface ApiContract extends BaseAsset {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  domainId: string;
  providerSystem: string;
  consumers: string[];
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
  errorCodes: string[];
  authType?: string;
  idempotency?: string;
  rateLimit?: string;
  timeout?: string;
  compatibilityPolicy?: string;
  openapiSpec: string;
  exposure: "internal" | "external";
}

export interface EventContract extends BaseAsset {
  topic: string;
  eventType: string;
  domainId: string;
  producer?: string;
  consumers: string[];
  schema: Record<string, unknown>;
  triggerTiming: string;
  idempotencyKey?: string;
  orderingRequirement?: string;
  retryPolicy?: string;
  deadLetterPolicy?: string;
  compatibilityPolicy?: string;
}

export interface BusinessRule extends BaseAsset {
  code: string;
  domainId: string;
  ruleType: "calculation" | "validation" | "permission" | "state-transition" | "amount" | "time" | "exception";
  condition?: string;
  action: string;
  exception?: string;
  examples: string[];
  relatedAssets: AssetRef[];
  severity: "low" | "medium" | "high";
}

export interface StateTransition {
  from: string;
  to: string;
  trigger: string;
  condition?: string;
  action?: string;
  emitsEvent?: string;
  idempotent: boolean;
  failureHandling?: string;
}

export interface StateMachine extends BaseAsset {
  domainId: string;
  states: string[];
  transitions: StateTransition[];
  initialState: string;
  terminalStates: string[];
  events: string[];
  guards: string[];
  actions: string[];
}

export interface IntegrationContract extends BaseAsset {
  sourceSystem: string;
  targetSystem: string;
  protocol: string;
  dataMapping: string;
  errorMapping: string;
  sla: string;
  timeout: string;
  retryStrategy: string;
  fallbackStrategy: string;
  circuitBreaker: string;
  owner: string;
}

export interface QualityRequirement extends BaseAsset {
  assetType: AssetType;
  assetId: string;
  category: "performance" | "availability" | "security" | "privacy" | "observability" | "compliance" | "scalability" | "reliability";
  target: string;
  measurement: string;
  priority: "low" | "medium" | "high";
  verificationMethod: string;
}

export interface ObservabilityDesign extends BaseAsset {
  assetType: AssetType;
  assetId: string;
  metrics: string[];
  logs: string[];
  traces: string[];
  alerts: string[];
  dashboards: string[];
  runbook: string;
  slo: string;
}

export interface Adr extends BaseAsset {
  title: string;
  status: "proposed" | "accepted" | "deprecated" | "superseded";
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  constraints: string[];
  relatedAssets: AssetRef[];
  owner: string;
}

export interface Proposal extends BaseAsset {
  title: string;
  background: string;
  goal: string;
  nonGoal: string;
  scope: string;
  impactedAssets: AssetRef[];
  specChanges: string[];
  risks: string[];
  rolloutPlan: string;
  rollbackPlan?: string;
  status: "draft" | "reviewing" | "approved" | "implemented" | "archived";
}

export interface ContextPack {
  id: string;
  name: string;
  proposalId: string;
  targetAgent: string;
  summary: string;
  includedAssets: AssetRef[];
  constraints: string[];
  instructions: string[];
  generatedMarkdown: string;
  createdAt: string;
  architectureScope?: ArchitectureScopeRef;
  localizedContent?: LocalizedContent;
}

export interface AssetRef {
  type: AssetType;
  id: string;
  label: string;
}

export interface AssetLink {
  id: string;
  sourceType: AssetType;
  sourceId: string;
  targetType: AssetType;
  targetId: string;
  relationType: string;
  description?: string;
  createdAt: string;
  architectureScope?: ArchitectureScopeRef;
}

export interface GovernanceCheckResult {
  ruleCode: string;
  ruleName: string;
  severity: GovernanceSeverity;
  status: GovernanceStatus;
  assetType: AssetType;
  assetId: string;
  reason: string;
  suggestion: string;
}

export interface AssetGraphNode {
  id: string;
  label: string;
  type: AssetType;
  domainId?: string;
  summary: string;
}

export interface AssetGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface AssetGraph {
  nodes: AssetGraphNode[];
  edges: AssetGraphEdge[];
}

export interface AuditLog {
  id: string;
  actorType: AuditActorType;
  actorId: string;
  channel: AuditChannel;
  action: string;
  targetType: string;
  targetId: string;
  inputSummary: string;
  outputSummary: string;
  status: AuditStatus;
  errorMessage?: string;
  createdAt: string;
}

export interface ImpactAnalysis {
  proposalId: string;
  impactedAssetCount: number;
  impactedAssets: AssetRef[];
  affectedDomains: string[];
  riskLevel: "low" | "medium" | "high";
  requiredContextPack: boolean;
  governanceWarnings: GovernanceCheckResult[];
  implementationTasks: string[];
  affectedArchitectureScopes?: ArchitectureScopeRef[];
}

export interface SpecForgeDataStore {
  domains: DomainModel[];
  dataModels: DataModel[];
  apis: ApiContract[];
  events: EventContract[];
  businessRules: BusinessRule[];
  stateMachines: StateMachine[];
  integrations: IntegrationContract[];
  qualityRequirements: QualityRequirement[];
  observabilityDesigns: ObservabilityDesign[];
  adrs: Adr[];
  proposals: Proposal[];
  contextPacks: ContextPack[];
  auditLogs?: AuditLog[];
}

export type Asset =
  | DomainModel
  | DataModel
  | ApiContract
  | EventContract
  | BusinessRule
  | StateMachine
  | IntegrationContract
  | QualityRequirement
  | ObservabilityDesign
  | Adr
  | Proposal
  | ContextPack;
