package com.utssdk.linphone.ui

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.lang.ref.WeakReference

object CallUiController {

    const val EXTRA_CALL_ID = "com.utssdk.linphone.extra.CALL_ID"
    const val EXTRA_CALL_NUMBER = "com.utssdk.linphone.extra.CALL_NUMBER"
    const val EXTRA_CALL_DISPLAY_NAME = "com.utssdk.linphone.extra.CALL_DISPLAY_NAME"
    const val EXTRA_CALL_DIRECTION = "com.utssdk.linphone.extra.CALL_DIRECTION"

    data class CallerInfo(
        val callId: String,
        val number: String?,
        val displayName: String?,
        val direction: String?
    ) {
        companion object {
            fun fromPayload(payload: Map<String, Any?>): CallerInfo {
                val callId = payload["id"].asSafeString()
                    ?: payload["callId"].asSafeString()
                    ?: payload["number"].asSafeString()
                    ?: payload["remote"].asSafeString()
                    ?: System.currentTimeMillis().toString()
                val number = payload["number"].asSafeString() ?: payload["remote"].asSafeString()
                val displayName = payload["displayName"].asSafeString()
                val direction = payload["direction"].asSafeString()
                return CallerInfo(callId, number, displayName, direction)
            }

            fun fromIntent(intent: Intent?): CallerInfo? {
                if (intent == null) {
                    return null
                }
                val callId = intent.getStringExtra(EXTRA_CALL_ID) ?: return null
                val number = intent.getStringExtra(EXTRA_CALL_NUMBER)
                val displayName = intent.getStringExtra(EXTRA_CALL_DISPLAY_NAME)
                val direction = intent.getStringExtra(EXTRA_CALL_DIRECTION)
                return CallerInfo(callId, number, displayName, direction)
            }
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val lock = Any()
    private var activeCallId: String? = null
    private var activityRef: WeakReference<Activity>? = null

    fun showIncomingCallUi(context: Context, payload: Map<String, Any?>) {
        val info = CallerInfo.fromPayload(payload)
        val targetActivity = if (context.isDeviceLocked()) {
            LockScreenIncomingCallActivity::class.java
        } else {
            IncomingCallActivity::class.java
        }

        val shouldLaunch = synchronized(lock) {
            val isSameCall = activeCallId == info.callId
            val existingActivity = activityRef?.get()
            val isShowing = existingActivity != null && !existingActivity.isFinishing && !existingActivity.isDestroyed
            if (isSameCall && isShowing) {
                false
            } else {
                activeCallId = info.callId
                activityRef = null
                true
            }
        }

        if (!shouldLaunch) {
            return
        }

        val intent = Intent(context, targetActivity).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS
            )
            putExtra(EXTRA_CALL_ID, info.callId)
            putExtra(EXTRA_CALL_NUMBER, info.number)
            putExtra(EXTRA_CALL_DISPLAY_NAME, info.displayName)
            putExtra(EXTRA_CALL_DIRECTION, info.direction)
        }

        handler.post {
            context.startActivity(intent)
        }
    }

    fun registerActivity(callId: String?, activity: Activity) {
        synchronized(lock) {
            activeCallId = callId ?: activeCallId
            activityRef = WeakReference(activity)
        }
    }

    fun unregisterActivity(activity: Activity) {
        synchronized(lock) {
            val current = activityRef?.get()
            if (current === activity) {
                activityRef = null
                activeCallId = null
            }
        }
    }

    fun dismiss(reason: String? = null) {
        val activity = synchronized(lock) { activityRef?.get() }
        if (activity == null) {
            synchronized(lock) {
                if (activityRef?.get() == null) {
                    activityRef = null
                    activeCallId = null
                }
            }
            return
        }
        handler.post {
            if (!activity.isFinishing && !activity.isDestroyed) {
                activity.finish()
            }
        }
        synchronized(lock) {
            if (activityRef?.get() === activity) {
                activityRef = null
                activeCallId = null
            }
        }
    }

    private fun Any?.asSafeString(): String? {
        return when (this) {
            null -> null
            is String -> this.takeIf { it.isNotBlank() }
            else -> runCatching { toString() }.getOrNull()?.takeIf { it.isNotBlank() }
        }
    }

    private fun Context.isDeviceLocked(): Boolean {
        val keyguardManager = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            keyguardManager?.isDeviceLocked == true || keyguardManager?.isKeyguardLocked == true
        } else {
            keyguardManager?.inKeyguardRestrictedInputMode() == true
        }
    }
}
