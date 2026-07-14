import {
  RELATIONSHIP_ONTOLOGY_VERSION,
  type AssetNodeType,
  type RelationshipCode,
  type RelationshipTypeDefinition
} from "./types";

const impactableNodeTypes = [
  "domain",
  "dataModel",
  "dataEntity",
  "dataField",
  "api",
  "apiOperation",
  "event",
  "businessRule",
  "stateMachine",
  "integration",
  "quality",
  "observability",
  "adr",
  "applicationService"
] as const satisfies readonly AssetNodeType[];

const ownedNodeTypes = impactableNodeTypes.filter((nodeType) => nodeType !== "domain");
const serviceNodeTypes = ["applicationService"] as const satisfies readonly AssetNodeType[];
const apiNodeTypes = ["api", "apiOperation"] as const satisfies readonly AssetNodeType[];
const dataNodeTypes = ["dataEntity", "dataField"] as const satisfies readonly AssetNodeType[];
const dataAccessSourceTypes = [...serviceNodeTypes, ...apiNodeTypes] as const satisfies readonly AssetNodeType[];

const relationshipDefinitions = [
  {
    code: "OWNS",
    allowedSourceTypes: ["domain"],
    allowedTargetTypes: ownedNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "weak",
    defaultConfidence: 0.85,
    terminal: true,
    description: "Domain to Asset",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "PROVIDES",
    allowedSourceTypes: serviceNodeTypes,
    allowedTargetTypes: apiNodeTypes,
    forwardPropagation: true,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 0.95,
    terminal: false,
    description: "Service to API",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "CONSUMES",
    allowedSourceTypes: serviceNodeTypes,
    allowedTargetTypes: apiNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 0.95,
    terminal: false,
    description: "Service to API",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "READS",
    allowedSourceTypes: dataAccessSourceTypes,
    allowedTargetTypes: dataNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "medium",
    defaultConfidence: 0.9,
    terminal: false,
    description: "API or Service to Entity",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "WRITES",
    allowedSourceTypes: dataAccessSourceTypes,
    allowedTargetTypes: dataNodeTypes,
    forwardPropagation: true,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 0.95,
    terminal: false,
    description: "API or Service to Entity",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "REFERENCES",
    allowedSourceTypes: dataNodeTypes,
    allowedTargetTypes: dataNodeTypes,
    forwardPropagation: true,
    reversePropagation: true,
    strength: "medium",
    defaultConfidence: 0.8,
    terminal: false,
    description: "Entity to Entity",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "CONTAINS",
    allowedSourceTypes: ["dataModel", "dataEntity"],
    allowedTargetTypes: dataNodeTypes,
    forwardPropagation: true,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 1,
    terminal: false,
    description: "DataModel to Entity or Field",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "EMITS",
    allowedSourceTypes: dataAccessSourceTypes,
    allowedTargetTypes: ["event"],
    forwardPropagation: true,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 0.95,
    terminal: false,
    description: "Service or API to Event",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "SUBSCRIBES",
    allowedSourceTypes: serviceNodeTypes,
    allowedTargetTypes: ["event"],
    forwardPropagation: false,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 0.9,
    terminal: false,
    description: "Service to Event",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "CARRIES",
    allowedSourceTypes: ["event"],
    allowedTargetTypes: dataNodeTypes,
    forwardPropagation: true,
    reversePropagation: true,
    strength: "strong",
    defaultConfidence: 0.9,
    terminal: false,
    description: "Event to Entity or Field",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "GOVERNS",
    allowedSourceTypes: ["businessRule"],
    allowedTargetTypes: impactableNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "medium",
    defaultConfidence: 0.85,
    terminal: false,
    description: "Rule to Asset",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "CONTROLS",
    allowedSourceTypes: ["stateMachine"],
    allowedTargetTypes: ["dataEntity", "api", "apiOperation"],
    forwardPropagation: true,
    reversePropagation: true,
    strength: "medium",
    defaultConfidence: 0.9,
    terminal: false,
    description: "StateMachine to Entity or API",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "VERIFIES",
    allowedSourceTypes: ["quality"],
    allowedTargetTypes: impactableNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "weak",
    defaultConfidence: 0.8,
    terminal: true,
    description: "Quality requirement to Asset",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "OBSERVES",
    allowedSourceTypes: ["observability"],
    allowedTargetTypes: impactableNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "weak",
    defaultConfidence: 0.8,
    terminal: true,
    description: "Observability design to Asset",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "DECIDES",
    allowedSourceTypes: ["adr"],
    allowedTargetTypes: impactableNodeTypes,
    forwardPropagation: false,
    reversePropagation: true,
    strength: "weak",
    defaultConfidence: 0.8,
    terminal: true,
    description: "ADR to Asset",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "IMPACTS",
    allowedSourceTypes: ["proposal"],
    allowedTargetTypes: impactableNodeTypes,
    forwardPropagation: true,
    reversePropagation: false,
    strength: "strong",
    defaultConfidence: 1,
    terminal: false,
    description: "Proposal to Asset",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  },
  {
    code: "GENERATES",
    allowedSourceTypes: ["proposal"],
    allowedTargetTypes: ["contextPack"],
    forwardPropagation: false,
    reversePropagation: false,
    strength: "weak",
    defaultConfidence: 1,
    terminal: true,
    description: "Proposal to ContextPack",
    version: RELATIONSHIP_ONTOLOGY_VERSION
  }
] as const satisfies readonly RelationshipTypeDefinition[];

export const relationshipOntology: ReadonlyMap<RelationshipCode, RelationshipTypeDefinition> = new Map(
  relationshipDefinitions.map((definition) => [definition.code, definition] as const)
);

export function validateRelationshipEndpoints(
  code: RelationshipCode,
  sourceType: AssetNodeType,
  targetType: AssetNodeType
): void {
  const definition = relationshipOntology.get(code);
  if (
    !definition ||
    !definition.allowedSourceTypes.includes(sourceType) ||
    !definition.allowedTargetTypes.includes(targetType)
  ) {
    throw new Error(`RELATIONSHIP_ENDPOINT_INVALID: ${code} ${sourceType} -> ${targetType}`);
  }
}
