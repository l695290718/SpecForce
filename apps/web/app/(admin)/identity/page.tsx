import { redirect } from "next/navigation";
import { settingsHref } from "../../../components/settings/settings-state";

export default async function IdentityPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const { scope } = await searchParams;
  redirect(settingsHref("agents", scope));
}
