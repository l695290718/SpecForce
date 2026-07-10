import { builtInRules } from "@specforge/core";
import { Badge, DataTable, PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";

export default function GovernanceRulesPage() {
  return (
    <>
      <PageHeader title={<T k="governance.rulesTitle" />} description={<T k="governance.rulesDescription" />} />
      <DataTable columns={[<T k="table.ruleCode" key="rule" />, <T k="table.status" key="status" />]} rows={builtInRules.map((rule) => [rule, <Badge key={rule} tone="green"><T k="status.enabled" /></Badge>])} />
    </>
  );
}
