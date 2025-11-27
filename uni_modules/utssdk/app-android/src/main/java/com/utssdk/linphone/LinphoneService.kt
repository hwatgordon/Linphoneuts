package com.utssdk.linphone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

class LinphoneService : Service() {

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "LinphoneService created")
        val config = LinphoneManager.getServiceConfig()
        val notification = buildNotification(config)
        enterForeground(config.notificationId, notification)
        LinphoneManager.startCore(applicationContext)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        Log.i(TAG, "LinphoneService destroyed")
        LinphoneManager.stopCore()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun buildNotification(config: LinphoneConfig): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
        if (manager != null) {
            ensureChannel(manager, config)
        }

        val iconRes = if (applicationInfo.icon != 0) {
            applicationInfo.icon
        } else {
            android.R.drawable.sym_call_incoming
        }

        val builder = NotificationCompat.Builder(this, config.notificationChannelId)
            .setOngoing(true)
            .setSmallIcon(iconRes)
            .setContentTitle(config.notificationTitle)
            .setContentText(config.notificationText)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)

        createLaunchIntent()?.let { builder.setContentIntent(it) }
        return builder.build()
    }

    private fun ensureChannel(notificationManager: NotificationManager, config: LinphoneConfig) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return
        }

        val channel = NotificationChannel(
            config.notificationChannelId,
            config.notificationChannelName,
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = config.notificationChannelDescription
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }
        notificationManager.createNotificationChannel(channel)
    }

    private fun createLaunchIntent(): PendingIntent? {
        val launchIntent = packageManager?.getLaunchIntentForPackage(packageName) ?: return null
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK)
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getActivity(this, 0, launchIntent, flags)
    }

    private fun enterForeground(notificationId: Int, notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
            startForeground(notificationId, notification, type)
        } else {
            startForeground(notificationId, notification)
        }
    }

    companion object {
        private const val TAG = "LinphoneService"

        fun start(context: Context, config: LinphoneConfig) {
            val appContext = context.applicationContext
            LinphoneManager.updateServiceConfig(config)
            val intent = Intent(appContext, LinphoneService::class.java)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(appContext, intent)
                } else {
                    appContext.startService(intent)
                }
            } catch (throwable: Throwable) {
                Log.e(TAG, "Unable to start LinphoneService", throwable)
                LinphoneManager.fail("service", throwable)
            }
        }

        fun stop(context: Context) {
            val appContext = context.applicationContext
            val intent = Intent(appContext, LinphoneService::class.java)
            try {
                appContext.stopService(intent)
            } catch (throwable: Throwable) {
                Log.e(TAG, "Unable to stop LinphoneService", throwable)
            }
        }
    }
}
