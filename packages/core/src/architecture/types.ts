export type ArchitectureScopeLevel = "productFamily" | "product" | "subProduct" | "module" | "applicationService";
export type ScopeAction = "read" | "write";

export interface ArchitectureScope {
  id: string;
  code: string;
  name: string;
  description: string;
  owner: string;
  level: ArchitectureScopeLevel;
  parentId?: string;
  scopePath: string;
}

export interface ArchitectureScopeRef {
  applicationServiceId: string;
  scopePath: string;
}

export interface ScopeGrant {
  scopeId: string;
  action: ScopeAction;
}

export interface ScopedActor {
  actorType: "agent" | "user" | "system";
  actorId: string;
  grants: ScopeGrant[];
}
