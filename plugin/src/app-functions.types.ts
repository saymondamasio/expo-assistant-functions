export interface FunctionParameter {
	description?: string;
	name: string;
	required?: boolean;
	type: "string" | "number" | "boolean" | "enum" | "object";
	values?: string[];
}

export interface FunctionReturn {
	description?: string;
	type: string;
}

export interface FunctionDefinition {
	description?: string;
	name: string;
	parameters?: FunctionParameter[];
	returns?: FunctionReturn;
}

export interface AppFunctionsPluginProps {
	appDescription?: string;
	appfunctionsVersion?: string;
	category?: string;
	/**
	 * Max time to wait for the native AppFunctions module (cold start / RN init).
	 * Injected as application meta-data `expo.modules.appfunctions.WAIT_FOR_MODULE_MS`.
	 * @default 60000
	 */
	coldStartTimeoutMs?: number;
	/**
	 * When `true`, generated App Functions return immediately with `{ accepted, jobId, ... }`
	 * and the RN/JS bridge runs inside a WorkManager worker (avoids blocking Binder/service).
	 * Meta-data: `expo.modules.appfunctions.DEFER_TO_WORK_MANAGER`.
	 * @default false
	 */
	deferAppFunctionsToWorkManager?: boolean;
	functions: FunctionDefinition[];
	/**
	 * Headless JS task timeout (ms) for `AppFunctionHeadlessService` — must cover cold RN bootstrap.
	 * Meta-data: `expo.modules.appfunctions.HEADLESS_TASK_TIMEOUT_MS`.
	 * @default 60000
	 */
	headlessTaskTimeoutMs?: number;
	/**
	 * Max time to wait for JS to call `handleFunctionResult` after `onFunctionCall`.
	 * Meta-data: `expo.modules.appfunctions.INVOKE_TIMEOUT_MS`.
	 * @default 45000
	 */
	invokeTimeoutMs?: number;
	kspVersion?: string;
	/**
	 * Call `AppFunctionHeadlessService.start` from `Application.onCreate` so RN is warmer
	 * before the first App Function (reduces ANR risk on cold invoke).
	 * @default true
	 */
	prewarmHeadlessOnLaunch?: boolean;
}
