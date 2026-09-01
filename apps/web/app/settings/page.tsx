import { PageHeader } from "../../components/ui";
import { T } from "../../components/language-provider";
import { SettingsWorkspace } from "../../components/settings/settings-workspace";
import { resolveSettingsSection } from "../../components/settings/settings-state";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ scope?: string; section?: string }> }) {
  const query = await searchParams;
  return (
    <>
      <PageHeader title={<T k="settings.title" />} description={<T k="settings.description" />} />
      <SettingsWorkspace
        initialSection={resolveSettingsSection(query.section)}
        scope={query.scope}
        runtime={{
          databaseUrl: redactDatabaseUrl(process.env.DATABASE_URL ?? "unconfigured"),
          authMode: process.env.SPECFORGE_WEB_AUTH_MODE ?? "unconfigured",
          webOriginConfigured: Boolean(process.env.SPECFORGE_WEB_ORIGIN)
        }}
      />
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
