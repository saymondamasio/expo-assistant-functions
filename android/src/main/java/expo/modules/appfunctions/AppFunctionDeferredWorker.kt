package expo.modules.appfunctions

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

/**
 * Runs [AppFunctionBridge.invokeThroughProvider] off the App Function / Binder path,
 * after the platform has already received an immediate `accepted` JSON response.
 */
class AppFunctionDeferredWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    companion object {
        const val KEY_FUNCTION = "expo.modules.appfunctions.worker.function"
        const val KEY_PARAMS_JSON = "expo.modules.appfunctions.worker.params_json"
        const val WORK_TAG_DEFERRED = "expo-appfunction-deferred"
        const val WORK_TAG_PREFIX = "expo-appfunction-job-"
    }

    override suspend fun doWork(): Result {
        val functionName = inputData.getString(KEY_FUNCTION)
            ?: return Result.failure()
        val paramsJson = inputData.getString(KEY_PARAMS_JSON) ?: "{}"
        return try {
            val map = AppFunctionBridge.paramsFromJsonString(paramsJson)
            AppFunctionBridge.invokeThroughProvider(applicationContext, functionName, map)
            Result.success()
        } catch (_: Exception) {
            Result.failure()
        }
    }
}
