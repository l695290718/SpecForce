import { Card, PageHeader } from "../../components/ui";
import { T } from "../../components/language-provider";

export default function SettingsPage() {
  const databaseUrl = redactDatabaseUrl(process.env.DATABASE_URL ?? "postgresql://<user>:<password>@localhost:5432/specforge?schema=public");

  return (
    <>
      <PageHeader title={<T k="settings.title" />} description={<T k="settings.description" />} />
      <Card>
        <pre className="text-sm">DATABASE_URL={databaseUrl}</pre>
      </Card>
    </>
  );
}

function redactDatabaseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:@]+):([^@]+)@/, "://$1:****@");
  }
}
