export const SEMANTIC_SCHEMA_VERSION = "nebula.3a.semantic.v1" as const;

export interface SemanticSourceBinding {
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
  semanticSchemaVersion: typeof SEMANTIC_SCHEMA_VERSION;
}

export interface SemanticScope {
  applicationServiceId: string;
  scopePath: string;
}

export interface SemanticManifestIdentityInput {
  id: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
}

export interface SemanticProjectionIdentity extends SemanticScope {
  manifestId: string;
  generationId: string;
  baselineId: string;
  profileId: string;
  profileVersion: string;
  projectionSchemaVersion: string;
  semanticSchemaVersion: typeof SEMANTIC_SCHEMA_VERSION;
  sourceProjectionManifestId: string;
  sourceCoverageManifestId: string;
  knowledgeGenerationId: string;
  coverageGenerationId: string;
  relationshipVersion: string;
  catalogVersion: string;
  catalogDigest: string;
}

export function validateSemanticSourceBinding(scope: SemanticScope, binding: SemanticSourceBinding): SemanticSourceBinding {
  assertScope(scope);
  const fields: Array<keyof SemanticSourceBinding> = [
    "sourceProjectionManifestId",
    "sourceCoverageManifestId",
    "knowledgeGenerationId",
    "coverageGenerationId",
    "relationshipVersion",
    "catalogVersion",
    "catalogDigest"
  ];
  if (fields.some((field) => typeof binding[field] !== "string" || binding[field].trim() === "")) {
    throw new Error("SEMANTIC_SOURCE_BINDING_INVALID");
  }
  if (binding.semanticSchemaVersion !== SEMANTIC_SCHEMA_VERSION) {
    throw new Error("SEMANTIC_SOURCE_BINDING_INVALID");
  }
  return binding;
}

export function semanticProjectionIdentity(
  scope: SemanticScope,
  manifest: SemanticManifestIdentityInput,
  binding: SemanticSourceBinding
): SemanticProjectionIdentity {
  assertScope(scope);
  const manifestFields: Array<keyof SemanticManifestIdentityInput> = [
    "id",
    "generationId",
    "baselineId",
    "profileId",
    "profileVersion",
    "projectionSchemaVersion"
  ];
  if (manifestFields.some((field) => typeof manifest[field] !== "string" || manifest[field].trim() === "")) {
    throw new Error("SEMANTIC_MANIFEST_IDENTITY_INVALID");
  }
  validateSemanticSourceBinding(scope, binding);
  return {
    ...scope,
    manifestId: manifest.id,
    generationId: manifest.generationId,
    baselineId: manifest.baselineId,
    profileId: manifest.profileId,
    profileVersion: manifest.profileVersion,
    projectionSchemaVersion: manifest.projectionSchemaVersion,
    ...binding
  };
}

function assertScope(scope: SemanticScope): void {
  if (typeof scope.applicationServiceId !== "string" || scope.applicationServiceId.trim() === "" || typeof scope.scopePath !== "string" || scope.scopePath.trim() === "") {
    throw new Error("SEMANTIC_SCOPE_REQUIRED");
  }
}
