import { createRunOncePlugin } from "expo/config-plugins";
import { withAppFunctions } from "./with-app-functions";

const pkg = { name: "expo-ai-intents", version: "0.1.0" };

export default createRunOncePlugin(withAppFunctions, pkg.name, pkg.version);
