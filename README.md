# expo-ai-intents

Expo module for AI-powered app intents. Define in-app functions in `app.json` and expose them to:

- **Android**: App Functions (Gemini, Google Assistant)
- **iOS**: App Intents (Siri, Shortcuts)

## Install

```bash
npm install expo-ai-intents
```

## Configure

Add to `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-ai-intents",
        {
          "appDescription": "My app description for AI assistants",
          "category": "myapp",
          "functions": [
            {
              "name": "createProject",
              "description": "Creates a new project",
              "parameters": [
                {
                  "name": "projectName",
                  "type": "string",
                  "description": "Project name"
                }
              ]
            }
          ]
        }
      ]
    ]
  }
}
```

## Usage

```ts
import { createTypedHandler, addFunctionListener } from "expo-ai-intents";
import type { AppFunctionMap } from "expo-ai-intents";

addFunctionListener(
  createTypedHandler<AppFunctionMap>({
    createProject: async ({ projectName }) => {
      // `projectName` is typed as `string`
      return { success: true };
    },
  })
);
```

Or per-function:

```ts
import { on } from "expo-ai-intents";

on("createProject", async ({ projectName }) => {
  return { success: true };
});
```

## How It Works

During `expo prebuild`, the config plugin:

1. Reads function definitions from `app.json`
2. Generates Kotlin files for Android (KSP + `androidx.appfunctions`)
3. Generates Swift files for iOS (`AppIntents`)
4. Registers a `ContentProvider` bridge for cold start support
5. Modifies `build.gradle` (Android) to include KSP + App Functions dependencies

## Requirements

- Expo SDK 55+
- Android 16 (API 36) for App Functions
- iOS 16+ for App Intents

## License

MIT
