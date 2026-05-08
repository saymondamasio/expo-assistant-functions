import {
	AndroidConfig,
	type ConfigPlugin,
	withAndroidManifest,
	withAppBuildGradle,
	withDangerousMod,
	withProjectBuildGradle,
} from "expo/config-plugins";
import type {
	AppFunctionsPluginProps,
	FunctionDefinition,
} from "./app-functions.types";
import { generateAppFunctionsKotlin } from "./with-generated-sources";

const { addMetaDataItemToMainApplication, getMainApplicationOrThrow } =
	AndroidConfig.Manifest;

const PREWARM_REGION_START = "// expo-assistant-functions prewarm start";
const PREWARM_REGION_END = "// expo-assistant-functions prewarm end";
const MARKED_PREWARM_REGION = new RegExp(
	`${PREWARM_REGION_START}[\\s\\S]*?${PREWARM_REGION_END}\\n?`,
	"gm",
);
const IMPORT_APP_FUNCTION_HEADLESS =
	"import expo.modules.appfunctions.AppFunctionHeadlessService";

const ASSISTANT_FUNCTIONS_META_KEYS = [
	"expo.modules.appfunctions.WAIT_FOR_MODULE_MS",
	"expo.modules.appfunctions.INVOKE_TIMEOUT_MS",
	"expo.modules.appfunctions.HEADLESS_TASK_TIMEOUT_MS",
] as const;

function applyAssistantFunctionsMetaData(
	mainApp: AndroidConfig.Manifest.ManifestApplication,
	props: AppFunctionsPluginProps,
): void {
	const waitMs = props.coldStartTimeoutMs ?? 60_000;
	const invokeMs = props.invokeTimeoutMs ?? 45_000;
	const headlessMs = props.headlessTaskTimeoutMs ?? 60_000;

	const mainAppAny = mainApp as Record<string, unknown>;
	const existingMeta = (mainAppAny["meta-data"] ?? []) as Array<{
		$?: Record<string, string>;
	}>;
	const keySet = new Set<string>(ASSISTANT_FUNCTIONS_META_KEYS);
	const filtered = existingMeta.filter(
		(m) => !keySet.has(m.$?.["android:name"] ?? ""),
	);
	const injected = [
		{
			$: {
				"android:name": "expo.modules.appfunctions.WAIT_FOR_MODULE_MS",
				"android:value": String(waitMs),
			},
		},
		{
			$: {
				"android:name": "expo.modules.appfunctions.INVOKE_TIMEOUT_MS",
				"android:value": String(invokeMs),
			},
		},
		{
			$: {
				"android:name": "expo.modules.appfunctions.HEADLESS_TASK_TIMEOUT_MS",
				"android:value": String(headlessMs),
			},
		},
	];
	mainAppAny["meta-data"] = [...filtered, ...injected];
}

function ensurePrewarmInMainApplication(
	src: string,
	enablePrewarm: boolean,
): string {
	let result = src.replace(MARKED_PREWARM_REGION, "");
	if (!enablePrewarm) {
		result = result.replace(
			new RegExp(`^${IMPORT_APP_FUNCTION_HEADLESS}\\n`, "m"),
			"",
		);
		return result;
	}

	if (!result.includes(IMPORT_APP_FUNCTION_HEADLESS)) {
		const lifecycleImport = "import expo.modules.ApplicationLifecycleDispatcher";
		if (result.includes(lifecycleImport)) {
			result = result.replace(
				lifecycleImport,
				`${lifecycleImport}\n${IMPORT_APP_FUNCTION_HEADLESS}`,
			);
		} else {
			const lastImport = result.lastIndexOf("import ");
			const endOfImport = result.indexOf("\n", lastImport) + 1;
			result = `${result.slice(0, endOfImport)}${IMPORT_APP_FUNCTION_HEADLESS}\n${result.slice(endOfImport)}`;
		}
	}

	const onCreateAnchor =
		/(override fun onCreate\(\)\s*\{\s*\n\s*super\.onCreate\(\))/;
	if (onCreateAnchor.test(result)) {
		result = result.replace(
			onCreateAnchor,
			`$1
    ${PREWARM_REGION_START}
    AppFunctionHeadlessService.start(this)
    ${PREWARM_REGION_END}`,
		);
	}

	return result;
}

const APPFUNCTIONS_VERSION = "1.0.0-alpha08";
const KSP_VERSION = "2.1.20-2.0.1";

const KSP_PLUGIN_LINE = 'apply plugin: "com.google.devtools.ksp"';
const KSP_DEP_CLASSPATH = `classpath('com.google.devtools.ksp:symbol-processing-gradle-plugin:${KSP_VERSION}')`;

const KSP_BLOCK = `ksp {
    arg("appfunctions:aggregateAppFunctions", "true")
    arg("appfunctions:generateMetadataFromSchema", "true")
}`;

const APPFUNCTIONS_IMPL_DEP = `implementation('androidx.appfunctions:appfunctions:${APPFUNCTIONS_VERSION}')`;
const APPFUNCTIONS_SERVICE_DEP = `implementation('androidx.appfunctions:appfunctions-service:${APPFUNCTIONS_VERSION}')`;
const APPFUNCTIONS_KSP_DEP = `ksp('androidx.appfunctions:appfunctions-compiler:${APPFUNCTIONS_VERSION}')`;

function patchAppBuildGradle(contents: string): string {
	let result = contents;

	if (!result.includes(KSP_PLUGIN_LINE)) {
		const lines = result.split("\n");
		const lastApplyIdx = lines.reduce((last, line, idx) => {
			if (line.trimStart().startsWith("apply plugin:")) {
				return idx;
			}
			return last;
		}, -1);
		lines.splice(lastApplyIdx + 1, 0, KSP_PLUGIN_LINE);
		result = lines.join("\n");
	}

	if (!result.includes("appfunctions:aggregateAppFunctions")) {
		const reactBlockIdx = result.indexOf("react {");
		if (reactBlockIdx === -1) {
			const pluginsEnd = result.lastIndexOf("apply plugin:");
			const nextNewline = result.indexOf("\n", pluginsEnd);
			const afterPlugins = result.slice(nextNewline);
			const pluginLine = result.slice(pluginsEnd, nextNewline + 1);
			const before = result.slice(0, pluginsEnd);
			result = `${before}${pluginLine}\n${KSP_BLOCK}\n${afterPlugins.slice(1)}`;
		} else {
			const beforeReact = result.slice(0, reactBlockIdx);
			const afterReact = result.slice(reactBlockIdx);
			result = `${beforeReact}\n${KSP_BLOCK}\n\n${afterReact}`;
		}
	}

	if (!result.includes("androidx.appfunctions:appfunctions")) {
		const depsBlock = result.lastIndexOf("dependencies {");
		if (depsBlock !== -1) {
			const insertPoint = result.indexOf("\n", depsBlock) + 1;
			const depLines = `\n    ${APPFUNCTIONS_IMPL_DEP}\n    ${APPFUNCTIONS_SERVICE_DEP}\n    ${APPFUNCTIONS_KSP_DEP}\n`;
			result = `${result.slice(0, insertPoint)}${depLines}${result.slice(insertPoint)}`;
		}
	}

	return result;
}

function patchAndroidManifest(
	manifest: AndroidConfig.Manifest.AndroidManifest,
	props: AppFunctionsPluginProps,
): AndroidConfig.Manifest.AndroidManifest {
	const mainApp = getMainApplicationOrThrow(manifest);
	const existing = mainApp["meta-data"]?.find(
		(m: { $?: Record<string, string> }) =>
			m.$?.["android:name"] === "android.app.appfunctions.app_metadata"
	);

	if (!existing) {
		addMetaDataItemToMainApplication(
			mainApp,
			"android.app.appfunctions.app_metadata",
			"@xml/app_metadata",
			"resource"
		);
	}

	// EXECUTE_APP_FUNCTIONS is for caller apps (agents) that invoke other packages'
	// functions — not required for the publishing app. See developer.android.com/ai/appfunctions

	// Register ContentProvider bridge
	const mainAppAny = mainApp as Record<string, unknown>;
	const providers = (mainAppAny.provider ?? []) as Array<{
		$?: Record<string, string>;
	}>;
	const hasBridge = providers.some(
		(p: { $?: Record<string, string> }) =>
			p.$?.["android:name"] ===
			"expo.modules.appfunctions.AppFunctionBridgeProvider"
	);

	if (!hasBridge) {
		const providerEntry = {
			$: {
				"android:name": "expo.modules.appfunctions.AppFunctionBridgeProvider",
				// biome-ignore lint/suspicious/noTemplateCurlyInString: Android manifest placeholder
				"android:authorities": "${applicationId}.appfunctions.bridge",
				"android:exported": "false",
			},
		};
		mainAppAny.provider = [...providers, providerEntry];
	}

	// Register Headless JS service
	const svcArr = (mainAppAny.service ?? []) as Array<{
		$?: Record<string, string>;
	}>;
	const hasHeadless = svcArr.some(
		(s: { $?: Record<string, string> }) =>
			s.$?.["android:name"] ===
			"expo.modules.appfunctions.AppFunctionHeadlessService"
	);
	if (!hasHeadless) {
		mainAppAny.service = [
			...svcArr,
			{
				$: {
					"android:name":
						"expo.modules.appfunctions.AppFunctionHeadlessService",
					"android:exported": "false",
				},
			},
		];
	}

	applyAssistantFunctionsMetaData(mainApp, props);

	return manifest;
}

function withGeneratedKotlinSources(
	config: Parameters<ConfigPlugin>[0],
	props: AppFunctionsPluginProps
) {
	return withDangerousMod(config, [
		"android",
		(config) => {
			generateAppFunctionsKotlin(config.modRequest.projectRoot, props);
			return config;
		},
	]);
}

function withAppBuildGradleMod(
	config: Parameters<ConfigPlugin>[0],
	_props: AppFunctionsPluginProps
) {
	return withAppBuildGradle(config, (config) => {
		config.modResults.contents = patchAppBuildGradle(
			config.modResults.contents
		);
		return config;
	});
}

function patchProjectBuildGradle(contents: string): string {
	if (contents.includes("symbol-processing-gradle-plugin")) {
		return contents;
	}

	const buildscriptIdx = contents.indexOf("buildscript {");
	if (buildscriptIdx !== -1) {
		const depsStart = contents.indexOf("dependencies {", buildscriptIdx);
		if (depsStart !== -1) {
			const insertPoint = contents.indexOf("\n", depsStart) + 1;
			return `${contents.slice(0, insertPoint)}        ${KSP_DEP_CLASSPATH}\n${contents.slice(insertPoint)}`;
		}
	}

	return contents;
}

function withProjectBuildGradleMod(
	config: Parameters<ConfigPlugin>[0],
	_props: AppFunctionsPluginProps
) {
	return withProjectBuildGradle(config, (config) => {
		config.modResults.contents = patchProjectBuildGradle(
			config.modResults.contents
		);
		return config;
	});
}

function withAndroidManifestMod(
	config: Parameters<ConfigPlugin>[0],
	props: AppFunctionsPluginProps,
) {
	return withAndroidManifest(config, (c) => {
		c.modResults = patchAndroidManifest(c.modResults, props);
		return c;
	});
}

/** Override Jetpack default (false) so PlatformAppFunctionService can bind. */
function withPlatformAppFunctionServiceEnabled(
	config: Parameters<ConfigPlugin>[0]
) {
	return withDangerousMod(config, [
		"android",
		(c) => {
			const { mkdirSync, writeFileSync } = require("node:fs");
			const { join } = require("node:path");
			const dir = join(
				c.modRequest.projectRoot,
				"android",
				"app",
				"src",
				"main",
				"res",
				"values"
			);
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "expo_assistant_functions_bools.xml"),
				`<?xml version="1.0" encoding="utf-8"?>
<resources>
	<bool name="enablePlatformAppFunctionService">true</bool>
</resources>
`
			);
			return c;
		},
	]);
}

const MAIN_APP_CLASS_FULL =
	/(class\s+MainApplication\s*:\s*Application\s*\(\s*\)\s*,\s*ReactApplication\s*)\{/;
const MAIN_APP_CLASS_SIMPLE =
	/(class\s+MainApplication\s*:\s*Application\s*\(\s*\)\s*)\{/;
const MAIN_APP_CLASS_ANY = /(class\s+MainApplication[^{]*)\{/;
const IMPORT_APPFUNCTION =
	"import androidx.appfunctions.service.AppFunctionConfiguration\n";

const APPFUNCTION_CONFIG_REGION_START =
	"// expo-assistant-functions AppFunctionConfiguration start";
const APPFUNCTION_CONFIG_REGION_END =
	"// expo-assistant-functions AppFunctionConfiguration end";

const MARKED_APPFUNCTION_CONFIG = new RegExp(
	`${APPFUNCTION_CONFIG_REGION_START}[\\s\\S]*?${APPFUNCTION_CONFIG_REGION_END}\\n?`,
	"m"
);

function toPascalCase(str: string): string {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Jetpack needs explicit factories for generated *Impl classes (see AppFunctionConfiguration.Builder). */
function buildMarkedAppFunctionConfigurationBlock(
	functions: FunctionDefinition[]
): string {
	if (!functions.length) {
		return `    ${APPFUNCTION_CONFIG_REGION_START}
    override val appFunctionConfiguration: AppFunctionConfiguration
        get() = AppFunctionConfiguration.Builder().build()
    ${APPFUNCTION_CONFIG_REGION_END}
`;
	}
	const factories = functions
		.map((f) => {
			const cls = `${toPascalCase(f.name)}Impl`;
			return `            .addEnclosingClassFactory(${cls}::class.java) { ${cls}() }`;
		})
		.join("\n");
	return `    ${APPFUNCTION_CONFIG_REGION_START}
    override val appFunctionConfiguration: AppFunctionConfiguration
        get() = AppFunctionConfiguration.Builder()
${factories}
            .build()
    ${APPFUNCTION_CONFIG_REGION_END}
`;
}

function ensureGeneratedImplImports(
	src: string,
	functions: FunctionDefinition[]
): string {
	const anchor = "import androidx.appfunctions.service.AppFunctionConfiguration";
	if (!src.includes(anchor)) {
		return src;
	}
	const lines = functions
		.map((f) => {
			const line = `import expo.modules.appfunctions.generated.${toPascalCase(f.name)}Impl`;
			return src.includes(line) ? null : line;
		})
		.filter(Boolean) as string[];
	if (!lines.length) {
		return src;
	}
	return src.replace(anchor, `${anchor}\n${lines.join("\n")}`);
}

function patchMainApplication(
	src: string,
	functions: FunctionDefinition[]
): string {
	let result = ensureGeneratedImplImports(src, functions);

	if (MARKED_APPFUNCTION_CONFIG.test(result)) {
		result = result.replace(
			MARKED_APPFUNCTION_CONFIG,
			buildMarkedAppFunctionConfigurationBlock(functions)
		);
		return ensureGeneratedImplImports(result, functions);
	}

	if (!result.includes(IMPORT_APPFUNCTION.trim())) {
		const lastImport = result.lastIndexOf("import ");
		const endOfImport = result.indexOf("\n", lastImport) + 1;
		result = `${result.slice(0, endOfImport)}${IMPORT_APPFUNCTION}${result.slice(endOfImport)}`;
	}
	result = ensureGeneratedImplImports(result, functions);

	if (!result.includes("AppFunctionConfiguration.Provider")) {
		if (MAIN_APP_CLASS_FULL.test(result)) {
			result = result.replace(
				MAIN_APP_CLASS_FULL,
				"$1, AppFunctionConfiguration.Provider {"
			);
		} else if (MAIN_APP_CLASS_SIMPLE.test(result)) {
			result = result.replace(
				MAIN_APP_CLASS_SIMPLE,
				"$1, AppFunctionConfiguration.Provider {"
			);
		} else if (MAIN_APP_CLASS_ANY.test(result)) {
			const match = result.match(MAIN_APP_CLASS_ANY);
			if (match?.[1] && !match[1].includes("AppFunctionConfiguration")) {
				result = result.replace(
					MAIN_APP_CLASS_ANY,
					"$1, AppFunctionConfiguration.Provider {"
				);
			}
		}
	}

	const emptyGetter =
		/override val appFunctionConfiguration: AppFunctionConfiguration\n\s+get\(\) = AppFunctionConfiguration\.Builder\(\)\.build\(\)/;
	if (emptyGetter.test(result)) {
		result = result.replace(
			emptyGetter,
			buildMarkedAppFunctionConfigurationBlock(functions).trimEnd()
		);
		return ensureGeneratedImplImports(result, functions);
	}

	if (!result.includes("appFunctionConfiguration")) {
		const lastBrace = result.lastIndexOf("}");
		result = `${result.slice(0, lastBrace)}\n${buildMarkedAppFunctionConfigurationBlock(functions)}\n${result.slice(lastBrace)}`;
	}

	return result;
}

function withMainApplicationMod(
	config: Parameters<ConfigPlugin>[0],
	props: AppFunctionsPluginProps
) {
	return withDangerousMod(config, [
		"android",
		(config) => {
			const { readFileSync, writeFileSync } = require("node:fs");
			const { join } = require("node:path");
			const { globSync } = require("node:fs");

			const projectRoot = config.modRequest.projectRoot;
			const androidPkg = (
				config as unknown as { android?: { package?: string } }
			).android?.package;

			let mainAppPath: string;

			if (androidPkg) {
				const pkgDir = join(...androidPkg.split("."));
				mainAppPath = join(
					projectRoot,
					"android",
					"app",
					"src",
					"main",
					"java",
					pkgDir,
					"MainApplication.kt"
				);
			} else {
				// Fallback: find MainApplication.kt via glob
				const matches = globSync("**/MainApplication.kt", {
					cwd: join(projectRoot, "android", "app", "src", "main", "java"),
					absolute: true,
				});
				mainAppPath = matches[0] ?? "";
			}

			if (!mainAppPath) {
				return config;
			}

			try {
				const contents = readFileSync(mainAppPath, "utf-8");
				const functions = props.functions ?? [];
				let patched = patchMainApplication(contents, functions);
				patched = ensurePrewarmInMainApplication(
					patched,
					props.prewarmHeadlessOnLaunch !== false,
				);
				if (patched !== contents) {
					writeFileSync(mainAppPath, patched);
				}
			} catch {
				// File not found or not writable — skip silently
			}

			return config;
		},
	]);
}

const withAppFunctionsAndroid: ConfigPlugin<AppFunctionsPluginProps> = (
	config,
	props
) => {
	let modifiedConfig = config;
	modifiedConfig = withGeneratedKotlinSources(modifiedConfig, props);
	modifiedConfig = withMainApplicationMod(modifiedConfig, props);
	modifiedConfig = withProjectBuildGradleMod(modifiedConfig, props);
	modifiedConfig = withAppBuildGradleMod(modifiedConfig, props);
	modifiedConfig = withAndroidManifestMod(modifiedConfig, props);
	modifiedConfig = withPlatformAppFunctionServiceEnabled(modifiedConfig);
	return modifiedConfig;
};

export { withAppFunctionsAndroid };
