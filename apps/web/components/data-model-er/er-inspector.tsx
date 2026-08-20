"use client";

import type { DataModelGraphResponse } from "@specforge/core";
import { useRouter, useSearchParams } from "next/navigation";
import { mergeErGraphResponses, relationGroups } from "./er-graph-store";

export function ErInspector({ response, locale }: { response?: DataModelGraphResponse; locale: "en" | "zh" }) {
  const router = useRouter();
  const params = useSearchParams();
  if (!response) return <aside className="border-t border-border p-4 text-sm text-muted">{locale === "zh" ? "正在读取当前 Scope 的关系事实…" : "Reading relationship facts for the current Scope…"}</aside>;
  const snapshot = mergeErGraphResponses([response]);
  const selectedId = params.get("selection") ?? snapshot.nodes[0]?.id;
  const selected = snapshot.nodes.find((node) => node.id === selectedId) ?? snapshot.nodes[0];
  const selectedEdges = selected ? snapshot.edges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];
  const groups = relationGroups(selectedEdges);
  const copy = locale === "zh"
    ? { title: "事实检查器", empty: "选择一个实体或字段查看详情。", model: "所属模型", type: "类型", id: "稳定 ID", relation: "关系组", mapping: "映射", waterline: "快照水位", partial: "结果为已验证子集", errors: "读取问题" }
    : { title: "Fact inspector", empty: "Select an entity or field to inspect its facts.", model: "Owning model", type: "Type", id: "Stable ID", relation: "Relationship groups", mapping: "Mapping", waterline: "Snapshot waterline", partial: "Verified subset only", errors: "Read issues" };

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("selection", id);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  return <aside className="border-t border-border bg-white p-4" aria-label={copy.title}>
    <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.2fr)]">
      <div>
        <h3 className="text-sm font-semibold text-ink">{copy.title}</h3>
        <div className="mt-3 max-h-56 space-y-1 overflow-auto" role="listbox" aria-label={copy.title}>
          {snapshot.nodes.map((node) => <button className={node.id === selected?.id ? "block w-full rounded-md bg-surface px-3 py-2 text-left text-xs font-semibold text-ink" : "block w-full rounded-md px-3 py-2 text-left text-xs text-muted hover:bg-surface"} key={node.id} onClick={() => select(node.id)} type="button"><span className="block truncate">{node.displayName}</span><span className="font-mono text-[10px] opacity-70">{node.nodeType}</span></button>)}
        </div>
      </div>
      <div className="min-w-0 text-xs text-muted">
        {selected ? <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2"><dt>{copy.type}</dt><dd className="font-medium text-ink">{selected.nodeType}</dd><dt>{copy.id}</dt><dd className="break-all font-mono text-ink">{selected.logicalId}</dd><dt>{copy.model}</dt><dd className="break-all font-mono text-ink">{selected.rootModelId}</dd></dl>
          <h4 className="mt-4 font-semibold text-ink">{copy.relation}</h4>
          {groups.size ? <div className="mt-2 space-y-2">{[...groups.entries()].map(([groupId, edges]) => <div className="rounded-md border border-border p-2" key={groupId}><div className="font-mono text-[10px] text-ink">{groupId}</div>{edges.map((edge) => <div className="mt-1 flex justify-between gap-3" key={edge.id}><span>{edge.relationshipCode}</span><span>{edge.mappingIndex !== undefined ? `${copy.mapping} ${edge.mappingIndex + 1}/${edge.mappingCount ?? "?"}` : "-"}</span></div>)}</div>)}</div> : <p className="mt-2">{copy.empty}</p>}
        </> : <p>{copy.empty}</p>}
        <div className="mt-4 rounded-md bg-surface p-3"><div className="font-semibold text-ink">{copy.waterline}</div><div className="mt-1 font-mono text-[10px]">catalog {response.waterlines.catalogVersion} · relationship {response.waterlines.relationshipVersion}</div>{response.partial ? <div className="mt-2 text-amber-700">{copy.partial}</div> : null}</div>
        {response.errors.length ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3"><div className="font-semibold text-amber-900">{copy.errors}</div>{response.errors.map((error) => <div className="mt-1" key={error.code}>{locale === "zh" ? error.message.zh : error.message.en}</div>)}</div> : null}
      </div>
    </div>
  </aside>;
}
