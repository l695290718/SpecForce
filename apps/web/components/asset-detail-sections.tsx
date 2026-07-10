import type { ApiContract, AssetType, DataModel, EventContract, StateMachine } from "@specforge/core";
import { Badge, Card, DataTable } from "./ui";

export function SpecializedAssetSections({ assetType, asset }: { assetType: AssetType; asset: Record<string, any> }) {
  if (assetType === "dataModel") return <DataModelSection model={asset as DataModel} />;
  if (assetType === "stateMachine") return <StateMachineSection machine={asset as StateMachine} />;
  if (assetType === "api") return <ApiContractSection api={asset as ApiContract} />;
  if (assetType === "event") return <EventContractSection event={asset as EventContract} />;
  return null;
}

function DataModelSection({ model }: { model: DataModel }) {
  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Field Catalog</h2>
          <Badge tone="blue">{model.modelType}</Badge>
        </div>
        <DataTable
          columns={["Field", "Display", "Type", "Meaning", "Nullable", "Classification", "Constraint", "Owner"]}
          rows={model.fields.map((field) => [
            <code key="field">{field.fieldName}</code>,
            field.displayName,
            field.dataType,
            field.meaning ?? "-",
            field.nullable ? "yes" : "no",
            field.classification ?? field.sensitiveLevel ?? "-",
            field.constraint ?? "-",
            field.owner
          ])}
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <InfoList title="Relationships" items={model.relationships} />
        <InfoList title="Constraints" items={model.constraints} />
        <Card>
          <h2 className="mb-3 text-base font-semibold">Lifecycle & Lineage</h2>
          <DataTable columns={["Item", "Value"]} rows={[["Classification", model.dataClassification], ["Lifecycle", model.lifecycle], ["Lineage", model.lineage]]} />
        </Card>
      </div>
    </div>
  );
}

function StateMachineSection({ machine }: { machine: StateMachine }) {
  return (
    <div className="mt-6 grid gap-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <InfoList title="States" items={machine.states} />
        <InfoList title="Events" items={machine.events} />
        <InfoList title="Guards & Actions" items={[...machine.guards, ...machine.actions]} />
      </div>
      <Card>
        <h2 className="mb-3 text-base font-semibold">Transitions</h2>
        <DataTable
          columns={["From", "To", "Trigger", "Condition", "Action", "Emits Event", "Idempotent", "Failure Handling"]}
          rows={machine.transitions.map((transition) => [
            transition.from,
            transition.to,
            transition.trigger,
            transition.condition ?? "-",
            transition.action ?? "-",
            transition.emitsEvent ?? "-",
            transition.idempotent ? "yes" : "no",
            transition.failureHandling ?? "-"
          ])}
        />
      </Card>
    </div>
  );
}

function ApiContractSection({ api }: { api: ApiContract }) {
  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold">Contract Controls</h2>
        <DataTable
          columns={["Method", "Path", "Provider", "Auth", "Idempotency", "Rate Limit", "Timeout", "Compatibility"]}
          rows={[[<Badge key="method" tone="blue">{api.method}</Badge>, <code key="path">{api.path}</code>, api.providerSystem, api.authType ?? "-", api.idempotency ?? "-", api.rateLimit ?? "-", api.timeout ?? "-", api.compatibilityPolicy ?? "-"]]}
        />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <SchemaBlock title="Request Schema" value={api.requestSchema} />
        <SchemaBlock title="Response Schema" value={api.responseSchema} />
      </div>
      <InfoList title="Error Codes" items={api.errorCodes} />
    </div>
  );
}

function EventContractSection({ event }: { event: EventContract }) {
  return (
    <div className="mt-6 grid gap-6">
      <Card>
        <h2 className="mb-3 text-base font-semibold">Delivery Contract</h2>
        <DataTable
          columns={["Topic", "Event Type", "Producer", "Consumers", "Trigger", "Retry", "DLQ", "Compatibility"]}
          rows={[[<code key="topic">{event.topic}</code>, event.eventType, event.producer ?? "-", event.consumers.join(", "), event.triggerTiming, event.retryPolicy ?? "-", event.deadLetterPolicy ?? "-", event.compatibilityPolicy ?? "-"]]}
        />
      </Card>
      <SchemaBlock title="Event Schema" value={event.schema} />
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {items.length > 0 ? items.map((item) => <li key={item}>{item}</li>) : <li className="text-muted">None</li>}
      </ul>
    </Card>
  );
}

function SchemaBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold">{title}</h2>
      <pre className="rounded-md bg-slate-950 p-4 text-xs text-slate-50">{JSON.stringify(value, null, 2)}</pre>
    </Card>
  );
}
