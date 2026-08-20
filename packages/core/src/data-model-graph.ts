import type { ArchitectureScopeRef } from "./architecture/types";

export type DataModelGraphMode = "MODEL" | "SCOPE";
export type DataModelGraphNodeType = "dataModel" | "dataEntity" | "dataField";

export interface DataModelGraphFilters {
  nodeTypes?: DataModelGraphNodeType[];
  relationshipCodes?: string[];
  search?: string;
  rootModelId?: string;
}

export interface DataModelGraphQuery {
  architectureScope: ArchitectureScopeRef;
  subject: string;
  mode: DataModelGraphMode;
  rootModelId?: string;
  filters?: DataModelGraphFilters;
  locale?: "en" | "zh";
  cursor?: string;
  pageSize?: number;
  clientCapacity?: number;
}

export interface DataModelGraphWaterlines {
  catalogVersion: string;
  catalogDigest: string;
  relationshipVersion: string;
  relationshipDigest: string;
}

export interface DataModelGraphNode {
  id: string;
  nodeType: DataModelGraphNodeType;
  logicalId: string;
  rootModelId: string;
  displayName: string;
  description?: string;
  external?: boolean;
  scope: ArchitectureScopeRef;
  metadata: Record<string, unknown>;
}

export interface DataModelGraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipCode: string;
  sourceReference?: string;
  metadata: Record<string, unknown>;
}

export type DataModelGraphErrorCode =
  | "SCOPE_UNAVAILABLE"
  | "CURSOR_INVALID"
  | "SNAPSHOT_CHANGED"
  | "ENDPOINT_NOT_FOUND"
  | "DATA_MODEL_UPGRADE_REQUIRED"
  | "FIELD_OWNERSHIP_AMBIGUOUS"
  | "CLIENT_CAPACITY_EXCEEDED"
  | "PARTIAL";

export interface DataModelGraphError {
  code: DataModelGraphErrorCode;
  message: { en: string; zh: string };
  details?: Record<string, unknown>;
}

export interface DataModelGraphResponse {
  architectureScope: ArchitectureScopeRef;
  mode: DataModelGraphMode;
  rootModelId?: string;
  nodes: DataModelGraphNode[];
  edges: DataModelGraphEdge[];
  waterlines: DataModelGraphWaterlines;
  nextCursor?: string;
  hasMore: boolean;
  partial: boolean;
  errors: DataModelGraphError[];
}

export interface DataModelGraphCursorPayload {
  version: 1;
  subject: string;
  architectureScope: ArchitectureScopeRef;
  mode: DataModelGraphMode;
  rootModelId?: string;
  filters: Required<Pick<DataModelGraphFilters, "nodeTypes" | "relationshipCodes" | "search">> & { rootModelId?: string };
  pageSize: number;
  clientCapacity: number;
  waterlines: DataModelGraphWaterlines;
  afterNode?: string;
  afterEdge?: string;
}

export const DATA_MODEL_GRAPH_MAX_PAGE_SIZE = 200;
export const DATA_MODEL_GRAPH_DEFAULT_PAGE_SIZE = 50;
export const DATA_MODEL_GRAPH_DEFAULT_CLIENT_CAPACITY = 5000;
export const DATA_MODEL_GRAPH_MAX_CLIENT_CAPACITY = 10000;

export function normalizeDataModelGraphFilters(filters: DataModelGraphFilters = {}): DataModelGraphCursorPayload["filters"] {
  return {
    nodeTypes: [...new Set(filters.nodeTypes ?? [])].sort(compareStable),
    relationshipCodes: [...new Set(filters.relationshipCodes ?? [])].sort(compareStable),
    search: (filters.search ?? "").trim().toLocaleLowerCase("en-US"),
    ...(filters.rootModelId ? { rootModelId: filters.rootModelId } : {})
  };
}

export function normalizeDataModelGraphPaging(query: Pick<DataModelGraphQuery, "pageSize" | "clientCapacity">): { pageSize: number; clientCapacity: number } {
  const pageSize = query.pageSize ?? DATA_MODEL_GRAPH_DEFAULT_PAGE_SIZE;
  const clientCapacity = query.clientCapacity ?? DATA_MODEL_GRAPH_DEFAULT_CLIENT_CAPACITY;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DATA_MODEL_GRAPH_MAX_PAGE_SIZE) throw new Error("CLIENT_CAPACITY_EXCEEDED");
  if (!Number.isInteger(clientCapacity) || clientCapacity < 1 || clientCapacity > DATA_MODEL_GRAPH_MAX_CLIENT_CAPACITY) throw new Error("CLIENT_CAPACITY_EXCEEDED");
  return { pageSize, clientCapacity };
}

export function stableNodeKey(node: Pick<DataModelGraphNode, "nodeType" | "logicalId">): string {
  return `${node.nodeType}:${node.logicalId}`;
}

export function stableEdgeKey(edge: Pick<DataModelGraphEdge, "relationshipCode" | "source" | "target" | "id">): string {
  return `${edge.relationshipCode}:${edge.source}:${edge.target}:${edge.id}`;
}

export function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function graphError(code: DataModelGraphErrorCode, details?: Record<string, unknown>): DataModelGraphError {
  const messages: Record<DataModelGraphErrorCode, { en: string; zh: string }> = {
    SCOPE_UNAVAILABLE: { en: "The requested application-service Scope is unavailable.", zh: "请求的应用服务 Scope 不可用。" },
    CURSOR_INVALID: { en: "The graph cursor is invalid or does not match this query.", zh: "图谱游标无效，或与当前查询不匹配。" },
    SNAPSHOT_CHANGED: { en: "The graph snapshot changed while paging.", zh: "分页期间图谱快照发生了变化。" },
    ENDPOINT_NOT_FOUND: { en: "A relationship endpoint could not be resolved.", zh: "无法解析关系端点。" },
    DATA_MODEL_UPGRADE_REQUIRED: { en: "The data model must be upgraded before graph reads can be complete.", zh: "数据模型必须升级后才能完整读取图谱。" },
    FIELD_OWNERSHIP_AMBIGUOUS: { en: "A field has ambiguous entity ownership.", zh: "字段的实体归属不明确。" },
    CLIENT_CAPACITY_EXCEEDED: { en: "The requested graph exceeds the declared client capacity.", zh: "请求的图谱超过客户端声明的容量。" },
    PARTIAL: { en: "Only a verified subset of the graph is available.", zh: "当前仅提供已验证的图谱子集。" }
  };
  return { code, message: messages[code], ...(details ? { details } : {}) };
}
