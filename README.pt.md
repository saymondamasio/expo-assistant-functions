# expo-assistant-functions

Módulo Expo para intenções da app orientadas por IA. Define funções na app em `app.json` e expõe-as a:

- **Android**: App Functions (Gemini, Google Assistant)
- **iOS**: App Intents (Siri, Atalhos)

## Instalação

```bash
npm install expo-assistant-functions
```

## Configuração

Adiciona ao `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-assistant-functions",
        {
          "appDescription": "Descrição da app para assistentes de IA",
          "category": "myapp",
          "functions": [
            {
              "name": "createProject",
              "description": "Cria um novo projeto",
              "parameters": [
                {
                  "name": "projectName",
                  "type": "string",
                  "description": "Nome do projeto"
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

### Opções Android (tempos e prewarm)

O plugin injeta `<meta-data>` na `<application>` para o módulo nativo ler timeouts em runtime. Os métodos `@AppFunction` gerados são **`suspend fun`**, executados pelo Jetpack `androidx.appfunctions` numa corrotina — sem bloquear a main thread (a UI não congela enquanto o JS responde).

| Opção `app.json` | Meta-data | Predefinição | Descrição |
|------------------|-----------|--------------|-----------|
| `coldStartTimeoutMs` | `WAIT_FOR_MODULE_MS` | `60000` | Tempo máximo à espera do módulo nativo `AppFunctions` (RN a inicializar). |
| `invokeTimeoutMs` | `INVOKE_TIMEOUT_MS` | `45000` | Tempo máximo até o JS chamar `handleFunctionResult` após `onFunctionCall`. |
| `headlessTaskTimeoutMs` | `HEADLESS_TASK_TIMEOUT_MS` | `60000` | Timeout do `HeadlessJsTaskConfig` no `AppFunctionHeadlessService`. |
| `prewarmHeadlessOnLaunch` | — | `true` | Se `true`, o plugin insere `AppFunctionHeadlessService.start(this)` em `MainApplication.onCreate` para aquecer o runtime antes do primeiro pedido. |

Exemplo:

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

**Nota:** o comando `adb shell cmd app_function execute-app-function` tem um limite ~30 s ao nível do Binder do sistema; valores maiores em `invokeTimeoutMs` ajudam quando o assistente invoca a app diretamente (sem o `cmd`). O **prewarm** acelera a primeira invocação em cold start.

### Chamar função pelo terminal (ADB)

Após `expo prebuild` e `expo run:android`, podes invocar uma função diretamente via ADB para testar:

```bash
adb shell "cmd app_function execute-app-function \
    --package com.teu.pacote \
    --function expo.modules.appfunctions.generated.CreateProjectImpl#createProject \
    --parameters '{\"projectName\":[\"Nome do projeto\"]}'"
```

| Parâmetro | Descrição |
|---|---|
| `--package` | `applicationId` da app (normalmente `expo.android.package` no `app.json`) |
| `--function` | `expo.modules.appfunctions.generated.{Nome}PascalImpl#{nomecamelCase}` |
| `--parameters` | JSON com chave = nome do parâmetro, valor = array com o valor |

> **Dica:** os parâmetros vão sempre dentro de um array no JSON, mesmo que seja um valor único (ex: `[\"texto\"]`).

### Arquitetura (suspend, sem bloqueio de thread)

```
cmd app_function ──► AppFunctionService (Jetpack)
                       │  (corrotina; @AppFunction roda na main por defeito)
                       ▼
               GeneratedImpl.foo  (suspend fun)
                       │
                       ▼
        AppFunctionsModule.invokeFromAppFunction(ctx, name, params)  (suspend)
                       │
                       ├── if (!isReady) AppFunctionHeadlessService.start(...)
                       │   awaitReady(timeout)            ── suspend, sem runBlocking
                       ▼
        sendEvent("onFunctionCall", …) ──► JS handler
                                              │
                                              ▼
                            nativeModule.handleFunctionResult(callId, json)
                                              │  (Function/JSI no New Architecture)
                                              ▼
                           pendingCalls[callId].complete(json)  ── retoma a corrotina
```

O bloqueio anterior (`runBlocking { deferred.await() }` num `ContentProvider`) foi removido: a função do Jetpack permanece suspensa na corrotina dele, libertando a main thread. Por isso o app não congela enquanto a função roda.

## Utilização

```ts
import { createTypedHandler, addFunctionListener } from "expo-assistant-functions";
import type { AppFunctionMap } from "expo-assistant-functions";

addFunctionListener(
  createTypedHandler<AppFunctionMap>({
    createProject: async ({ projectName }) => {
      // `projectName` está tipado como `string`
      return { success: true };
    },
  })
);
```

Ou por função:

```ts
import { on } from "expo-assistant-functions";

on("createProject", async ({ projectName }) => {
  return { success: true };
});
```

## Como funciona

Durante o `expo prebuild`, o config plugin:

1. Lê as definições de funções a partir do `app.json`
2. Gera ficheiros Kotlin para Android (KSP + `androidx.appfunctions`) com `suspend fun` que invocam o módulo Expo diretamente
3. Gera ficheiros Swift para iOS (`AppIntents`)
4. Regista o `AppFunctionHeadlessService` (cold start) e meta-data de timeouts
5. Altera o `build.gradle` (Android) para incluir dependências KSP + App Functions

## Requisitos

- Expo SDK 55+
- Android 16 (API 36) para App Functions
- iOS 16+ para App Intents

## Testar no Android (terminal / ADB)

O Android expõe comandos de shell para listar e executar App Functions no dispositivo. Isto confirma que o `prebuild` gerou o metadata e que o sistema indexou as funções da tua app. A listagem é o passo de verificação recomendado na [documentação oficial](https://developer.android.com/ai/appfunctions).

1. Liga um **dispositivo ou emulador** com API 36+ e confirma que o `adb` o vê: `adb devices`.
2. Instala o build da app no dispositivo (por exemplo `npx expo run:android` após `expo prebuild`).

### Listar funções registadas

```bash
adb shell cmd app_function list-app-functions
```

Na saída, procura o **package** da app (`applicationId`, normalmente `expo.android.package` no `app.json`) e os identificadores das funções. Se a lista for grande, filtra no computador:

```bash
adb shell cmd app_function list-app-functions | grep com.teu.pacote
```

### Invocar (executar) uma função

Usa `execute-app-function` com o package da app, o identificador da função (como aparece na listagem ou no padrão abaixo) e um JSON de parâmetros. O formato de `--parameters` segue o que o sistema espera para cada tipo (para `string`, costuma ser um mapa de nome → lista de valores).

**Identificador da função (`--function`):** para uma função declarada com `"name": "createProject"` no plugin, a implementação gerada fica em `expo.modules.appfunctions.generated.CreateProjectImpl` e o método é `createProject`, ou seja:

`expo.modules.appfunctions.generated.CreateProjectImpl#createProject`

Substitui `CreateProject` / `createProject` pelo **PascalCase** da classe `*Impl` e pelo **nome camelCase** da função no `app.json`.

Exemplo completo (ajusta package, função e parâmetros à tua app):

```bash
adb shell "cmd app_function execute-app-function \
    --package com.saymondamasio95.nossocusto \
    --function expo.modules.appfunctions.generated.CreateProjectImpl#createProject \
    --parameters '{\"projectName\":[\"Nome do projeto\"]}'"
```

**Notas:**

- O `adb shell` com aspas externas evita que a shell do host parta o JSON com espaços ou chaves.
- Escapa as aspas duplas dentro do JSON (`\"`) como no exemplo.
- A app deve estar **instalada**; em alguns cenários convém tê-la aberta ou em segundo plano para o handler em JavaScript estar registado.

### Script neste repositório

Para desenvolvimento do módulo, existe um script que só lista funções:

```bash
npm run verify:android-app-functions
```

## Licença

MIT
