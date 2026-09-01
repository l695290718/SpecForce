"use client";

import { Ban, CheckCircle2, Copy, KeyRound, LoaderCircle, Plus, RefreshCw, Server, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState, type ReactNode } from "react";
import { Badge, Card } from "../ui";
import { useLanguage } from "../language-provider";
import { safeIdentityMessageKey, settingsHref, type SettingsSection } from "./settings-state";

type Grant = { applicationServiceId: string; operation: string };
type Credential = { id: string; agentId: string; status: string; expiresAt: string; ceiling: Grant[] };
type Agent = { id: string; name: string; status: string; credentials: Credential[] };
type User = { id: string; login: string; displayName: string; status: string; isAdministrator: boolean; grants: Grant[] };
type Runtime = { databaseUrl: string; authMode: string; webOriginConfigured: boolean };
type Notice = { tone: "error" | "success"; text: string };

const operations = ["asset:read", "asset:write", "graph:read", "knowledge:read", "knowledge:consume", "knowledge:write", "proposal:read", "proposal:write", "context-pack:generate", "governance:run", "adr:write"];
const inputClass = "block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100";

export function SettingsWorkspace({ initialSection, scope, runtime }: { initialSection: SettingsSection; scope?: string; runtime: Runtime }) {
  const { t } = useLanguage();
  const sections: Array<{ id: SettingsSection; label: string; icon: typeof KeyRound }> = [
    { id: "agents", label: t("settings.agents"), icon: KeyRound },
    { id: "permissions", label: t("settings.permissions"), icon: Users },
    { id: "runtime", label: t("settings.runtime"), icon: Server }
  ];
  return <div className="space-y-5">
    <nav aria-label={t("settings.sections")} className="flex flex-wrap gap-2 border-b border-border pb-4">
      {sections.map(({ id, label, icon: Icon }) => <Link key={id} href={settingsHref(id, scope)} aria-current={initialSection === id ? "page" : undefined} className={initialSection === id ? "inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm" : "inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-700"}><Icon size={15} />{label}</Link>)}
    </nav>
    {initialSection === "agents" ? <AgentsPanel scope={scope} /> : null}
    {initialSection === "permissions" ? <PermissionsPanel scope={scope} /> : null}
    {initialSection === "runtime" ? <RuntimePanel runtime={runtime} /> : null}
  </div>;
}

function AgentsPanel({ scope }: { scope?: string }) {
  const { t } = useLanguage();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [notice, setNotice] = useState<Notice>();
  const [busy, setBusy] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const refresh = async () => {
    setBusy("load");
    try { setAgents((await request<{ agents: Agent[] }>("/api/agent-credentials/agents", "GET")).agents); setNotice(undefined); }
    catch (error) { setNotice(errorNotice(error, t)); }
    finally { setBusy(undefined); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => () => setSecret(undefined), []);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get("name") ?? "").trim(); if (!name) return;
    setBusy("create");
    try { await request("/api/agent-credentials/agents", "POST", { name }); form.reset(); await refresh(); setNotice({ tone: "success", text: t("settings.saved") }); }
    catch (error) { setNotice(errorNotice(error, t)); }
    finally { setBusy(undefined); }
  };
  const issue = async (agentId: string, form: HTMLFormElement) => {
    if (!scope) { setNotice({ tone: "error", text: t("settings.scopeRequired") }); return; }
    const data = new FormData(form); const expiry = String(data.get("expiresAt") ?? ""); const operation = String(data.get("operation") ?? "");
    setBusy(`issue:${agentId}`);
    try {
      const result = await request<{ secret: string }>("/api/agent-credentials/issue", "POST", { agentId, expiresAt: new Date(expiry).toISOString(), ceiling: [{ applicationServiceId: scope, operation }] });
      setSecret(result.secret); await refresh(); setNotice({ tone: "success", text: t("settings.saved") });
    } catch (error) { setNotice(errorNotice(error, t)); }
    finally { setBusy(undefined); }
  };
  const rotate = async (credentialId: string, form: HTMLFormElement) => {
    const expiry = String(new FormData(form).get("expiresAt") ?? ""); setBusy(`rotate:${credentialId}`);
    try { const result = await request<{ secret: string }>("/api/agent-credentials/rotate", "POST", { credentialId, expiresAt: new Date(expiry).toISOString() }); setSecret(result.secret); await refresh(); setNotice({ tone: "success", text: t("settings.saved") }); }
    catch (error) { setNotice(errorNotice(error, t)); }
    finally { setBusy(undefined); }
  };
  const revoke = async (credentialId: string, form: HTMLFormElement) => {
    const reason = String(new FormData(form).get("reason") ?? "").trim(); if (!reason) { setNotice({ tone: "error", text: t("settings.error.validation") }); return; }
    setBusy(`revoke:${credentialId}`);
    try { await request("/api/agent-credentials/revoke", "POST", { credentialId, reason }); await refresh(); setNotice({ tone: "success", text: t("settings.saved") }); }
    catch (error) { setNotice(errorNotice(error, t)); }
    finally { setBusy(undefined); }
  };
  return <section className="space-y-5"><PanelHeader icon={<KeyRound size={17} />} title={t("settings.agents")} description={t("settings.agents.description")} /><StatusMessage notice={notice} />
    {secret ? <Card className="border-emerald-200 bg-emerald-50/70"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-emerald-950">{t("settings.tokenOnce")}</p><code className="mt-3 block max-w-full overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-emerald-200">{secret}</code></div><div className="flex gap-2"><IconButton label={t("settings.copy")} icon={<Copy size={15} />} onClick={() => void navigator.clipboard.writeText(secret)} /><IconButton label={t("settings.dismiss")} icon={<Ban size={15} />} onClick={() => setSecret(undefined)} /></div></div></Card> : null}
    <Card><form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end"><Field label={t("settings.agentName")}><input required name="name" className={inputClass} /></Field><Submit busy={busy === "create"} label={t("settings.createAgent")} icon={<Plus size={15} />} /></form></Card>
    {busy === "load" ? <Loading /> : agents.length === 0 ? <Card><p className="text-sm text-slate-600">{t("settings.noAgents")}</p></Card> : agents.map((agent) => <Card key={agent.id} className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-950">{agent.name}</h2><p className="mt-1 font-mono text-xs text-slate-500">{agent.id}</p></div><Badge tone={agent.status === "ACTIVE" ? "green" : "red"}>{agent.status}</Badge></div><form onSubmit={(event) => { event.preventDefault(); void issue(agent.id, event.currentTarget); }} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]"><Field label={t("settings.expiresAt")}><input required name="expiresAt" type="datetime-local" className={inputClass} /></Field><Field label={t("settings.operations")}><select name="operation" defaultValue="knowledge:read" className={inputClass}>{operations.map((operation) => <option key={operation}>{operation}</option>)}</select></Field><Submit disabled={!scope} busy={busy === `issue:${agent.id}`} label={t("settings.issueToken")} icon={<KeyRound size={15} />} /></form><p className="text-xs text-slate-500">{t("settings.scope")}: <span className="font-mono">{scope || t("settings.scopeRequired")}</span></p><div className="space-y-3 border-t border-border pt-4"><h3 className="text-sm font-semibold text-slate-800">{t("settings.credentials")}</h3>{agent.credentials.map((credential) => <CredentialRow key={credential.id} credential={credential} busy={busy} onRotate={rotate} onRevoke={revoke} />)}</div></Card>)}</section>;
}

function PermissionsPanel({ scope }: { scope?: string }) {
  const { t } = useLanguage(); const [users, setUsers] = useState<User[]>([]); const [notice, setNotice] = useState<Notice>(); const [busy, setBusy] = useState<string>();
  const refresh = async () => { setBusy("load"); try { setUsers((await request<{ users: User[] }>("/api/admin/users", "GET")).users); setNotice(undefined); } catch (error) { setNotice(errorNotice(error, t)); } finally { setBusy(undefined); } };
  useEffect(() => { void refresh(); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>, path: string) => { event.preventDefault(); const form = event.currentTarget; const data = Object.fromEntries(new FormData(form)); if (path.endsWith("grants")) { if (!scope) { setNotice({ tone: "error", text: t("settings.scopeRequired") }); return; } data.applicationServiceId = scope; } setBusy(path); try { await request(path, "POST", data); form.reset(); await refresh(); setNotice({ tone: "success", text: t("settings.saved") }); } catch (error) { setNotice(errorNotice(error, t)); } finally { setBusy(undefined); } };
  return <section className="space-y-5"><PanelHeader icon={<Users size={17} />} title={t("settings.permissions")} description={t("settings.permissions.description")} /><StatusMessage notice={notice} /><div className="grid gap-5 xl:grid-cols-2"><Card><form onSubmit={(event) => void submit(event, "/api/admin/users")} className="grid gap-3"><Field label={t("settings.userLogin")}><input required name="login" className={inputClass} /></Field><Field label={t("settings.displayName")}><input required name="displayName" className={inputClass} /></Field><Field label={t("settings.password")}><input required name="password" type="password" className={inputClass} /></Field><Submit busy={busy === "/api/admin/users"} label={t("settings.createUser")} icon={<Plus size={15} />} /></form></Card><Card><form onSubmit={(event) => void submit(event, "/api/admin/grants")} className="grid gap-3"><Field label={t("settings.userId")}><input required name="userId" className={inputClass} /></Field><Field label={t("settings.scope")}><output className={`${inputClass} flex items-center bg-slate-50 font-mono text-xs`}>{scope || t("settings.scopeRequired")}</output></Field><Field label={t("settings.operations")}><select name="operation" className={inputClass}>{operations.map((operation) => <option key={operation}>{operation}</option>)}</select></Field><Submit disabled={!scope} busy={busy === "/api/admin/grants"} label={t("settings.grantOperation")} icon={<ShieldCheck size={15} />} /></form></Card></div>{busy === "load" ? <Loading /> : users.length ? <Card><div className="space-y-3">{users.map((user) => <div key={user.id} className="border-b border-border pb-3 last:border-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-slate-900">{user.displayName}</p><p className="font-mono text-xs text-slate-500">{user.id} · {user.login}</p></div><Badge tone={user.status === "ACTIVE" ? "green" : "red"}>{user.isAdministrator ? "ADMIN" : user.status}</Badge></div><div className="mt-2 flex flex-wrap gap-2">{user.grants.map((grant) => <span key={`${grant.applicationServiceId}:${grant.operation}`} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600">{grant.applicationServiceId} · {grant.operation}</span>)}</div></div>)}</div></Card> : <Card><p className="text-sm text-slate-600">{t("settings.noUsers")}</p></Card>}</section>;
}

function RuntimePanel({ runtime }: { runtime: Runtime }) { const { t } = useLanguage(); return <section className="space-y-5"><PanelHeader icon={<Server size={17} />} title={t("settings.runtime")} description={t("settings.runtime.description")} />{runtime.authMode === "static" ? <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("settings.staticWarning")}</div> : null}<Card><dl className="grid gap-4 md:grid-cols-3"><RuntimeItem label={t("settings.database")} value={runtime.databaseUrl} mono /><RuntimeItem label={t("settings.authMode")} value={runtime.authMode} /><RuntimeItem label={t("settings.origin")} value={runtime.webOriginConfigured ? t("settings.configured") : t("settings.unconfigured")} /></dl></Card></section>; }

function CredentialRow({ credential, busy, onRotate, onRevoke }: { credential: Credential; busy?: string; onRotate: (credentialId: string, form: HTMLFormElement) => Promise<void>; onRevoke: (credentialId: string, form: HTMLFormElement) => Promise<void> }) { const { t } = useLanguage(); const active = credential.status === "ACTIVE"; return <div className="rounded-lg border border-border bg-slate-50/70 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><code className="text-xs text-slate-600">{credential.id}</code><Badge tone={active ? "green" : "red"}>{credential.status}</Badge></div><p className="mt-2 text-xs text-slate-500">{t("settings.expiresAt")}: {new Date(credential.expiresAt).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">{credential.ceiling.map((grant) => `${grant.applicationServiceId}:${grant.operation}`).join(", ") || "-"}</p>{active ? <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]"><form onSubmit={(event) => { event.preventDefault(); void onRotate(credential.id, event.currentTarget); }} className="flex gap-2"><input required name="expiresAt" type="datetime-local" className={inputClass} /><Submit busy={busy === `rotate:${credential.id}`} label={t("settings.rotate")} icon={<RefreshCw size={14} />} /></form><form onSubmit={(event) => { event.preventDefault(); void onRevoke(credential.id, event.currentTarget); }} className="flex gap-2"><input required name="reason" placeholder={t("settings.revokeReason")} className={inputClass} /><Submit busy={busy === `revoke:${credential.id}`} label={t("settings.revoke")} icon={<Ban size={14} />} /></form></div> : null}</div>; }
function PanelHeader({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className="flex items-start gap-3"><span className="mt-1 text-blue-600">{icon}</span><div><h2 className="text-lg font-semibold text-slate-950">{title}</h2><p className="mt-1 text-sm leading-6 text-slate-600">{description}</p></div></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block min-w-0 text-sm font-medium text-slate-700"><span>{label}</span><span className="mt-1.5 block">{children}</span></label>; }
function Submit({ label, icon, busy, disabled }: { label: string; icon: ReactNode; busy?: boolean; disabled?: boolean }) { return <button type="submit" disabled={busy || disabled} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={15} /> : icon}{label}</button>; }
function IconButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) { return <button type="button" title={label} aria-label={label} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-lg border border-emerald-200 bg-white text-emerald-800 transition hover:bg-emerald-100">{icon}</button>; }
function Loading() { const { t } = useLanguage(); return <div role="status" className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={16} />{t("settings.loading")}</div>; }
function StatusMessage({ notice }: { notice?: Notice }) { return notice ? <div role="status" aria-live="polite" className={notice.tone === "success" ? "flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" : "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"}>{notice.tone === "success" ? <CheckCircle2 size={16} /> : null}{notice.text}</div> : null; }
function RuntimeItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className={mono ? "mt-1 break-all font-mono text-xs text-slate-700" : "mt-1 text-sm font-medium text-slate-800"}>{value}</dd></div>; }
async function request<T = Record<string, unknown>>(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<T> { const response = await fetch(path, { method, headers: body ? { "content-type": "application/json", "x-csrf-token": readCookie("specforge_csrf") } : undefined, body: body ? JSON.stringify(body) : undefined }); const payload = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(payload.error ?? "REQUEST_REJECTED"); return payload; }
function readCookie(name: string) { return document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) ?? ""; }
function errorNotice(error: unknown, t: ReturnType<typeof useLanguage>["t"]): Notice { return { tone: "error", text: t(safeIdentityMessageKey(error instanceof Error ? error.message : "REQUEST_REJECTED")) }; }
