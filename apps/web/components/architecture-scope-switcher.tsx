"use client";

import { ChevronDown, Layers3 } from "lucide-react";
import { huaweiArchitectureScopes } from "@specforge/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { listReadableApplicationServices } from "../lib/scope";

const defaultScopeId = "com.huawei.celon.desiner";

function readableScopes() {
  return listReadableApplicationServices();
}

function labelFor(scopeId: string) {
  const scope = huaweiArchitectureScopes.find((item) => item.id === scopeId) ?? huaweiArchitectureScopes.find((item) => item.id === defaultScopeId)!;
  return scope.scopePath
    .split("/")
    .map((id) => huaweiArchitectureScopes.find((item) => item.id === id)?.name ?? id)
    .join(" / ");
}

export function ArchitectureScopeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("scope");
  const [persistedScopeId, setPersistedScopeId] = useState(defaultScopeId);
  const requestedScopeId = readableScopes().some((scope) => scope.id === requested) ? requested! : undefined;
  const scopeId = requestedScopeId ?? persistedScopeId;
  const selected = huaweiArchitectureScopes.find((scope) => scope.id === scopeId)!;

  useEffect(() => {
    if (requestedScopeId) {
      window.localStorage.setItem("specforge-architecture-scope", requestedScopeId);
      document.cookie = `specforge-architecture-scope=${encodeURIComponent(requestedScopeId)}; path=/; samesite=lax`;
      setPersistedScopeId(requestedScopeId);
      return;
    }
    const saved = window.localStorage.getItem("specforge-architecture-scope");
    if (readableScopes().some((scope) => scope.id === saved)) {
      setPersistedScopeId(saved!);
      const next = new URLSearchParams(params.toString());
      next.set("scope", saved!);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
  }, [requestedScopeId, pathname, params, router]);

  const changeScope = (nextScopeId: string) => {
    window.localStorage.setItem("specforge-architecture-scope", nextScopeId);
    document.cookie = `specforge-architecture-scope=${encodeURIComponent(nextScopeId)}; path=/; samesite=lax`;
    setPersistedScopeId(nextScopeId);
    const next = new URLSearchParams(params.toString());
    next.set("scope", nextScopeId);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <label className="group flex min-w-0 items-center gap-2 rounded-md border border-border bg-white px-2 py-1.5 shadow-sm" title={labelFor(scopeId)}>
      <Layers3 className="shrink-0 text-accent" size={15} />
      <span className="hidden text-[10px] font-semibold uppercase text-muted xl:inline">Architecture scope</span>
      <select aria-label="Application architecture scope" className="min-w-0 max-w-60 appearance-none bg-transparent pr-1 text-xs font-semibold text-ink outline-none" onChange={(event) => changeScope(event.target.value)} value={scopeId}>
        {readableScopes().map((scope) => <option key={scope.id} value={scope.id}>{scope.level === "applicationService" ? scope.code : scope.name}</option>)}
      </select>
      <ChevronDown className="pointer-events-none shrink-0 text-muted" size={13} />
      <span className="hidden max-w-72 truncate border-l border-border pl-2 text-[11px] text-muted 2xl:inline">{labelFor(scopeId)}</span>
    </label>
  );
}
