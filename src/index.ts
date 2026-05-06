// Use dynamic require to avoid TypeScript resolution issues with Bun's workspace layout
const { AppRegistry, Platform } = require("react-native");
const { requireNativeModule } = require("expo-modules-core");

const nativeModule =
	Platform.OS === "ios"
		? requireNativeModule("ExpoAppIntents")
		: requireNativeModule("AppFunctions");

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

export interface FunctionCallEvent {
	callId: string;
	functionName: string;
	params: Record<string, unknown>;
}

export type FunctionHandler = (event: FunctionCallEvent) => Promise<unknown>;

// Base interface — augmented by config plugin during prebuild
export interface AppFunctionMap {}

const isIOS = Platform.OS === "ios";

function sendResult(callId: string, result: unknown): void {
	if (isIOS) {
		nativeModule.completeIntent(callId, { value: result });
	} else {
		nativeModule.handleFunctionResult(callId, JSON.stringify(result));
	}
}

function sendError(callId: string, message: string): void {
	if (isIOS) {
		nativeModule.failIntent(callId, { error: message });
	} else {
		nativeModule.handleFunctionResult(
			callId,
			JSON.stringify({ error: message })
		);
	}
}

const handlers = new Map<string, FunctionHandler>();

// Register the native event listener immediately (works in headless mode too)
const eventName = isIOS ? "onIntent" : "onFunctionCall";
nativeModule.addListener(
	eventName,
	(event: {
		id?: string;
		callId?: string;
		name?: string;
		functionName?: string;
		parameters?: Record<string, unknown>;
		params?: Record<string, unknown>;
	}) => {
		const functionName = event.name ?? event.functionName ?? "";
		const callId = event.id ?? event.callId ?? "";
		const params = event.parameters ?? event.params ?? {};

    const handler = handlers.get(functionName) ?? handlers.get("*");
		if (!handler) {
			sendError(
				callId,
				`No handler registered for "${functionName}". Available: ${[...handlers.keys()].join(", ")}`
			);
			return;
		}

		handler({ functionName, callId, params })
			.then((result) => {
				sendResult(callId, result);
			})
			.catch((error: unknown) => {
				sendError(
					callId,
					error instanceof Error ? error.message : "Unknown error"
				);
			});
	}
);

export function on(functionName: string, handler: FunctionHandler): () => void {
	handlers.set(functionName, handler);
	return () => {
		handlers.delete(functionName);
	};
}

export function off(functionName: string): void {
	handlers.delete(functionName);
}

const isAndroid = Platform.OS === "android";
let headlessRegisterFn: (() => (() => void) | void) | null = null;

// Auto-register headless task at module init (Android only).
// The headless task calls the user-provided registerFn when it starts.
if (isAndroid) {
	AppRegistry.registerHeadlessTask(
		"AppFunctionHeadlessTask",
		() =>
			new Promise<void>((resolve) => {
				if (headlessRegisterFn) {
					const hCleanup = headlessRegisterFn();
					setTimeout(() => {
						try {
							hCleanup?.();
						} catch {
							// cleanup is best-effort in headless mode
						}
						resolve();
					}, 55_000);
				} else {
					setTimeout(resolve, 5_000);
				}
			})
	);
}

/**
 * Registers App Function handlers that work both when the app is in the foreground
 * and when it's in cold-start (headless mode). Call this at module load time (not
 * inside a React component) so handlers are available even before the UI renders.
 *
 * @param registerFn A function that calls `on()` to register each function handler,
 *                   and returns an optional cleanup function.
 */
export function registerHeadlessHandlers(
	registerFn: () => (() => void) | void
): void {
	headlessRegisterFn = registerFn;
	const cleanup = registerFn();
	// cleanup in foreground mode is handled by the caller's lifecycle
	void cleanup;
}

export function createTypedHandler<
  T extends { [K in keyof T]: { params: unknown; result: unknown } },
>(
	fnHandlers: {
		[K in keyof T & string]?: (
			params: T[K]["params"]
		) => Promise<T[K]["result"]>;
	}
): FunctionHandler {
	return (event) => {
		const fnHandler = fnHandlers[event.functionName as keyof T & string];
		if (!fnHandler) {
			return Promise.resolve({
				error: `Unknown function: ${event.functionName}`,
			});
		}
		return fnHandler(event.params as T[keyof T & string]["params"]);
	};
}

// Backward-compatible API

export function setFunctionHandler(handler: FunctionHandler): void {
	handlers.set("*", handler);
}

export function clearFunctionHandler(): void {
	handlers.clear();
}

/** @internal */
export function handleFunctionResult(callId: string, result: unknown): void {
	sendResult(callId, result);
}

export function addFunctionListener(handler: FunctionHandler): void {
	setFunctionHandler(handler);
}

export function removeFunctionListener(): void {
	clearFunctionHandler();
}
