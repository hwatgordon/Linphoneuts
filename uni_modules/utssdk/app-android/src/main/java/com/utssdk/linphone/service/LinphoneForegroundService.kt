package com.utssdk.linphone.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.utssdk.linphone.R

class LinphoneForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        val initialText = getString(R.string.linphone_foreground_notification_message)
        startForeground(NOTIFICATION_ID, buildNotification(initialText))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val statusText = intent?.getStringExtra(EXTRA_STATUS_TEXT)
        if (!statusText.isNullOrBlank()) {
            updateNotification(statusText)
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun updateNotification(text: String) {
        val manager = getSystemService(NotificationManager::class.java) ?: return
        manager.notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        val channelId = ensureChannel()
        return NotificationCompat.Builder(this, channelId)
            .setContentTitle(getString(R.string.linphone_foreground_notification_title))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_sys_phone_call)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .build()
    }

    private fun ensureChannel(): String {
        val channelId = getString(R.string.linphone_notification_channel_id)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channelName = getString(R.string.linphone_notification_channel_name)
            val channelDescription = getString(R.string.linphone_notification_channel_description)
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_LOW).apply {
                description = channelDescription
                setShowBadge(false)
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager?.createNotificationChannel(channel)
        }
        return channelId
    }

    companion object {
        private const val NOTIFICATION_ID = 0xC11
        private const val EXTRA_STATUS_TEXT = "com.utssdk.linphone.extra.STATUS_TEXT"

        fun start(context: Context, status: String? = null) {
            val intent = Intent(context, LinphoneForegroundService::class.java)
            if (!status.isNullOrBlank()) {
                intent.putExtra(EXTRA_STATUS_TEXT, status)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, LinphoneForegroundService::class.java)
            context.stopService(intent)
        }
    }
}
