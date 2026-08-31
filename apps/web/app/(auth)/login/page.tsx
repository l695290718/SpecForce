"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ login, password }) });
      if (!response.ok) throw new Error("登录失败，请检查账号和密码。");
      window.location.href = "/";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登录失败。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md items-center px-6 py-12">
      <section className="sf-glass w-full rounded-2xl border border-white/70 p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">SpecForge Design Center</p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-950">登录设计中枢</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">使用管理员为你创建的本地账号。设计资产仍通过 MCP 维护。</p>
        <form className="mt-8 space-y-4" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">账号<input required value={login} onChange={(event) => setLogin(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5 outline-none focus:border-indigo-500" autoComplete="username" /></label>
          <label className="block text-sm font-medium text-slate-700">密码<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2.5 outline-none focus:border-indigo-500" autoComplete="current-password" /></label>
          {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          <button disabled={busy} className="w-full rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{busy ? "正在登录…" : "登录"}</button>
        </form>
      </section>
    </main>
  );
}
