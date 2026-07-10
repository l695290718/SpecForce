import { Card, PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";

export default function NewProposalPage() {
  return (
    <>
      <PageHeader title={<T k="proposal.new" />} description={<T k="proposal.newDescription" />} />
      <Card>
        <div className="grid gap-4">
          {["Title", "Background", "Goal", "Non-goal", "Risks", "Rollout Plan", "Rollback Plan"].map((label) => (
            <label className="grid gap-1 text-sm" key={label}>
              <span className="font-medium">{label}</span>
              <textarea className="min-h-20 rounded-md border border-border px-3 py-2" placeholder={label} />
            </label>
          ))}
          <button className="h-10 w-fit rounded-md bg-accent px-4 text-sm font-medium text-white"><T k="action.saveDraft" /></button>
        </div>
      </Card>
    </>
  );
}
