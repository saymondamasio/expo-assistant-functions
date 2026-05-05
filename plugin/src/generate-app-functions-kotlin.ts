import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
	FunctionDefinition,
	FunctionParameter,
} from "./app-functions.types";

const KOTLIN_TYPE_MAP: Record<string, string> = {
	string: "String",
	number: "Double",
	boolean: "Boolean",
	enum: "String",
	object: "String",
};

function kotlinParamAnnotation(param: FunctionParameter): string {
	if (param.type === "enum" && param.values?.length) {
		const values = param.values.map((v) => `"${v}"`).join(", ");
		return `@AppFunctionStringValueConstraint(enumValues = [${values}]) `;
	}
	return "";
}

function kotlinParamType(param: FunctionParameter): string {
	return KOTLIN_TYPE_MAP[param.type] ?? "String";
}

function toPascalCase(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateParamDecl(params: FunctionParameter[]): string {
	if (!params.length) {
		return "";
	}

	const decls = params
		.map((p) => {
			const nullable = p.required === false ? "?" : "";
			return `        ${kotlinParamAnnotation(p)}${p.name}: ${kotlinParamType(p)}${nullable}`;
		})
		.join(",\n");

	return `,\n${decls}`;
}

function generateParamDeclImpl(params: FunctionParameter[]): string {
	if (!params.length) {
		return "";
	}

	const decls = params
		.map((p) => {
			const nullable = p.required === false ? "?" : "";
			return `        ${p.name}: ${kotlinParamType(p)}${nullable}`;
		})
		.join(",\n");

	return `,\n${decls}`;
}

function generateParamsMap(params: FunctionParameter[]): string {
	if (!params.length) {
		return ",\n            emptyMap()";
	}

	const entries = params
		.map((p) => `"${p.name}" to ${p.name}`)
		.join(",\n            ");

	return `,\n            mapOf(\n            ${entries}\n            )`;
}

function generateKDoc(fn: FunctionDefinition): string {
	const params = fn.parameters ?? [];
	const paramDocs = params
		.filter((p) => p.description)
		.map((p) => `@param ${p.name} ${p.description}`)
		.join("\n     * ");

	const desc = fn.description ?? "";

	if (!(desc || paramDocs)) {
		return "";
	}

	const lines = ["/**"];
	if (desc) {
		lines.push(`     * ${desc}`);
	}
	if (paramDocs) {
		lines.push(`     * ${paramDocs}`);
	}
	lines.push("     */");
	lines.push("");

	return lines.join("\n");
}

function loadTemplate(filename: string): string {
	// biome-ignore lint: __dirname needed for CommonJS plugin (compiled to plugin/build/)
	const path = join(__dirname, "..", "src", filename);
	return readFileSync(path, "utf-8");
}

function replaceTokens(
	template: string,
	tokens: Record<string, string>
): string {
	let result = template;
	for (const [token, value] of Object.entries(tokens)) {
		result = result.split(token).join(value);
	}
	return result;
}

function generateSchemaInterface(
	fn: FunctionDefinition,
	category: string
): string {
	const params = fn.parameters ?? [];
	const ifaceName = toPascalCase(fn.name);

	return replaceTokens(loadTemplate("AppFunctionSchema.kt.template"), {
		"${DESCRIPTION}": fn.description ?? fn.name,
		"${FUNCTION_NAME}": fn.name,
		"${INTERFACE_NAME}": ifaceName,
		"${CATEGORY}": category,
		"${KDOC}": generateKDoc(fn),
		"${PARAMETERS}": generateParamDecl(params),
	});
}

function generateImplementation(fn: FunctionDefinition): string {
	const params = fn.parameters ?? [];
	const ifaceName = toPascalCase(fn.name);

	return replaceTokens(loadTemplate("AppFunctionImpl.kt.template"), {
		"${DESCRIPTION}": fn.description ?? fn.name,
		"${FUNCTION_NAME}": fn.name,
		"${INTERFACE_NAME}": ifaceName,
		"${PARAMETERS}": generateParamDeclImpl(params),
		"${PARAMS_MAP}": generateParamsMap(params),
	});
}

function generateSchemasContent(
	functions: FunctionDefinition[],
	category: string
): string {
	if (!functions.length) {
		return "";
	}

	const header = `package expo.modules.appfunctions.generated

import androidx.appfunctions.AppFunctionContext
import androidx.appfunctions.AppFunctionSchemaDefinition
import androidx.appfunctions.AppFunctionStringValueConstraint
`;

	const interfaces = functions
		.map((fn) => generateSchemaInterface(fn, category))
		.join("\n");

	return `${header}\n${interfaces}\n`;
}

function generateImplementationsContent(
	functions: FunctionDefinition[]
): string {
	if (!functions.length) {
		return "";
	}

	const header = `package expo.modules.appfunctions.generated

import androidx.appfunctions.AppFunctionContext
import androidx.appfunctions.service.AppFunction
import expo.modules.appfunctions.AppFunctionsModule
`;

	const impls = functions.map((fn) => generateImplementation(fn)).join("\n\n");

	return `${header}\n${impls}\n`;
}

function generateFunctionFile(
	fn: FunctionDefinition,
	category: string
): string {
	const schemaInterface = generateSchemaInterface(fn, category);
	const implementation = generateImplementation(fn);

	const header = `package expo.modules.appfunctions.generated

import androidx.appfunctions.AppFunctionContext
import androidx.appfunctions.AppFunctionSchemaDefinition
import androidx.appfunctions.AppFunctionStringValueConstraint
import androidx.appfunctions.service.AppFunction
import expo.modules.appfunctions.AppFunctionBridge
import expo.modules.appfunctions.AppFunctionsModule
`;

	return `${header}\n${schemaInterface}\n\n${implementation}\n`;
}

export {
	generateFunctionFile,
	generateImplementationsContent,
	generateSchemasContent,
};
