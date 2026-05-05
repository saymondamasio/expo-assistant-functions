package expo.modules.appfunctions

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.os.Bundle

class AppFunctionBridgeProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun call(method: String, arg: String?, extras: Bundle?): Bundle? {
        // On cold start, kick off Headless JS to initialize React Native
        if (!AppFunctionsModule.isReady()) {
            AppFunctionHeadlessService.start(context!!)
        }

        // Wait for Expo module to initialize (cold start can take 5-15s)
        val module = AppFunctionsModule.waitForInstance(60_000L)

        if (module == null) {
            return Bundle().apply {
                putString(
                    "result",
                    """{"error":"App is still starting. Please retry in a few seconds."}""",
                )
            }
        }

        val params = mutableMapOf<String, Any?>()
        extras?.keySet()?.forEach { key ->
            params[key] = extras.get(key)
        }

        val result = try {
            module.invokeFunction(method, params)
        } catch (e: Exception) {
            """{"error":"${e.message}"}"""
        }

        return Bundle().apply {
            putString("result", result)
        }
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor = throw UnsupportedOperationException()

    override fun getType(uri: Uri): String =
        throw UnsupportedOperationException()

    override fun insert(uri: Uri, values: ContentValues?): Uri =
        throw UnsupportedOperationException()

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = throw UnsupportedOperationException()
}
