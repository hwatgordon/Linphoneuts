package com.utssdk.linphone

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.net.Uri
import android.util.Log

class LinphonePluginInitializer : ContentProvider() {

    override fun onCreate(): Boolean {
        val appContext = context?.applicationContext
        if (appContext == null) {
            Log.w(TAG, "Linphone plugin initializer created without application context")
            return false
        }

        runCatching {
            LinphoneBridge.initPlugin(appContext, emptyMap<String, Any?>())
            Log.i(TAG, "Linphone plugin bootstrap requested")
        }.onFailure { throwable ->
            Log.w(TAG, "Failed to bootstrap Linphone plugin", throwable)
        }
        return true
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?
    ): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?
    ): Int = 0

    companion object {
        private const val TAG = "LinphoneInitializer"
    }
}
