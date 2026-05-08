# expo-assistant-functions

Expo module for AI-driven app intents. Define app functions in `app.json` and expose them to:

- **Android**: App Functions (Gemini, Google Assistant)
- **iOS**: App Intents (Siri, Shortcuts)

## Install

```bash
npm install expo-assistant-functions
```

## Configuration

Add to your `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-assistant-functions",
        {
          "appDescription": "App description for AI assistants",
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

### Android Options (timeouts and prewarm)

The plugin injects `<meta-data>` into `<application>` so the native module can read timeouts at runtime. The generated `@AppFunction` methods are **`suspend fun`**, executed by the Jetpack `androidx.appfunctions` on a coroutine — without blocking the main thread (the UI does not freeze while JS responds).

| `app.json` option | Meta-data | Default | Description |
|---|---|---|---|
| `coldStartTimeoutMs` | `WAIT_FOR_MODULE_MS` | `60000` | Max time waiting for the native `AppFunctions` module (RN boot). |
| `invokeTimeoutMs` | `INVOKE_TIMEOUT_MS` | `45000` | Max time until JS calls `handleFunctionResult` after `onFunctionCall`. |
| `headlessTaskTimeoutMs` | `HEADLESS_TASK_TIMEOUT_MS` | `60000` | Timeout of `HeadlessJsTaskConfig` in `AppFunctionHeadlessService`. |
| `prewarmHeadlessOnLaunch` | — | `true` | If `true`, the plugin inserts `AppFunctionHeadlessService.start(this)` in `MainApplication.onCreate` to warm the runtime before the first request. |

Example:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-assistant-functions",
        {
          "category": "myapp",
          "prewarmHeadlessOnLaunch": true,
          "coldStartTimeoutMs": 90000,
          "invokeTimeoutMs": 45000,
          "headlessTaskTimeoutMs": 90000,
          "functions": []
        }
      ]
    ]
  }
}
```

**Note:** the `adb shell cmd app_function execute-app-function` command has a ~30 s limit at the system Binder level; higher `invokeTimeoutMs` values help when the assistant invokes the app directly (without `cmd`). **Prewarm** speeds up the first cold-start invocation.

### Invoke a function via terminal (ADB)

After `expo prebuild` and `expo run:android`, you can invoke a function directly via ADB to test:

```bash
adb shell "cmd app_function execute-app-function \
    --package com.your.package \
    --function expo.modules.appfunctions.generated.CreateProjectImpl#createProject \
    --parameters '{\"projectName\":[\"Project name\"]}'"
```

| Parameter | Description |
|---|---|
| `--package` | App `applicationId` (usually `expo.android.package` in `app.json`) |
| `--function` | `expo.modules.appfunctions.generated.{Name}PascalImpl#{name}camelCase` |
| `--parameters` | JSON with key = parameter name, value = array with the value |

> **Tip:** parameter values always go inside an array in JSON, even for a single value (e.g. `[\"text\"]`).

### Architecture (suspend, non-blocking)

```
cmd app_function ──► AppFunctionService (Jetpack)
                       │  (coroutine; @AppFunction runs on main by default)
                       ▼
               GeneratedImpl.foo  (suspend fun)
                       │
                       ▼
        AppFunctionsModule.invokeFromAppFunction(ctx, name, params)  (suspend)
                       │
                       ├── if (!isReady) AppFunctionHeadlessService.start(...)
                       │   awaitReady(timeout)            ── suspend, no runBlocking
                       ▼
        sendEvent("onFunctionCall", …) ──► JS handler
                                              │
                                              ▼
                            nativeModule.handleFunctionResult(callId, json)
                                              │  (Function/JSI on New Architecture)
                                              ▼
                           pendingCalls[callId].complete(json)  ── resumes coroutine
```

The previous blocking approach (`runBlocking { deferred.await() }` inside a `ContentProvider`) has been removed: the Jetpack function stays suspended on its coroutine, freeing the main thread. This is why the app does not freeze while the function runs.

## Usage

```ts
import { createTypedHandler, addFunctionListener } from "expo-assistant-functions";
import type { AppFunctionMap } from "expo-assistant-functions";

addFunctionListener(
  createTypedHandler<AppFunctionMap>({
    createProject: async ({ projectName }) => {
      // `projectName` is typed as `string`
      return { success: true };
    },
  })
);
```

Or per function:

```ts
import { on } from "expo-assistant-functions";

on("createProject", async ({ projectName }) => {
  return { success: true };
});
```

## How it works

During `expo prebuild`, the config plugin:

1. Reads function definitions from `app.json`
2. Generates Kotlin files for Android (KSP + `androidx.appfunctions`) with `suspend fun` that call the Expo module directly
3. Generates Swift files for iOS (`AppIntents`)
4. Registers `AppFunctionHeadlessService` (cold start) and timeout meta-data
5. Modifies `build.gradle` (Android) to include KSP + App Functions dependencies

## Requirements

- Expo SDK 55+
- Android 16 (API 36) for App Functions
- iOS 16+ for App Intents

## Testing on Android (terminal / ADB)

Android exposes shell commands to list and execute App Functions on the device. This confirms that `prebuild` generated the metadata and the system indexed your app's functions. Listing is the recommended verification step in the [official documentation](https://developer.android.com/ai/appfunctions).

1. Connect a **device or emulator** with API 36+ and confirm `adb` sees it: `adb devices`.
2. Install the app build on the device (e.g. `npx expo run:android` after `expo prebuild`).

### List registered functions

```bash
adb shell cmd app_function list-app-functions
```

In the output, look for the app **package** (`applicationId`, usually `expo.android.package` in `app.json`) and function identifiers. If the list is large, filter on your machine:

```bash
adb shell cmd app_function list-app-functions | grep com.your.package
```

### Invoke (execute) a function

Use `execute-app-function` with the app package, function identifier (as shown in the listing or the pattern below), and a JSON of parameters. The `--parameters` format follows what the system expects for each type (for `string`, it is usually a map of name → list of values).

**Function identifier (`--function`):** for a function declared with `"name": "createProject"` in the plugin, the generated implementation lives at `expo.modules.appfunctions.generated.CreateProjectImpl` and the method is `createProject`, i.e.:

`expo.modules.appfunctions.generated.CreateProjectImpl#createProject`

Replace `CreateProject` / `createProject` with the **PascalCase** of the `*Impl` class and the **camelCase** function name from `app.json`.

Full example (adjust package, function, and parameters to your app):

```bash
adb shell "cmd app_function execute-app-function \
    --package com.saymondamasio95.nossocusto \
    --function expo.modules.appfunctions.generated.CreateProjectImpl#createProject \
    --parameters '{\"projectName\":[\"Project name\"]}'"
```

**Notes:**

- The `adb shell` with outer quotes prevents the host shell from splitting the JSON with spaces or braces.
- Escape double quotes inside JSON (`\"`) as in the example.
- The app must be **installed**; in some scenarios it is best to have it open or in the background so the JavaScript handler is registered.

### Script in this repository

For module development, there is a script that only lists functions:

```bash
npm run verify:android-app-functions
```

## License

MIT
