package expo.modules.appfunctions

import android.content.Context
import android.content.pm.PackageManager

/**
 * Reads optional <application><meta-data> entries injected by the config plugin.
 * Lets apps tune bridge timing without forking the module.
 */
object ExpoAssistantFunctionsConfig {
    private const val META_PREFIX = "expo.modules.appfunctions."
    const val META_WAIT_FOR_MODULE_MS = META_PREFIX + "WAIT_FOR_MODULE_MS"
    const val META_INVOKE_TIMEOUT_MS = META_PREFIX + "INVOKE_TIMEOUT_MS"
    const val META_HEADLESS_TASK_TIMEOUT_MS = META_PREFIX + "HEADLESS_TASK_TIMEOUT_MS"
    const val META_DEFER_TO_WORK_MANAGER = META_PREFIX + "DEFER_TO_WORK_MANAGER"

    const val DEFAULT_WAIT_FOR_MODULE_MS = 60_000L
    const val DEFAULT_INVOKE_TIMEOUT_MS = 45_000L
    const val DEFAULT_HEADLESS_TASK_TIMEOUT_MS = 60_000

    fun waitForModuleMs(context: Context): Long =
        readLongMeta(context, META_WAIT_FOR_MODULE_MS, DEFAULT_WAIT_FOR_MODULE_MS)

    fun invokeTimeoutMs(context: Context): Long =
        readLongMeta(context, META_INVOKE_TIMEOUT_MS, DEFAULT_INVOKE_TIMEOUT_MS)

    fun headlessTaskTimeoutMs(context: Context): Long =
        readLongMeta(
            context,
            META_HEADLESS_TASK_TIMEOUT_MS,
            DEFAULT_HEADLESS_TASK_TIMEOUT_MS.toLong(),
        ).coerceIn(10_000L, 300_000L)

    fun deferToWorkManager(context: Context): Boolean =
        readBoolMeta(context, META_DEFER_TO_WORK_MANAGER, false)

    private fun readBoolMeta(context: Context, key: String, default: Boolean): Boolean {
        return try {
            val ai = context.packageManager.getApplicationInfo(
                context.packageName,
                PackageManager.GET_META_DATA,
            )
            val bundle = ai.metaData ?: return default
            if (!bundle.containsKey(key)) {
                return default
            }
            when (val v = bundle[key]) {
                is Boolean -> v
                is String -> v.equals("true", ignoreCase = true) || v == "1"
                is Int -> v != 0
                else -> default
            }
        } catch (_: Exception) {
            default
        }
    }

    private fun readLongMeta(context: Context, key: String, default: Long): Long {
        return try {
            val ai = context.packageManager.getApplicationInfo(
                context.packageName,
                PackageManager.GET_META_DATA,
            )
            val bundle = ai.metaData ?: return default
            if (!bundle.containsKey(key)) {
                return default
            }
            when (val v = bundle[key]) {
                is Int -> v.toLong()
                is Long -> v
                is String -> v.toLongOrNull() ?: default
                else -> default
            }
        } catch (_: Exception) {
            default
        }
    }
}
