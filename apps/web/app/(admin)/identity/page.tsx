"use client";

import { FormEvent, useState } from "react";

const operations = ["asset:read", "asset:write", "graph:read", "knowledge:read", "knowledge:consume", "knowledge:write", "proposal:read", "proposal:write", "context-pack:generate", "governance:run", "adr:write"];

export default function IdentityPage() {
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(path: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setResult("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": readCookie("specforge_csrf") }, body: JSON.stringify(values) });
      const body = await response.json() as Record<string, unknown>;
      if (!response.ok) throw new Error(String(body.error ?? "操作失败"));
      setResult(JSON.stringify(body, null, 2));
      event.currentTarget.reset();
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Security control plane</p><h1 className="mt-2 text-3xl font-semibold text-slate-950">身份与 Agent 凭据</h1><p className="mt-2 text-sm text-slate-600">账号、精确 Scope 权限和 Agent Token 分开管理。Token 只显示一次。</p></header>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="创建用户" action="/api/admin/users" onSubmit={submit} fields={[["login", "登录名"], ["displayName", "显示名称"], ["password", "初始密码"]]} />
        <Panel title="授予精确操作" action="/api/admin/grants" onSubmit={submit} fields={[["userId", "用户 ID"], ["applicationServiceId", "应用服务 ID"]]} select={{ name: "operation", label: "操作", options: operations }} />
        <Panel title="创建 Agent" action="/api/agent-credentials/agents" onSubmit={submit} fields={[["name", "Agent 名称"]]} />
        <Panel title="签发 Agent Token" action="/api/agent-credentials/issue" onSubmit={submit} fields={[["agentId", "Agent ID"], ["expiresAt", "过期时间（ISO 8601）"]]} select={{ name: "operation", label: "操作上限", options: operations }} hiddenFields={{ ceiling: "[{\"applicationServiceId\":\"com.huawei.celon.desiner\",\"operation\":\"knowledge:read\"}]" }} />
      </div>
      {result ? <pre className="mt-6 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-emerald-200" aria-live="polite">{result}</pre> : null}
      <p className="mt-6 text-xs leading-5 text-slate-500">所有变更都要求当前会话的 Origin 与 CSRF 校验，并写入安全审计。生产环境请通过 HTTPS 访问。</p>
    </main>
  );
}

function Panel({ title, action, fields, select, hiddenFields, onSubmit }: { title: string; action: string; fields: Array<[string, string]>; select?: { name: string; label: string; options: string[] }; hiddenFields?: Record<string, string>; onSubmit: (path: string, event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="rounded-xl border border-slate-200 bg-white/75 p-5 shadow-sm"><h2 className="text-base font-semibold text-slate-900">{title}</h2><form className="mt-4 space-y-3" onSubmit={(event) => onSubmit(action, event)}>{fields.map(([name, label]) => <label key={name} className="block text-sm text-slate-700">{label}<input required name={name} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label>)}{select ? <label className="block text-sm text-slate-700">{select.label}<select name={select.name} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">{select.options.map((option) => <option key={option}>{option}</option>)}</select></label> : null}{Object.entries(hiddenFields ?? {}).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}<button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={false}>提交</button></form></section>;
}

function readCookie(name: string) { return document.cookie.split("; ").find((entry) => entry.startsWith(`${name}=`))?.slice(name.length + 1) ?? ""; }
