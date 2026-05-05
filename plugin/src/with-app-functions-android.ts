import {
	AndroidConfig,
	type ConfigPlugin,
	withAndroidManifest,
	withAppBuildGradle,
	withDangerousMod,
	withProjectBuildGradle,
} from "expo/config-plugins";
import type { AppFunctionsPluginProps } from "./app-functions.types";
import { generateAppFunctionsKotlin } from "./with-generated-sources";

const { addMetaDataItemToMainApplication, getMainApplicationOrThrow } =
	AndroidConfig.Manifest;

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
	manifest: AndroidConfig.Manifest.AndroidManifest
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

	const permissions = manifest.manifest?.["uses-permission"] ?? [];
	const hasPermission = permissions.some(
		(p: { $?: Record<string, string> }) =>
			p.$?.["android:name"] === "android.permission.EXECUTE_APP_FUNCTIONS"
	);

	if (!hasPermission) {
		manifest.manifest = {
			...manifest.manifest,
			"uses-permission": [
				...permissions,
				{ $: { "android:name": "android.permission.EXECUTE_APP_FUNCTIONS" } },
			],
		};
	}

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

function withAndroidManifestMod(config: Parameters<ConfigPlugin>[0]) {
	return withAndroidManifest(config, (config) => {
		config.modResults = patchAndroidManifest(config.modResults);
		return config;
	});
}

const MAIN_APP_CLASS_FULL =
	/(class\s+MainApplication\s*:\s*Application\s*\(\s*\)\s*,\s*ReactApplication\s*)\{/;
const MAIN_APP_CLASS_SIMPLE =
	/(class\s+MainApplication\s*:\s*Application\s*\(\s*\)\s*)\{/;
const MAIN_APP_CLASS_ANY = /(class\s+MainApplication[^{]*)\{/;
const IMPORT_APPFUNCTION =
	"import androidx.appfunctions.service.AppFunctionConfiguration;\n";
const PROVIDER_CONFIG = `
    override val appFunctionConfiguration: AppFunctionConfiguration
        get() = AppFunctionConfiguration.Builder().build()`;

function patchMainApplication(src: string): string {
	if (src.includes("AppFunctionConfiguration")) {
		return src;
	}
	let result = src;

	if (!result.includes(IMPORT_APPFUNCTION.trim())) {
		const lastImport = result.lastIndexOf("import ");
		const endOfImport = result.indexOf("\n", lastImport) + 1;
		result = `${result.slice(0, endOfImport)}${IMPORT_APPFUNCTION}${result.slice(endOfImport)}`;
	}

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

	if (!result.includes("appFunctionConfiguration")) {
		const lastBrace = result.lastIndexOf("}");
		result = `${result.slice(0, lastBrace)}\n${PROVIDER_CONFIG}\n${result.slice(lastBrace)}`;
	}

	return result;
}

function withMainApplicationMod(config: Parameters<ConfigPlugin>[0]) {
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
				const patched = patchMainApplication(contents);
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
	modifiedConfig = withMainApplicationMod(modifiedConfig);
	modifiedConfig = withProjectBuildGradleMod(modifiedConfig, props);
	modifiedConfig = withAppBuildGradleMod(modifiedConfig, props);
	modifiedConfig = withAndroidManifestMod(modifiedConfig);
	return modifiedConfig;
};

export { withAppFunctionsAndroid };
