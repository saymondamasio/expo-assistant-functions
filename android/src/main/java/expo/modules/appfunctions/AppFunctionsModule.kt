package expo.modules.appfunctions

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class AppFunctionsModule : Module() {
    companion object {
        private val readyLatch = CountDownLatch(1)

        var instance: AppFunctionsModule? = null
            private set

        @JvmStatic
        fun waitForInstance(timeoutMs: Long): AppFunctionsModule? {
            readyLatch.await(timeoutMs, TimeUnit.MILLISECONDS)
            return instance
        }

        @JvmStatic
        fun isReady(): Boolean = readyLatch.count == 0L
    }

    private val pendingCalls = ConcurrentHashMap<String, CompletableDeferred<String>>()

    override fun definition() = ModuleDefinition {
        Name("AppFunctions")

        Events("onFunctionCall")

        instance = this@AppFunctionsModule
        readyLatch.countDown()

        AsyncFunction("handleFunctionResult") { callId: String, resultJson: String ->
            pendingCalls[callId]?.complete(resultJson)
            pendingCalls.remove(callId)
            Unit
        }
    }

    fun invokeFunction(name: String, params: Map<String, Any?>, hostContext: Context): String {
        val callId = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<String>()
        pendingCalls[callId] = deferred

        sendEvent("onFunctionCall", mapOf(
            "callId" to callId,
            "functionName" to name,
            "params" to params
        ))

        val timeoutMs = ExpoAssistantFunctionsConfig.invokeTimeoutMs(hostContext)
        return runBlocking(Dispatchers.IO) {
            try {
                withTimeout(timeoutMs) { deferred.await() }
            } catch (_: Exception) {
                pendingCalls.remove(callId)
                """{"error":"Function call timed out"}"""
            }
        }
    }
}
