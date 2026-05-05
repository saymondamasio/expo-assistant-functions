import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { ConfigPlugin } from "expo/config-plugins";
import { withDangerousMod } from "expo/config-plugins";
import type { AppFunctionsPluginProps } from "./app-functions.types";

const TEMPLATE_FILENAME = "ConcreteAppIntent.swift.template";

function getTemplatePath(): string {
	const nodeRequire = createRequire(
		// biome-ignore lint: __dirname needed for CommonJS plugin
		join(__dirname, "..", "package.json")
	);
	const pkgPath = nodeRequire.resolve("expo-assistant-functions/package.json");
	return join(dirname(pkgPath), "plugin", "src", TEMPLATE_FILENAME);
}

function generateParameterCode(
	parameters: NonNullable<
		AppFunctionsPluginProps["functions"]
	>[number]["parameters"]
): string {
	if (!parameters?.length) {
		return "";
	}

	return parameters
		.map((param) => {
			const swiftType = mapSwiftType(param.type);
			if (param.required !== false) {
				return `    @Parameter(title: "${param.description ?? param.name}")
    var ${param.name}: ${swiftType}`;
			}
			return `    @Parameter(title: "${param.description ?? param.name}")
    var ${param.name}: ${swiftType}?`;
		})
		.join("\n\n");
}

function mapSwiftType(type: string): string {
	switch (type) {
		case "string":
			return "String";
		case "number":
			return "Double";
		case "boolean":
			return "Bool";
		case "enum":
			return "String";
		default:
			return "String";
	}
}

function generateIntentSwift(
	intent: NonNullable<AppFunctionsPluginProps["functions"]>[number],
	template: string
): string {
	const title =
		intent.name.charAt(0).toUpperCase() +
		intent.name.slice(1).replace(/([A-Z])/g, " $1");
	const description = intent.description ?? intent.name;
	const parameterCode = generateParameterCode(intent.parameters);
	const resultType = intent.returns?.type
		? mapSwiftType(intent.returns.type)
		: "String";

	const replacements: Record<string, string> = {
		"${INTENT_NAME}": intent.name,
		"${INTENT_TITLE}": title,
		"${INTENT_DESCRIPTION}": description,
		"${PARAMETERS}": parameterCode,
		"${RESULT_TYPE}": resultType,
	};

	let processed = template;
	for (const [token, value] of Object.entries(replacements)) {
		processed = processed.split(token).join(value);
	}

	return processed;
}

function loadTemplate(): string {
	try {
		return readFileSync(getTemplatePath(), "utf-8");
	} catch {
		return `import AppIntents
import Foundation
import ExpoAppIntents

@available(iOS 16.0, *)
struct \${INTENT_NAME}: AppIntent {
    static let intentName = "\${INTENT_NAME}"
    static let title: LocalizedStringResource = "\${INTENT_TITLE}"
    static let description: String = "\${INTENT_DESCRIPTION}"

\${PARAMETERS}
    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<\${RESULT_TYPE}?> {
        let sendableParameters: [String: Any] = ExpoAppIntents.anyToDictionary(parent:self)

        let rawResult: [String: Any]? = try await ExpoAppIntentsModule.shared()?
            .postNotificationAndWait(name: Self.intentName, parameters: sendableParameters)

        return .result(value: (rawResult?["value"] as? \${RESULT_TYPE}))
    }
}
`;
	}
}

export const withAppFunctionsIos: ConfigPlugin<AppFunctionsPluginProps> = (
	config,
	props
) => {
	const { functions } = props;

	if (!functions?.length) {
		return config;
	}

	return withDangerousMod(config, [
		"ios",
		(config) => {
			const iosRoot = config.modRequest.platformProjectRoot;
			const appIntentsDir = join(iosRoot, "AppIntents");

			// Clean old generated files before regenerating
			try {
				rmSync(appIntentsDir, { recursive: true, force: true });
			} catch {
				// Directory might not exist yet
			}
			mkdirSync(appIntentsDir, { recursive: true });

			const template = loadTemplate();

			for (const intent of functions) {
				const content = generateIntentSwift(intent, template);
				writeFileSync(join(appIntentsDir, `${intent.name}.swift`), content);
			}

			return config;
		},
	]);
};
