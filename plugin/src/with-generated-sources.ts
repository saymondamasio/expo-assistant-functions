import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { AppFunctionsPluginProps } from "./app-functions.types";
import { generateFunctionFile } from "./generate-app-functions-kotlin";
import { generateTypesContent } from "./generate-app-functions-types";

function findModuleSrcDir(projectRoot: string): string {
  const nodeRequire = createRequire(join(projectRoot, "package.json"));
  const pkgPath = nodeRequire.resolve("expo-assistant-functions/package.json");
  return join(dirname(pkgPath), "src");
}

function toPascalCase(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateAppMetadataXml(
	projectRoot: string,
	props: AppFunctionsPluginProps
): void {
	const { functions, appDescription } = props;

	const resXmlDir = join(
		projectRoot,
		"android",
		"app",
		"src",
		"main",
		"res",
		"xml"
	);
	mkdirSync(resXmlDir, { recursive: true });

	const desc = appDescription ?? "App with AI-accessible functions";
	const fnNames = functions.map((f) => f.name).join(", ");

	const xml =
		`<?xml version="1.0" encoding="utf-8"?>\n` +
		"<app-description>\n" +
		`    ${desc}. Available functions: ${fnNames || "none"}.\n` +
		"</app-description>\n";
	writeFileSync(join(resXmlDir, "app_metadata.xml"), xml);
}

function generateAppFunctionsKotlin(
	projectRoot: string,
	props: AppFunctionsPluginProps
): void {
	const { functions } = props;

	generateAppMetadataXml(projectRoot, props);

	if (!functions?.length) {
		return;
	}

	const category = props.category ?? "app";
	const generatedDir = join(
		projectRoot,
		"android",
		"app",
		"src",
		"main",
		"java",
		"expo",
		"modules",
		"appfunctions",
		"generated"
	);

	mkdirSync(generatedDir, { recursive: true });

	for (const fn of functions) {
		const content = generateFunctionFile(fn, category);
		const filename = `${toPascalCase(fn.name)}.kt`;
		writeFileSync(join(generatedDir, filename), content);
	}

  // Write types to separate file (gitignored, for debugging/inspection)
  // AND patch build/index.d.ts (what TypeScript actually resolves)
  const tsContent = generateTypesContent(functions);
  if (tsContent) {
    const { readFileSync } = require("node:fs");
    const moduleRoot = findModuleSrcDir(projectRoot);
    const pkgDir = dirname(moduleRoot);
    const buildDir = join(pkgDir, "build");
    mkdirSync(buildDir, { recursive: true });

    // Write separate gitignored file
    const header = `// Gerado automaticamente de app.json — NAO EDITE
// Gerado por expo-assistant-functions config plugin

`;
    const augContent = `${header}${tsContent.interfaces}\nexport interface AppFunctionMap {\n${tsContent.mapEntries}\n}\n`;
    writeFileSync(join(buildDir, "expo-assistant-functions.d.ts"), augContent);

    // Patch build/index.d.ts for actual TypeScript resolution
    const indexDts = join(buildDir, "index.d.ts");
    try {
      let contents = readFileSync(indexDts, "utf-8");
      const appFuncIdx = contents.indexOf("export interface AppFunctionMap");
      if (appFuncIdx !== -1 && tsContent.interfaces) {
        contents = `${contents.slice(0, appFuncIdx)}${tsContent.interfaces}\n${contents.slice(appFuncIdx)}`;
      }
      contents = contents.replace(
        /(export interface AppFunctionMap \{)[^}]*(\})/s,
        `$1\n${tsContent.mapEntries}\n$2`,
      );
      writeFileSync(indexDts, contents);
    } catch { /* ok */ }
  }
}

export { generateAppFunctionsKotlin };
