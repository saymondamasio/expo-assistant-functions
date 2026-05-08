package expo.modules.appfunctions

import android.content.Context
import android.net.Uri
import android.os.Bundle
import org.json.JSONObject

object AppFunctionBridge {
    private const val PROVIDER_SUFFIX = ".appfunctions.bridge"

    @JvmStatic
    fun invoke(
        context: Context,
        functionName: String,
        params: Map<String, Any?>,
    ): String {
        val app = context.applicationContext
        if (ExpoAssistantFunctionsConfig.deferToWorkManager(app)) {
            return AppFunctionWorkScheduler.enqueue(app, functionName, params)
        }
        return invokeThroughProvider(app, functionName, params)
    }

    /**
     * Direct ContentProvider bridge (used synchronously and from [AppFunctionDeferredWorker]).
     */
    internal fun invokeThroughProvider(
        context: Context,
        functionName: String,
        params: Map<String, Any?>,
    ): String {
        val authority = "${context.packageName}$PROVIDER_SUFFIX"
        val uri = Uri.parse("content://$authority")
        val bundle = Bundle().apply {
            for ((key, value) in params) {
                putString(key, value?.toString() ?: "")
            }
        }

        return try {
            val result = context.contentResolver.call(
                uri,
                functionName,
                null,
                bundle,
            )
            result?.getString("result")
                ?: """{"error":"No response from module"}"""
        } catch (e: Exception) {
            """{"error":"Bridge error: ${e.message}"}"""
        }
    }

    internal fun paramsToJsonString(params: Map<String, Any?>): String {
        val o = JSONObject()
        for ((k, v) in params) {
            when (v) {
                null -> o.put(k, JSONObject.NULL)
                is Boolean -> o.put(k, v)
                is Int -> o.put(k, v)
                is Long -> o.put(k, v)
                is Double -> o.put(k, v)
                is Float -> o.put(k, v.toDouble())
                else -> o.put(k, v.toString())
            }
        }
        return o.toString()
    }

    internal fun paramsFromJsonString(json: String): Map<String, Any?> {
        val o = JSONObject(json)
        val m = mutableMapOf<String, Any?>()
        val keys = o.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            m[k] = if (o.isNull(k)) null else o.get(k)
        }
        return m
    }
}
