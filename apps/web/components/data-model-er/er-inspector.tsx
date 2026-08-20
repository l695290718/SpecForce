"use client";

import type { DataModelGraphResponse } from "@specforge/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { translate, type Locale } from "../../lib/i18n";
import { projectErDiagram, type ErEntityCard, type ErFieldRow, type ErRelationGroup } from "./er-diagram-projection";

export function ErInspector({ response, locale }: { response?: DataModelGraphResponse; locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const copy = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const projection = useMemo(() => response ? projectErDiagram(response) : undefined, [response]);

  if (!response || !projection) return <aside className="border-t border-border p-4 text-sm text-muted" role="status">{copy("er.scopeUnavailable")}</aside>;

  const selectedId = params.get("selection") ?? projection.entities[0]?.id;
  const selectedEntity = projection.entities.find((entity) => entity.id === selectedId) ?? projection.entities[0];
  const selectedField = projection.entities.flatMap((entity) => entity.fields).find((field) => field.id === selectedId);
  const selectedRelation = projection.relations.find((relation) => relation.id === selectedId || relation.relationId === selectedId);
  const selectedRelations = projection.relations.filter((relation) => selectedRelation?.id === relation.id || relationTouches(relation, selectedEntity?.id, selectedField?.id));

  function select(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("selection", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return <aside className="border-t border-border bg-white p-4" aria-label={copy("er.inspector")}>
    <div className="grid gap-4 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(18rem,1.2fr)]">
      <div>
        <h3 className="text-sm font-semibold text-ink">{copy("er.inspector")}</h3>
        <div className="mt-3 max-h-56 space-y-1 overflow-auto" role="listbox" aria-label={copy("er.inspector")}>
          {projection.entities.map((entity) => <div key={entity.id}>
            <button className={entity.id === selectedEntity?.id && !selectedField ? "block w-full rounded-md bg-surface px-3 py-2 text-left text-xs font-semibold text-ink" : "block w-full rounded-md px-3 py-2 text-left text-xs text-muted hover:bg-surface"} onClick={() => select(entity.id)} type="button"><span className="block truncate">{entity.displayName}</span><span className="font-mono text-[10px] opacity-70">{entity.logicalId}</span></button>
            <div className="ml-3 border-l border-border pl-2">{entity.fields.map((field) => <button className={field.id === selectedField?.id ? "block w-full rounded-md bg-blue-50 px-2 py-1 text-left text-[11px] font-semibold text-ink" : "block w-full rounded-md px-2 py-1 text-left text-[11px] text-muted hover:bg-surface"} key={field.id} onClick={() => select(field.id)} type="button"><span className="block truncate">{field.displayName}</span><span className="font-mono text-[10px] opacity-70">{field.dataType}</span></button>)}</div>
          </div>)}
          {projection.relations.map((relation) => <button className={relation.id === selectedRelation?.id ? "mt-1 block w-full rounded-md bg-surface px-3 py-2 text-left text-[11px] font-semibold text-ink" : "mt-1 block w-full rounded-md px-3 py-2 text-left text-[11px] text-muted hover:bg-surface"} key={relation.id} onClick={() => select(relation.id)} type="button"><span className="block truncate">{relation.id}</span><span className="font-mono text-[10px] opacity-70">{relation.mappingConfigured ? copy("er.mapping") : "FIELD_MAPPING_UNCONFIGURED"}</span></button>)}
        </div>
      </div>
      <div className="min-w-0 text-xs text-muted">
        {selectedField ? <FieldFacts field={selectedField} entity={projection.entities.find((entity) => entity.id === selectedField.entityId)} copy={copy} /> : selectedEntity ? <EntityFacts entity={selectedEntity} copy={copy} /> : <p>{copy("er.noSelection")}</p>}
        <h4 className="mt-4 font-semibold text-ink">{copy("er.relationGroup")}</h4>
        {selectedRelations.length ? <div className="mt-2 space-y-2">{selectedRelations.map((relation) => <RelationFacts key={relation.id} relation={relation} projection={projection} copy={copy} />)}</div> : <p className="mt-2">{copy("er.noSelection")}</p>}
        {projection.qualityIssues.length ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3"><div className="font-semibold text-amber-900">{copy("er.qualityIssues")}</div>{projection.qualityIssues.map((issue) => <div className="mt-1" key={`${issue.code}:${issue.edgeId}`}><code>{issue.code}</code> · {issue.message}</div>)}</div> : null}
        <div className="mt-4 rounded-md bg-surface p-3"><div className="font-semibold text-ink">{copy("er.waterline")}</div><div className="mt-1 font-mono text-[10px]">catalog {response.waterlines.catalogVersion} · relationship {response.waterlines.relationshipVersion}</div>{response.partial || response.hasMore ? <div className="mt-2 text-amber-700">{copy("er.partial")}</div> : null}</div>
        {response.errors.length ? <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3"><div className="font-semibold text-amber-900">{copy("er.readIssues")}</div>{response.errors.map((error) => <div className="mt-1" key={error.code}>{locale === "zh" ? error.message.zh : error.message.en}</div>)}</div> : null}
      </div>
    </div>
  </aside>;
}

function EntityFacts({ entity, copy }: { entity: ErEntityCard; copy: (key: Parameters<typeof translate>[1]) => string }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2"><dt>{copy("er.type")}</dt><dd className="font-medium text-ink">{copy("er.entity")}</dd><dt>{copy("er.stableId")}</dt><dd className="break-all font-mono text-ink">{entity.logicalId}</dd><dt>{copy("er.model")}</dt><dd className="break-all font-mono text-ink">{entity.rootModelId}</dd><dt>{copy("er.fieldCatalog")}</dt><dd className="font-medium text-ink">{entity.fields.length}</dd></dl>;
}

function FieldFacts({ field, entity, copy }: { field: ErFieldRow; entity?: ErEntityCard; copy: (key: Parameters<typeof translate>[1]) => string }) {
  const markers = [field.primaryKey ? copy("er.primaryKey") : "", field.foreignKey ? copy("er.foreignKey") : "", field.unique ? copy("er.unique") : ""].filter(Boolean).join(", ") || "-";
  return <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2"><dt>{copy("er.type")}</dt><dd className="font-medium text-ink">{field.dataType}</dd><dt>{copy("er.stableId")}</dt><dd className="break-all font-mono text-ink">{field.logicalId}</dd><dt>{copy("er.entity")}</dt><dd className="text-ink">{entity?.displayName ?? field.entityId}</dd><dt>{copy("er.markers")}</dt><dd className="text-ink">{markers}</dd><dt>{copy("er.nullable")}</dt><dd className="text-ink">{field.nullable ? "true" : "false"}</dd><dt>{copy("er.generated")}</dt><dd className="text-ink">{field.generated ? "true" : "false"}</dd>{field.classification ? <><dt>{copy("er.classification")}</dt><dd className="text-ink">{field.classification}</dd></> : null}{field.sensitiveLevel ? <><dt>{copy("er.sensitiveLevel")}</dt><dd className="text-ink">{field.sensitiveLevel}</dd></> : null}{field.example ? <><dt>{copy("er.example")}</dt><dd className="break-all text-ink">{field.example}</dd></> : null}{field.owner ? <><dt>{copy("er.owner")}</dt><dd className="text-ink">{field.owner}</dd></> : null}</dl>;
}

function RelationFacts({ relation, projection, copy }: { relation: ErRelationGroup; projection: ReturnType<typeof projectErDiagram>; copy: (key: Parameters<typeof translate>[1]) => string }) {
  const sourceEntity = projection.entities.find((entity) => entity.id === relation.sourceEntityId);
  const targetEntity = projection.entities.find((entity) => entity.id === relation.targetEntityId);
  const fieldById = new Map(projection.entities.flatMap((entity) => entity.fields).map((field) => [field.id, field]));
  return <div className="rounded-md border border-border p-2"><div className="font-mono text-[10px] text-ink">{relation.id}</div><div className="mt-1 text-[11px] text-muted">{sourceEntity?.displayName ?? relation.sourceEntityId} → {targetEntity?.displayName ?? relation.targetEntityId}</div>{relation.mappingConfigured ? <div className="mt-2 space-y-1">{relation.mappings.map((mapping) => <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" key={mapping.id}><span className="truncate text-ink" title={mapping.sourceFieldId}>{copy("er.source")}: {fieldById.get(mapping.sourceFieldId)?.displayName ?? mapping.sourceFieldId}</span><span aria-hidden="true">→</span><span className="truncate text-ink" title={mapping.targetFieldId}>{copy("er.target")}: {fieldById.get(mapping.targetFieldId)?.displayName ?? mapping.targetFieldId}</span></div>)}</div> : <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 font-mono text-[10px] text-amber-900">FIELD_MAPPING_UNCONFIGURED</div>}</div>;
}

function relationTouches(relation: ErRelationGroup, entityId?: string, fieldId?: string): boolean {
  return Boolean((entityId && (relation.sourceEntityId === entityId || relation.targetEntityId === entityId)) || (fieldId && relation.mappings.some((mapping) => mapping.sourceFieldId === fieldId || mapping.targetFieldId === fieldId)));
}
