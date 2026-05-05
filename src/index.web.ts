// Web stub — App Functions/Intents are native-only features

function noop() {
	/* web stub */
}

export const on = () => noop;
export const off = noop;
export const setFunctionHandler = noop;
export const clearFunctionHandler = noop;
export const handleFunctionResult = noop;
export const addFunctionListener = noop;
export const removeFunctionListener = noop;

export function createTypedHandler() {
	return async () => ({ error: "Not supported on web" });
}
