package expo.modules.appfunctions

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

class AppFunctionsModule : Module() {
    companion object {
        @Volatile
        var instance: AppFunctionsModule? = null
            private set

        @Volatile
        private var readySignal: CompletableDeferred<Unit> = CompletableDeferred()

        private val pendingCalls = ConcurrentHashMap<String, CompletableDeferred<String>>()

        @JvmStatic
        fun isReady(): Boolean = instance != null

        private fun markReady(module: AppFunctionsModule) {
            instance = module
            val signal = readySignal
            if (!signal.isCompleted) {
                signal.complete(Unit)
            }
        }

        private suspend fun awaitReady(timeoutMs: Long): AppFunctionsModule? =
            withTimeoutOrNull(timeoutMs) {
                readySignal.await()
                instance
            }

        // Called from generated *Impl classes. Stays suspend end-to-end so the
        // Jetpack AppFunction coroutine never blocks the main thread (default
        // dispatcher for @AppFunction methods).
        @JvmStatic
        suspend fun invokeFromAppFunction(
            context: Context,
            name: String,
            params: Map<String, Any?>,
        ): String {
            val app = context.applicationContext
            if (instance == null) {
                AppFunctionHeadlessService.start(app)
            }

            val waitMs = ExpoAssistantFunctionsConfig.waitForModuleMs(app)
            val module = awaitReady(waitMs)
                ?: return """{"error":"App is still starting. Please retry in a few seconds."}"""

            return module.invokeFunctionAsync(name, params, app)
        }

        @JvmStatic
        fun completeCall(callId: String, resultJson: String) {
            pendingCalls.remove(callId)?.complete(resultJson)
        }
    }

    override fun definition() = ModuleDefinition {
        Name("AppFunctions")

        Events("onFunctionCall")

        markReady(this@AppFunctionsModule)

        // Synchronous JSI/TurboModule entry point: completes the deferred set
        // up by invokeFunctionAsync without a thread hop.
        Function("handleFunctionResult") { callId: String, resultJson: String ->
            completeCall(callId, resultJson)
            Unit
        }
    }

    private suspend fun invokeFunctionAsync(
        name: String,
        params: Map<String, Any?>,
        hostContext: Context,
    ): String {
        val callId = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<String>()
        pendingCalls[callId] = deferred

        sendEvent(
            "onFunctionCall",
            mapOf(
                "callId" to callId,
                "functionName" to name,
                "params" to params,
            ),
        )

        val timeoutMs = ExpoAssistantFunctionsConfig.invokeTimeoutMs(hostContext)
        return try {
            withTimeout(timeoutMs) { deferred.await() }
        } catch (_: Exception) {
            pendingCalls.remove(callId)
            """{"error":"Function call timed out"}"""
        }
    }
}
