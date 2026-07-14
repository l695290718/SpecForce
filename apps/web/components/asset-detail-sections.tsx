import type { ApiContract, AssetLocale, AssetType, DataModel, EventContract, StateMachine } from "@specforge/core";
import { Badge, Card, DataTable } from "./ui";

export function SpecializedAssetSections({ assetType, asset, locale }: { assetType: AssetType; asset: Record<string, any>; locale: AssetLocale }) {
  if (assetType === "dataModel") return <DataModelSection model={asset as DataModel} locale={locale} />;
  if (assetType === "stateMachine") return <StateMachineSection machine={asset as StateMachine} locale={locale} />;
  if (assetType === "api") return <ApiContractSection api={asset as ApiContract} locale={locale} />;
  if (assetType === "event") return <EventContractSection event={asset as EventContract} locale={locale} />;
  return null;
}

function DataModelSection({ model, locale }: { model: DataModel; locale: AssetLocale }) {
  const l = labels[locale];
  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{l.fieldCatalog}</h2>
          <Badge tone="blue">{model.modelType}</Badge>
        </div>
        <DataTable
          columns={[l.field, l.display, l.type, l.meaning, l.nullable, l.classification, l.constraint, l.owner]}
          rows={model.fields.map((field) => [
            <code key="field">{field.fieldName}</code>,
            field.displayName,
            field.dataType,
            field.meaning ?? "-",
            field.nullable ? l.yes : l.no,
            field.classification ?? field.sensitiveLevel ?? "-",
            field.constraint ?? "-",
            field.owner
          ])}
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <InfoList title={l.relationships} items={model.relationships} empty={l.none} />
        <InfoList title={l.constraints} items={model.constraints} empty={l.none} />
        <Card>
          <h2 className="mb-3 text-base font-semibold">{l.lifecycleAndLineage}</h2>
          <DataTable columns={[l.item, l.value]} rows={[[l.classification, model.dataClassification], [l.lifecycle, model.lifecycle], [l.lineage, model.lineage]]} />
        </Card>
      </div>
    </div>
  );
}

function StateMachineSection({ machine, locale }: { machine: StateMachine; locale: AssetLocale }) {
  const l = labels[locale];
  return (
    <div className="mt-6 grid gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <InfoList title={l.states} items={machine.states} empty={l.none} />
        <InfoList title={l.events} items={machine.events} empty={l.none} />
        <InfoList title={l.guardsAndActions} items={[...machine.guards, ...machine.actions]} empty={l.none} />
      </div>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{l.transitions}</h2>
        <DataTable
          columns={[l.from, l.to, l.trigger, l.condition, l.action, l.emitsEvent, l.idempotent, l.failureHandling]}
          rows={machine.transitions.map((transition) => [
            transition.from,
            transition.to,
            transition.trigger,
            transition.condition ?? "-",
            transition.action ?? "-",
            transition.emitsEvent ?? "-",
            transition.idempotent ? l.yes : l.no,
            transition.failureHandling ?? "-"
          ])}
        />
      </Card>
    </div>
  );
}

function ApiContractSection({ api, locale }: { api: ApiContract; locale: AssetLocale }) {
  const l = labels[locale];
  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold">{l.contractControls}</h2>
        <DataTable
          columns={[l.method, l.path, l.provider, l.auth, l.idempotency, l.rateLimit, l.timeout, l.compatibility]}
          rows={[[<Badge key="method" tone="blue">{api.method}</Badge>, <code key="path">{api.path}</code>, api.providerSystem, api.authType ?? "-", api.idempotency ?? "-", api.rateLimit ?? "-", api.timeout ?? "-", api.compatibilityPolicy ?? "-"]]}
        />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <SchemaBlock title={l.requestSchema} value={api.requestSchema} />
        <SchemaBlock title={l.responseSchema} value={api.responseSchema} />
      </div>
      <InfoList title={l.errorCodes} items={api.errorCodes} empty={l.none} />
    </div>
  );
}

function EventContractSection({ event, locale }: { event: EventContract; locale: AssetLocale }) {
  const l = labels[locale];
  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold">{l.deliveryContract}</h2>
        <DataTable
          columns={[l.topic, l.eventType, l.producer, l.consumers, l.trigger, l.retry, "DLQ", l.compatibility]}
          rows={[[<code key="topic">{event.topic}</code>, event.eventType, event.producer ?? "-", event.consumers.join(", "), event.triggerTiming, event.retryPolicy ?? "-", event.deadLetterPolicy ?? "-", event.compatibilityPolicy ?? "-"]]}
        />
      </Card>
      <SchemaBlock title={l.eventSchema} value={event.schema} />
    </div>
  );
}

function InfoList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li className="text-muted">{empty}</li>}
      </ul>
    </Card>
  );
}

const labels = {
  en: {
    fieldCatalog: "Field Catalog", field: "Field", display: "Display", type: "Type", meaning: "Meaning", nullable: "Nullable", classification: "Classification", constraint: "Constraint", owner: "Owner", yes: "yes", no: "no", none: "None", relationships: "Relationships", constraints: "Constraints", lifecycleAndLineage: "Lifecycle & Lineage", item: "Item", value: "Value", lifecycle: "Lifecycle", lineage: "Lineage", states: "States", events: "Events", guardsAndActions: "Guards & Actions", transitions: "Transitions", from: "From", to: "To", trigger: "Trigger", condition: "Condition", action: "Action", emitsEvent: "Emits Event", idempotent: "Idempotent", failureHandling: "Failure Handling", contractControls: "Contract Controls", method: "Method", path: "Path", provider: "Provider", auth: "Auth", idempotency: "Idempotency", rateLimit: "Rate Limit", timeout: "Timeout", compatibility: "Compatibility", requestSchema: "Request Schema", responseSchema: "Response Schema", errorCodes: "Error Codes", deliveryContract: "Delivery Contract", topic: "Topic", eventType: "Event Type", producer: "Producer", consumers: "Consumers", retry: "Retry", eventSchema: "Event Schema"
  },
  zh: {
    fieldCatalog: "字段目录", field: "字段", display: "显示名", type: "类型", meaning: "含义", nullable: "可空", classification: "分类", constraint: "约束", owner: "负责人", yes: "是", no: "否", none: "无", relationships: "关系", constraints: "约束", lifecycleAndLineage: "生命周期与血缘", item: "项目", value: "值", lifecycle: "生命周期", lineage: "血缘", states: "状态", events: "事件", guardsAndActions: "守卫与动作", transitions: "状态迁移", from: "起始状态", to: "目标状态", trigger: "触发器", condition: "条件", action: "动作", emitsEvent: "发出事件", idempotent: "幂等", failureHandling: "失败处理", contractControls: "契约控制", method: "方法", path: "路径", provider: "提供方", auth: "认证", idempotency: "幂等性", rateLimit: "限流", timeout: "超时", compatibility: "兼容策略", requestSchema: "请求 Schema", responseSchema: "响应 Schema", errorCodes: "错误码", deliveryContract: "投递契约", topic: "主题", eventType: "事件类型", producer: "生产者", consumers: "消费者", retry: "重试", eventSchema: "事件 Schema"
  }
} as const;

function SchemaBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <pre className="rounded-md bg-slate-950 p-4 text-xs text-slate-50">{JSON.stringify(value, null, 2)}</pre>
    </Card>
  );
}
