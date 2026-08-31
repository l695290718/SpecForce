"use client";

import { FormEvent, useState } from "react";

export default function SetupPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const response = await fetch("/api/auth/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(values) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error === "IDENTITY_BOOTSTRAP_ALREADY_COMPLETED" ? "系统已经完成初始化，请直接登录。" : body.error ?? "初始化失败。");
      window.location.href = "/login";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "初始化失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-12">
      <section className="sf-glass w-full rounded-2xl border border-white/70 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">First-run setup</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">初始化设计中枢</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">创建首个管理员账号。此页面只在身份库为空时有效，初始化不会自动授予设计资产权限。</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <Field name="login" label="登录名" />
          <Field name="displayName" label="显示名称" />
          <Field name="password" label="初始密码" type="password" />
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy} className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{busy ? "正在初始化…" : "创建首个管理员"}</button>
        </form>
      </section>
    </main>
  );
}

function Field({ name, label, type = "text" }: { name: string; label: string; type?: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input required name={name} type={type} minLength={type === "password" ? 12 : undefined} className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5 outline-none focus:border-indigo-500" autoComplete={type === "password" ? "new-password" : name === "login" ? "username" : "name"} /></label>;
}
