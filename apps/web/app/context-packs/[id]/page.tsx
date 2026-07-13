import ReactMarkdown from "react-markdown";
import { Card, DataTable, PageHeader } from "../../../components/ui";
import { T } from "../../../components/language-provider";
import { CopyMarkdownButton } from "../../../components/copy-markdown-button";
import { getContextPackWithDatabase } from "../../../lib/assets";

export default async function ContextPackDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ scope?: string }> }) {
  const { id } = await params;
  const { scope = "" } = await searchParams;
  const pack = await getContextPackWithDatabase(id, scope);

  return (
    <>
      <PageHeader title={pack.name} description={pack.summary} />
      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="contextPacks.includedAssets" /></h2>
          <DataTable columns={[<T k="table.asset" key="asset" />, <T k="table.type" key="type" />]} rows={pack.includedAssets.map((asset) => [asset.label, asset.type])} />
        </Card>
        <Card>
          <h2 className="mb-3 text-base font-semibold"><T k="contextPacks.agentInstructions" /></h2>
          <ul className="list-disc space-y-2 pl-5 text-sm">{pack.instructions.map((item) => <li key={item}>{item}</li>)}</ul>
        </Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 text-base font-semibold">Constraints</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm">{pack.constraints.map((item) => <li key={item}>{item}</li>)}</ul>
      </Card>
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold"><T k="contextPacks.markdownPreview" /></h2>
          <div className="flex gap-2">
            <CopyMarkdownButton markdown={pack.generatedMarkdown} />
            <a className="rounded-md border border-border px-3 py-2 text-sm" download={`${pack.id}.md`} href={`data:text/markdown;charset=utf-8,${encodeURIComponent(pack.generatedMarkdown)}`}><T k="action.downloadMd" /></a>
          </div>
        </div>
        <div className="prose max-w-none text-sm">
          <ReactMarkdown>{pack.generatedMarkdown}</ReactMarkdown>
        </div>
      </Card>
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold"><T k="contextPacks.copyMarkdown" /></h2>
          <CopyMarkdownButton markdown={pack.generatedMarkdown} />
        </div>
        <textarea className="h-80 w-full rounded-md border border-border p-3 font-mono text-xs" readOnly value={pack.generatedMarkdown} />
      </Card>
    </>
  );
}
