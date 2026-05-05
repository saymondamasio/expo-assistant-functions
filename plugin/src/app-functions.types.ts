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
	coldStartTimeoutMs?: number;
	functions: FunctionDefinition[];
	kspVersion?: string;
}
