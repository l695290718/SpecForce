import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type JsonSchema = {
  $ref?: string;
  anyOf?: JsonSchema[];
  const?: string;
  type?: "object" | "array" | "string" | "integer" | "number" | "boolean" | "null";
  enum?: string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
};

type ContractSchema = JsonSchema & {
  $schema: string;
  $id: string;
  $defs: Record<string, JsonSchema>;
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const schemaPath = join(root, "packages", "scan-contract", "schema", "scan-contract-v2.schema.json");
const tsPath = join(root, "packages", "scan-contract", "src", "generated.ts");
const goPath = join(root, "apps", "specforge-cli", "internal", "scancontract", "generated.go");
const check = process.argv.includes("--check");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as ContractSchema;

if (schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
  throw new Error("SCAN_CONTRACT_SCHEMA_DRAFT_INVALID");
}

const generated = {
  [tsPath]: renderTypeScript(schema),
  [goPath]: formatGo(renderGo(schema))
};

const drifted: string[] = [];
for (const [path, contents] of Object.entries(generated)) {
  if (check) {
    if (readExisting(path) !== contents) drifted.push(path.slice(root.length + 1));
  } else {
    writeFileSync(path, contents, "utf8");
  }
}

if (drifted.length > 0) {
  throw new Error(`SCAN_CONTRACT_GENERATED_DRIFT:${drifted.join(",")}`);
}

function renderTypeScript(contract: ContractSchema): string {
  const output = [
    "// Code generated from schema/scan-contract-v2.schema.json. DO NOT EDIT.",
    "",
    ...Object.entries(contract.$defs).flatMap(([name, definition]) => renderTypeScriptDefinition(name, definition)),
    ""
  ];
  return `${output.join("\n").replace(/\n+$/u, "")}\n`;
}

function renderTypeScriptDefinition(name: string, definition: JsonSchema): string[] {
  if (definition.type === "object" && definition.properties) {
    const required = new Set(definition.required ?? []);
    return [
      `export interface ${name} {`,
      ...Object.entries(definition.properties).map(([property, value]) => `  ${property}${required.has(property) ? "" : "?"}: ${typeScriptType(value)};`),
      "}",
      ""
    ];
  }
  return [`export type ${name} = ${typeScriptType(definition)};`, ""];
}

function typeScriptType(definition: JsonSchema): string {
  if (definition.$ref) return refName(definition.$ref);
  if (definition.anyOf) return definition.anyOf.map(typeScriptType).join(" | ");
  if (definition.const !== undefined) return JSON.stringify(definition.const);
  if (definition.enum) return definition.enum.map((value) => JSON.stringify(value)).join(" | ");
  if (definition.type === "array") return `Array<${typeScriptType(requiredSchema(definition.items, "array items"))}>`;
  if (definition.type === "object") {
    if (definition.properties) {
      const required = new Set(definition.required ?? []);
      const fields = Object.entries(definition.properties).map(([property, value]) => `${property}${required.has(property) ? "" : "?"}: ${typeScriptType(value)}`);
      return `{ ${fields.join("; ")} }`;
    }
    return definition.additionalProperties === false ? "Record<string, never>" : `Record<string, ${definition.additionalProperties && typeof definition.additionalProperties === "object" ? typeScriptType(definition.additionalProperties) : "unknown"}>`;
  }
  if (definition.type === "integer" || definition.type === "number") return "number";
  if (definition.type === "boolean") return "boolean";
  if (definition.type === "null") return "null";
  if (definition.type === "string") return "string";
  throw new Error(`UNSUPPORTED_TYPESCRIPT_SCHEMA:${JSON.stringify(definition)}`);
}

function renderGo(contract: ContractSchema): string {
  const output = [
    "// Code generated from schema/scan-contract-v2.schema.json. DO NOT EDIT.",
    "",
    "package scancontract",
    "",
    ...Object.entries(contract.$defs).flatMap(([name, definition]) => renderGoDefinition(name, definition)),
    ""
  ];
  return output.join("\n");
}

function renderGoDefinition(name: string, definition: JsonSchema): string[] {
  if (definition.type === "object" && definition.properties) {
    const required = new Set(definition.required ?? []);
    return [
      `type ${name} struct {`,
      ...Object.entries(definition.properties).map(([property, value]) => {
        const isRequired = required.has(property);
        return `\t${goName(property)} ${goType(value, !isRequired)} \`json:"${property}${isRequired ? "" : ",omitempty"}"\``;
      }),
      "}",
      ""
    ];
  }
  if (definition.enum) {
    return [
      `type ${name} string`,
      "",
      "const (",
      ...definition.enum.map((value) => `\t${name}${goName(value.toLowerCase())} ${name} = ${JSON.stringify(value)}`),
      ")",
      ""
    ];
  }
  return [`type ${name} ${goType(definition, false)}`, ""];
}

function goType(definition: JsonSchema, optional: boolean): string {
  let value: string;
  if (definition.$ref) value = refName(definition.$ref);
  else if (definition.anyOf) {
    const nonNull = definition.anyOf.filter((candidate) => candidate.type !== "null");
    if (nonNull.length !== 1 || nonNull.length === definition.anyOf.length) throw new Error(`UNSUPPORTED_GO_UNION:${JSON.stringify(definition)}`);
    value = `*${goType(nonNull[0]!, false)}`;
    return optional && !value.startsWith("*") ? `*${value}` : value;
  } else if (definition.const !== undefined || definition.type === "string") value = "string";
  else if (definition.enum) value = "string";
  else if (definition.type === "array") value = `[]${goType(requiredSchema(definition.items, "array items"), false)}`;
  else if (definition.type === "object") {
    value = definition.properties ? "map[string]any" : `map[string]${definition.additionalProperties && typeof definition.additionalProperties === "object" ? goType(definition.additionalProperties, false) : "any"}`;
  } else if (definition.type === "integer") value = "int";
  else if (definition.type === "number") value = "float64";
  else if (definition.type === "boolean") value = "bool";
  else throw new Error(`UNSUPPORTED_GO_SCHEMA:${JSON.stringify(definition)}`);
  return optional && !value.startsWith("[]") && !value.startsWith("map[") ? `*${value}` : value;
}

function refName(reference: string): string {
  const prefix = "#/$defs/";
  if (!reference.startsWith(prefix)) throw new Error(`EXTERNAL_SCHEMA_REFERENCE_FORBIDDEN:${reference}`);
  return reference.slice(prefix.length);
}

function goName(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function requiredSchema(value: JsonSchema | undefined, label: string): JsonSchema {
  if (!value) throw new Error(`SCAN_CONTRACT_SCHEMA_REQUIRED:${label}`);
  return value;
}

function formatGo(contents: string): string {
  const result = spawnSync("gofmt", [], { input: contents, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`GOFMT_FAILED:${result.stderr}`);
  return result.stdout;
}

function readExisting(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
