import { NextResponse } from "next/server";
import { getApiRequestLocale } from "../../../lib/locale";
import { resolveRequestPrincipal } from "../../../lib/request-principal";
import { DataModelGraphReadError, getDataModelGraph } from "../../../lib/data-model-graph";
import type { DataModelGraphFilters, DataModelGraphMode, DataModelGraphNodeType } from "@specforge/core";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const applicationServiceId = url.searchParams.get("scope") ?? request.headers.get("x-specforge-application-service-id") ?? "";
    const scopePath = url.searchParams.get("scopePath") ?? request.headers.get("x-specforge-scope-path") ?? "";
    const principal = await resolveRequestPrincipal(request);
    const filters: DataModelGraphFilters = {
      nodeTypes: splitParam(url.searchParams.get("nodeTypes")) as DataModelGraphNodeType[] | undefined,
      relationshipCodes: splitParam(url.searchParams.get("relationshipCodes")),
      search: url.searchParams.get("search") ?? undefined,
      rootModelId: url.searchParams.get("rootModelId") ?? undefined
    };
    const response = await getDataModelGraph({
      architectureScope: { applicationServiceId, scopePath },
      subject: request.headers.get("x-specforge-subject") ?? principal.subject,
      mode: (url.searchParams.get("mode") === "MODEL" ? "MODEL" : "SCOPE") as DataModelGraphMode,
      rootModelId: url.searchParams.get("rootModelId") ?? undefined,
      filters,
      locale: getApiRequestLocale(request),
      cursor: url.searchParams.get("cursor") ?? undefined,
      pageSize: numberParam(url.searchParams.get("pageSize")),
      clientCapacity: numberParam(url.searchParams.get("clientCapacity"))
    }, principal);
    return NextResponse.json(response);
  } catch (error) {
    const code = error instanceof DataModelGraphReadError ? error.code : error instanceof Error && error.message === "CLIENT_CAPACITY_EXCEEDED" ? "CLIENT_CAPACITY_EXCEEDED" : "SCOPE_UNAVAILABLE";
    const status = code === "CURSOR_INVALID" ? 400 : code === "SNAPSHOT_CHANGED" ? 409 : 403;
    const messages: Record<string, { en: string; zh: string }> = { SCOPE_UNAVAILABLE: { en: "The requested application-service Scope is unavailable.", zh: "请求的应用服务 Scope 不可用。" }, CURSOR_INVALID: { en: "The graph cursor is invalid or does not match this query.", zh: "图谱游标无效，或与当前查询不匹配。" }, SNAPSHOT_CHANGED: { en: "The graph snapshot changed while paging.", zh: "分页期间图谱快照发生了变化。" }, CLIENT_CAPACITY_EXCEEDED: { en: "The requested graph exceeds the declared client capacity.", zh: "请求的图谱超过客户端声明的容量。" } };
    return NextResponse.json({ error: { code, message: messages[code] ?? messages.SCOPE_UNAVAILABLE } }, { status });
  }
}

function splitParam(value: string | null): string[] | undefined { return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : undefined; }
function numberParam(value: string | null): number | undefined { if (!value) return undefined; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : undefined; }
