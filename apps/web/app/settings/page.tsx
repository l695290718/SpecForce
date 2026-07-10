import { Card, PageHeader } from "../../components/ui";
import { T } from "../../components/language-provider";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title={<T k="settings.title" />} description={<T k="settings.description" />} />
      <Card>
        <pre className="text-sm">DATABASE_URL=file:./dev.db</pre>
      </Card>
    </>
  );
}
