import type { FunctionDefinition } from "./app-functions.types";

function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function mapTsType(type: string, values?: string[]): string {
  switch (type) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "enum":
      return values?.length
        ? values.map((v) => `"${v}"`).join(" | ")
        : "string";
    default:
      return "Record<string, unknown>";
  }
}

function generateParamsInterface(fn: FunctionDefinition): string {
  const params = fn.parameters ?? [];
  if (!params.length) return "";

  const ifaceName = `${toPascalCase(fn.name)}Params`;
  const fields = params
    .map((p) => {
      const optional = p.required === false ? "?" : "";
      const tsType = mapTsType(p.type, p.values);
      const desc = p.description ? `  /** ${p.description} */\n` : "";
      return `${desc}  ${p.name}${optional}: ${tsType}`;
    })
    .join(";\n");

  return `export interface ${ifaceName} {\n${fields};\n}\n`;
}

function generateFunctionMap(functions: FunctionDefinition[]): string {
  const entries = functions
    .map((fn) => {
      const paramsType =
        (fn.parameters?.length ?? 0) > 0
          ? `${toPascalCase(fn.name)}Params`
          : "Record<string, never>";
      return `  ${fn.name}: { params: ${paramsType}; result: unknown }`;
    })
    .join(";\n");

  return entries;
}

function generateTypesContent(functions: FunctionDefinition[]): {
  interfaces: string;
  mapEntries: string;
} | null {
  if (!functions.length) return null;

  const interfaces = functions
    .map((fn) => generateParamsInterface(fn))
    .join("\n");

  const mapEntries = generateFunctionMap(functions);

  return { interfaces, mapEntries };
}

export { generateTypesContent };
