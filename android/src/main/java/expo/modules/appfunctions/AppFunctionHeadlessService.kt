package expo.modules.appfunctions

import android.content.Context
import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class AppFunctionHeadlessService : HeadlessJsTaskService() {

    companion object {
        private const val TASK_NAME = "AppFunctionHeadlessTask"

        fun start(context: Context) {
            val intent = Intent(context, AppFunctionHeadlessService::class.java)
            context.startService(intent)
        }
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val taskTimeoutMs = ExpoAssistantFunctionsConfig.headlessTaskTimeoutMs(this)
        return HeadlessJsTaskConfig(
            TASK_NAME,
            Arguments.createMap(),
            taskTimeoutMs,
            true, // allowedInForeground
        )
    }
}
