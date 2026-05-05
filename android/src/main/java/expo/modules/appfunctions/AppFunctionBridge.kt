package expo.modules.appfunctions

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.os.Bundle

object AppFunctionBridge {
    private const val PROVIDER_SUFFIX = ".appfunctions.bridge"

    @JvmStatic
    fun invoke(
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
                uri, functionName, null, bundle,
            )
            result?.getString("result")
                ?: """{"error":"No response from module"}"""
        } catch (e: Exception) {
            """{"error":"Bridge error: ${e.message}"}"""
        }
    }
}
