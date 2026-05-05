import type { ConfigPlugin } from "expo/config-plugins";
import type { AppFunctionsPluginProps } from "./app-functions.types";
import { withAppFunctionsAndroid } from "./with-app-functions-android";
import { withAppFunctionsIos } from "./with-app-functions-ios";

const withAppFunctions: ConfigPlugin<AppFunctionsPluginProps> = (
	config,
	props
) => {
	let modifiedConfig = config;
	modifiedConfig = withAppFunctionsAndroid(modifiedConfig, props);
	modifiedConfig = withAppFunctionsIos(modifiedConfig, props);
	return modifiedConfig;
};

export type { AppFunctionsPluginProps } from "./app-functions.types";
export { withAppFunctions };
