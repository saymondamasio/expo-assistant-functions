package expo.modules.appfunctions

import android.content.Context
import androidx.work.Data
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONObject
import java.util.UUID

internal object AppFunctionWorkScheduler {
    fun enqueue(
        context: Context,
        functionName: String,
        params: Map<String, Any?>,
    ): String {
        val jobId = UUID.randomUUID().toString()
        val data = Data.Builder()
            .putString(AppFunctionDeferredWorker.KEY_FUNCTION, functionName)
            .putString(
                AppFunctionDeferredWorker.KEY_PARAMS_JSON,
                AppFunctionBridge.paramsToJsonString(params),
            )
            .build()
        val request = OneTimeWorkRequestBuilder<AppFunctionDeferredWorker>()
            .setInputData(data)
            .addTag(AppFunctionDeferredWorker.WORK_TAG_DEFERRED)
            .addTag("${AppFunctionDeferredWorker.WORK_TAG_PREFIX}$jobId")
            .build()
        WorkManager.getInstance(context).enqueue(request)
        return JSONObject()
            .put("accepted", true)
            .put("jobId", jobId)
            .put("functionName", functionName)
            .put("deferred", true)
            .toString()
    }
}
