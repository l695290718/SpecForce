import { describe, expect, it } from "vitest";
import {
  assertWritableApplicationService,
  defaultHuaweiActor,
  seedHuaweiActor,
  filterByReadableScope,
  hasScopeAccess,
  scopeById
} from "../index";

describe("Huawei architecture scope authorization", () => {
  const designerService = scopeById("com.huawei.celon.desiner");
  const runtimeService = scopeById("com.huawei.celon.runtime");
  const designerModule = scopeById("module-celon-designer");

  it("inherits module read access to the Celon Designer application service", () => {
    const moduleReader = {
      actorType: "agent" as const,
      actorId: "module-reader",
      grants: [{ scopeId: "module-celon-designer", action: "read" as const }]
    };

    expect(designerService).toBeDefined();
    expect(hasScopeAccess(moduleReader, designerService!, "read")).toBe(true);
    expect(hasScopeAccess(moduleReader, designerModule!, "read")).toBe(true);
  });

  it("exposes additional mock application services under the Designer module as read-only scopes", () => {
    const studioService = scopeById("com.huawei.celon.specstudio");
    const policyService = scopeById("com.huawei.celon.policyhub");

    expect(studioService?.parentId).toBe("module-celon-designer");
    expect(policyService?.parentId).toBe("module-celon-designer");
    expect(hasScopeAccess(defaultHuaweiActor, studioService!, "read")).toBe(true);
    expect(hasScopeAccess(defaultHuaweiActor, policyService!, "read")).toBe(true);
    expect(hasScopeAccess(defaultHuaweiActor, studioService!, "write")).toBe(false);
  });

  it("allows only the dedicated seed actor to write mock sibling services", () => {
    const policyService = scopeById("com.huawei.celon.policyhub")!;

    expect(hasScopeAccess(defaultHuaweiActor, policyService, "write")).toBe(false);
    expect(hasScopeAccess(seedHuaweiActor, policyService, "write")).toBe(true);
  });

  it("only accepts an application service as a writable target", () => {
    expect(() => assertWritableApplicationService(defaultHuaweiActor, designerModule!)).toThrow(
      "application service"
    );
  });

  it("denies writes to the sibling Celon Runtime application service", () => {
    expect(() => assertWritableApplicationService(defaultHuaweiActor, runtimeService!)).toThrow(
      "write access"
    );
  });

  it("does not treat an inherited read grant as write access", () => {
    const moduleReader = {
      actorType: "agent" as const,
      actorId: "module-reader",
      grants: [{ scopeId: "module-celon-designer", action: "read" as const }]
    };

    expect(hasScopeAccess(moduleReader, designerService!, "write")).toBe(false);
    expect(() => assertWritableApplicationService(moduleReader, designerService!)).toThrow("write access");
  });

  it("filters assets outside readable scopes", () => {
    const assets = [
      { id: "designer-asset", architectureScope: { applicationServiceId: "com.huawei.celon.desiner", scopePath: designerService!.scopePath } },
      { id: "runtime-asset", architectureScope: { applicationServiceId: "com.huawei.celon.runtime", scopePath: runtimeService!.scopePath } }
    ];

    expect(filterByReadableScope(defaultHuaweiActor, assets)).toEqual([assets[0]]);
  });

  it("keeps legacy assets without an architecture scope readable during migration", () => {
    const assets: Array<{ id: string; architectureScope?: undefined }> = [{ id: "legacy-asset" }];

    expect(filterByReadableScope(defaultHuaweiActor, assets)).toEqual(assets);
  });
});
