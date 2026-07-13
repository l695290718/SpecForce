import type { ArchitectureScope, ScopedActor } from "./types";

const huaweiProductFamilyPath = "pf-huawei";
const celonProductPath = `${huaweiProductFamilyPath}/product-celon`;
const platformSubProductPath = `${celonProductPath}/subproduct-platform`;
const designerModulePath = `${platformSubProductPath}/module-celon-designer`;
const runtimeModulePath = `${platformSubProductPath}/module-celon-runtime`;

export const huaweiArchitectureScopes: ArchitectureScope[] = [
  {
    id: "pf-huawei",
    code: "HUAWEI",
    name: "Huawei Product Family",
    description: "Mock product family for Huawei application architecture.",
    owner: "Huawei Architecture",
    level: "productFamily",
    scopePath: huaweiProductFamilyPath
  },
  {
    id: "product-celon",
    code: "CELON",
    name: "Celon Product",
    description: "Mock Celon product scope.",
    owner: "Celon Product Management",
    level: "product",
    parentId: "pf-huawei",
    scopePath: celonProductPath
  },
  {
    id: "subproduct-platform",
    code: "CELON-PLATFORM",
    name: "Celon Platform",
    description: "Mock Celon platform sub-product.",
    owner: "Celon Platform",
    level: "subProduct",
    parentId: "product-celon",
    scopePath: platformSubProductPath
  },
  {
    id: "module-celon-designer",
    code: "CELON-DESIGNER",
    name: "Celon Designer Module",
    description: "Mock module containing the Celon Designer application service.",
    owner: "Celon Designer Team",
    level: "module",
    parentId: "subproduct-platform",
    scopePath: designerModulePath
  },
  {
    id: "com.huawei.celon.desiner",
    code: "com.huawei.celon.desiner",
    name: "Celon Designer Application Service",
    description: "Current mock application service for design authoring.",
    owner: "Celon Designer Team",
    level: "applicationService",
    parentId: "module-celon-designer",
    scopePath: `${designerModulePath}/com.huawei.celon.desiner`
  },
  {
    id: "com.huawei.celon.specstudio",
    code: "com.huawei.celon.specstudio",
    name: "Celon Specification Studio",
    description: "Mock application service for specification composition and review.",
    owner: "Celon Designer Team",
    level: "applicationService",
    parentId: "module-celon-designer",
    scopePath: `${designerModulePath}/com.huawei.celon.specstudio`
  },
  {
    id: "com.huawei.celon.policyhub",
    code: "com.huawei.celon.policyhub",
    name: "Celon Policy Hub",
    description: "Mock application service for architecture policies and governance rules.",
    owner: "Celon Governance Team",
    level: "applicationService",
    parentId: "module-celon-designer",
    scopePath: `${designerModulePath}/com.huawei.celon.policyhub`
  },
  {
    id: "com.huawei.celon.integrationgateway",
    code: "com.huawei.celon.integrationgateway",
    name: "Celon Integration Gateway",
    description: "Mock application service for external contract and event integration.",
    owner: "Celon Integration Team",
    level: "applicationService",
    parentId: "module-celon-designer",
    scopePath: `${designerModulePath}/com.huawei.celon.integrationgateway`
  },
  {
    id: "module-celon-runtime",
    code: "CELON-RUNTIME",
    name: "Celon Runtime Module",
    description: "Mock sibling module used to verify access boundaries.",
    owner: "Celon Runtime Team",
    level: "module",
    parentId: "subproduct-platform",
    scopePath: runtimeModulePath
  },
  {
    id: "com.huawei.celon.runtime",
    code: "com.huawei.celon.runtime",
    name: "Celon Runtime Application Service",
    description: "Mock sibling application service outside the writable scope.",
    owner: "Celon Runtime Team",
    level: "applicationService",
    parentId: "module-celon-runtime",
    scopePath: `${runtimeModulePath}/com.huawei.celon.runtime`
  }
];

export const defaultHuaweiActor: ScopedActor = {
  actorType: "agent",
  actorId: "specforge-default-agent",
  grants: [
    { scopeId: "com.huawei.celon.desiner", action: "read" },
    { scopeId: "com.huawei.celon.desiner", action: "write" },
    { scopeId: "module-celon-designer", action: "read" }
  ]
};

export const seedHuaweiActor: ScopedActor = {
  actorType: "system",
  actorId: "specforge-seed",
  grants: [
    { scopeId: "module-celon-designer", action: "read" },
    { scopeId: "module-celon-designer", action: "write" }
  ]
};
