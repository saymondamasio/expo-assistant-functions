# expo-ai-intents

Módulo Expo para intenções da app orientadas por IA. Define funções na app em `app.json` e expõe-as a:

- **Android**: App Functions (Gemini, Google Assistant)
- **iOS**: App Intents (Siri, Atalhos)

## Instalação

```bash
npm install expo-ai-intents
```

## Configuração

Adiciona ao `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-ai-intents",
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

O plugin injeta `<meta-data>` na `<application>` para o bridge nativo ler timeouts em runtime. Isto ajuda a evitar ANR em cold start e a alinhar o headless JS com a espera do `ContentProvider`.

| Opção `app.json` | Meta-data | Predefinição | Descrição |
|------------------|-----------|--------------|-----------|
| `coldStartTimeoutMs` | `WAIT_FOR_MODULE_MS` | `60000` | Tempo máximo à espera do módulo nativo `AppFunctions` (RN a inicializar). |
| `invokeTimeoutMs` | `INVOKE_TIMEOUT_MS` | `45000` | Tempo máximo até o JS chamar `handleFunctionResult` após `onFunctionCall`. |
| `headlessTaskTimeoutMs` | `HEADLESS_TASK_TIMEOUT_MS` | `60000` | Timeout do `HeadlessJsTaskConfig` no `AppFunctionHeadlessService`. |
| `deferAppFunctionsToWorkManager` | `DEFER_TO_WORK_MANAGER` | `false` | Se `true`, a resposta da App Function é imediata (`accepted` + `jobId`) e o bridge JS corre num job do WorkManager. |
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
          "deferAppFunctionsToWorkManager": false,
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

**Nota (defer + WorkManager):** com `deferAppFunctionsToWorkManager: true`, o assistente recebe logo um JSON do tipo `{"accepted":true,"jobId":"...","functionName":"...","deferred":true}` — **não** o resultado final do handler JS. O trabalho continua em background; usa isto para fugir ao timeout do Binder (~30s) / ANR no serviço em cold start.

**Nota:** o comando `adb shell cmd app_function execute-app-function` pode continuar a ter um limite de ~30 s ao nível do Binder do sistema; valores maiores ajudam sobretudo quando o assistente invoca a app diretamente. O **prewarm** reduz o trabalho feito dentro da primeira invocação em cold start (menos risco de ANR no serviço).

## Utilização

```ts
import { createTypedHandler, addFunctionListener } from "expo-ai-intents";
import type { AppFunctionMap } from "expo-ai-intents";

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
import { on } from "expo-ai-intents";

on("createProject", async ({ projectName }) => {
  return { success: true };
});
```

## Como funciona

Durante o `expo prebuild`, o config plugin:

1. Lê as definições de funções a partir do `app.json`
2. Gera ficheiros Kotlin para Android (KSP + `androidx.appfunctions`)
3. Gera ficheiros Swift para iOS (`AppIntents`)
4. Regista um `ContentProvider` de ponte para suporte a cold start
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
