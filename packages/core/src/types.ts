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

export interface DerivedViewOptions {
  catalog?: SpecForgeDataStore;
  locale?: AssetLocale;
}

export interface LocalizedContent<TZh extends object, TEn extends object = TZh> {
  zh?: TZh;
  en?: TEn;
}

export interface BaseAssetLocalizedFields {
  name: string;
  description: string;
}

export interface DomainModelLocalizedFields extends BaseAssetLocalizedFields {
  entities: string[];
  valueObjects: string[];
  domainServices: string[];
  businessCapabilities: string[];
  glossaryTerms: string[];
}

export interface DataFieldLocalizedFields {
  displayName: string;
  meaning?: string;
  constraint?: string;
  classification?: string;
  example?: string;
}

export interface DataModelLocalizedFields extends BaseAssetLocalizedFields {
  relationships: string[];
  constraints: string[];
  lifecycle: string;
  lineage: string;
  fields: Record<string, DataFieldLocalizedFields>;
}

export interface ApiContractLocalizedFields extends BaseAssetLocalizedFields {
  authType?: string;
  idempotency?: string;
  rateLimit?: string;
  timeout?: string;
  compatibilityPolicy?: string;
}

export interface EventContractLocalizedFields extends BaseAssetLocalizedFields {
  triggerTiming: string;
  orderingRequirement?: string;
  retryPolicy?: string;
  deadLetterPolicy?: string;
  compatibilityPolicy?: string;
}

export interface BusinessRuleLocalizedFields extends BaseAssetLocalizedFields {
  condition?: string;
  action: string;
  exception?: string;
  examples: string[];
}

export interface StateTransitionLocalizedFields {
  condition?: string;
  action?: string;
  failureHandling?: string;
}

export interface StateMachineLocalizedFields extends BaseAssetLocalizedFields {
  states: Record<string, string>;
  events: Record<string, string>;
  guards: string[];
  actions: string[];
  transitions: Record<string, StateTransitionLocalizedFields>;
}

export interface IntegrationContractLocalizedFields extends BaseAssetLocalizedFields {
  dataMapping: string;
  errorMapping: string;
  sla: string;
  timeout: string;
  retryStrategy: string;
  fallbackStrategy: string;
  circuitBreaker: string;
}

export interface QualityRequirementLocalizedFields extends BaseAssetLocalizedFields {
  target: string;
  measurement: string;
  verificationMethod: string;
}

export interface ObservabilityDesignLocalizedFields extends BaseAssetLocalizedFields {
  alerts: string[];
  dashboards: string[];
  runbook: string;
  slo: string;
}

export interface AdrLocalizedFields extends BaseAssetLocalizedFields {
  title: string;
  context: string;
  decision: string;
  alternatives: string[];
  consequences: string[];
  constraints: string[];
}

export interface ProposalLocalizedFields extends BaseAssetLocalizedFields {
  title: string;
  background: string;
  goal: string;
  nonGoal: string;
  scope: string;
  specChanges: string[];
  risks: string[];
  rolloutPlan: string;
  rollbackPlan?: string;
}

export interface ContextPackLocalizedFields {
  name: string;
  summary: string;
  constraints: string[];
  instructions: string[];
  generatedMarkdown: string;
}

export interface AssetLocalizedContentMap {
  domain: LocalizedContent<DomainModelLocalizedFields>;
  dataModel: LocalizedContent<DataModelLocalizedFields>;
  api: LocalizedContent<ApiContractLocalizedFields>;
  event: LocalizedContent<EventContractLocalizedFields>;
  businessRule: LocalizedContent<BusinessRuleLocalizedFields>;
  stateMachine: LocalizedContent<StateMachineLocalizedFields>;
  integration: LocalizedContent<IntegrationContractLocalizedFields>;
  quality: LocalizedContent<QualityRequirementLocalizedFields>;
  observability: LocalizedContent<ObservabilityDesignLocalizedFields>;
  adr: LocalizedContent<AdrLocalizedFields>;
  proposal: LocalizedContent<ProposalLocalizedFields>;
  contextPack: LocalizedContent<ContextPackLocalizedFields>;
}

export type GovernanceSeverity = "info" | "warning" | "error";
export type GovernanceStatus = "pass" | "fail";
export type GovernanceMessageParamValue = string | string[];
export type GovernanceMessageParams = Record<string, GovernanceMessageParamValue>;
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

export interface BaseAsset<TLocalizedFields extends object = BaseAssetLocalizedFields> {
  id: string;
  name: string;
  description: string;
  domainId?: string;
  createdAt: string;
  updatedAt: string;
  architectureScope?: ArchitectureScopeRef;
  localizedContent?: LocalizedContent<TLocalizedFields>;
}

export interface DomainModel extends BaseAsset<DomainModelLocalizedFields> {
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

export interface DataModel extends BaseAsset<DataModelLocalizedFields> {
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

export interface ApiContract extends BaseAsset<ApiContractLocalizedFields> {
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

export interface EventContract extends BaseAsset<EventContractLocalizedFields> {
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

export interface BusinessRule extends BaseAsset<BusinessRuleLocalizedFields> {
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

export interface StateMachine extends BaseAsset<StateMachineLocalizedFields> {
  domainId: string;
  states: string[];
  transitions: StateTransition[];
  initialState: string;
  terminalStates: string[];
  events: string[];
  guards: string[];
  actions: string[];
}

export interface IntegrationContract extends BaseAsset<IntegrationContractLocalizedFields> {
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

export interface QualityRequirement extends BaseAsset<QualityRequirementLocalizedFields> {
  assetType: AssetType;
  assetId: string;
  category: "performance" | "availability" | "security" | "privacy" | "observability" | "compliance" | "scalability" | "reliability";
  target: string;
  measurement: string;
  priority: "low" | "medium" | "high";
  verificationMethod: string;
}

export interface ObservabilityDesign extends BaseAsset<ObservabilityDesignLocalizedFields> {
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

export interface Adr extends BaseAsset<AdrLocalizedFields> {
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

export interface Proposal extends BaseAsset<ProposalLocalizedFields> {
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
  localizedContent?: LocalizedContent<ContextPackLocalizedFields>;
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
  messageParams?: GovernanceMessageParams;
}

export interface AssetGraphNode {
  id: string;
  logicalId?: string;
  label: string;
  type: AssetType;
  domainId?: string;
  summary: string;
  applicationServiceId?: string;
  architectureScope?: ArchitectureScopeRef;
}

export interface AssetGraphEdge {
  id: string;
  source: string;
  target: string;
  sourceLogicalId?: string;
  targetLogicalId?: string;
  label: string;
  applicationServiceId?: string;
  architectureScope?: ArchitectureScopeRef;
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

export interface AssetTypeMap {
  domain: DomainModel;
  dataModel: DataModel;
  api: ApiContract;
  event: EventContract;
  businessRule: BusinessRule;
  stateMachine: StateMachine;
  integration: IntegrationContract;
  quality: QualityRequirement;
  observability: ObservabilityDesign;
  adr: Adr;
  proposal: Proposal;
  contextPack: ContextPack;
}

export type Asset = AssetTypeMap[AssetType];
