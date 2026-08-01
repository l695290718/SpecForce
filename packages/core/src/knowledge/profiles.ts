import type { AnalysisProfile, OrganizationProfile } from "./types";

export const genericSystemAnalysisProfile: AnalysisProfile = {
  id: "generic-system",
  name: "Generic System Analysis",
  supportedLayers: ["BIZ", "SYS", "TECH"],
  supportedAspects: ["structure", "behavior", "information", "contract", "constraint"],
  requiresDdd: false,
  extractorKinds: ["repository", "openapi", "asyncapi", "database-schema", "document"],
  version: "1"
};

export const optionalAnalysisProfiles: AnalysisProfile[] = [
  {
    id: "ddd",
    name: "Domain-Driven Design Analysis",
    supportedLayers: ["BIZ", "SYS", "TECH"],
    supportedAspects: ["structure", "behavior", "information", "contract", "constraint"],
    requiresDdd: true,
    extractorKinds: ["repository", "openapi", "database-schema", "document"],
    version: "1"
  },
  {
    id: "workflow",
    name: "Workflow Analysis",
    supportedLayers: ["BIZ", "SYS", "TECH"],
    supportedAspects: ["structure", "behavior", "contract", "constraint"],
    requiresDdd: false,
    extractorKinds: ["repository", "openapi", "document"],
    version: "1"
  },
  {
    id: "data-pipeline",
    name: "Data Pipeline Analysis",
    supportedLayers: ["BIZ", "SYS", "TECH"],
    supportedAspects: ["structure", "behavior", "information", "constraint"],
    requiresDdd: false,
    extractorKinds: ["repository", "database-schema", "document"],
    version: "1"
  },
  {
    id: "integration",
    name: "Integration Analysis",
    supportedLayers: ["BIZ", "SYS", "TECH"],
    supportedAspects: ["structure", "behavior", "information", "contract", "constraint"],
    requiresDdd: false,
    extractorKinds: ["repository", "openapi", "asyncapi", "document"],
    version: "1"
  }
];

export const genericOrganizationProfile: OrganizationProfile = {
  id: "generic-organization",
  name: "Generic Organization",
  scopeLevels: ["organization", "product", "system", "applicationService"],
  minimumWriteLevel: "applicationService",
  localePolicy: {
    canonicalLocale: "en",
    requiredLocales: [],
    supportedLocales: ["en"]
  },
  aliases: {},
  extensions: {}
};

export function assertAnalysisProfile(profile: AnalysisProfile, layer: string, aspect: string): void {
  if (!profile.supportedLayers.includes(layer as AnalysisProfile["supportedLayers"][number])) {
    throw new Error(`ANALYSIS_LAYER_UNSUPPORTED: ${profile.id}/${layer}`);
  }
  if (!profile.supportedAspects.includes(aspect as AnalysisProfile["supportedAspects"][number])) {
    throw new Error(`ANALYSIS_ASPECT_UNSUPPORTED: ${profile.id}/${aspect}`);
  }
}
