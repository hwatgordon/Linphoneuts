package com.utssdk.linphone

/**
 * Holds runtime configuration for the Linphone foreground service and core runtime.
 */
data class LinphoneConfig(
    val notificationChannelId: String = DEFAULT_NOTIFICATION_CHANNEL_ID,
    val notificationChannelName: String = DEFAULT_NOTIFICATION_CHANNEL_NAME,
    val notificationChannelDescription: String = DEFAULT_NOTIFICATION_CHANNEL_DESCRIPTION,
    val notificationTitle: String = DEFAULT_NOTIFICATION_TITLE,
    val notificationText: String = DEFAULT_NOTIFICATION_TEXT,
    val notificationId: Int = DEFAULT_NOTIFICATION_ID
) {

    companion object {
        const val DEFAULT_NOTIFICATION_CHANNEL_ID = "linphone_foreground_channel"
        private const val DEFAULT_NOTIFICATION_CHANNEL_NAME = "Linphone foreground service"
        private const val DEFAULT_NOTIFICATION_CHANNEL_DESCRIPTION = "Keeps the Linphone SIP core running in the background"
        private const val DEFAULT_NOTIFICATION_TITLE = "Linphone service active"
        private const val DEFAULT_NOTIFICATION_TEXT = "Maintaining SIP connectivity"
        private const val DEFAULT_NOTIFICATION_ID = 41_042

        fun from(raw: Map<String, Any?>?): LinphoneConfig {
            if (raw == null) {
                return LinphoneConfig()
            }

            return LinphoneConfig(
                notificationChannelId = raw.extractString("serviceNotificationChannelId")
                    ?: DEFAULT_NOTIFICATION_CHANNEL_ID,
                notificationChannelName = raw.extractString("serviceNotificationChannelName")
                    ?: DEFAULT_NOTIFICATION_CHANNEL_NAME,
                notificationChannelDescription = raw.extractString("serviceNotificationChannelDescription")
                    ?: DEFAULT_NOTIFICATION_CHANNEL_DESCRIPTION,
                notificationTitle = raw.extractString("serviceNotificationTitle")
                    ?: DEFAULT_NOTIFICATION_TITLE,
                notificationText = raw.extractString("serviceNotificationText")
                    ?: DEFAULT_NOTIFICATION_TEXT,
                notificationId = raw.extractInt("serviceNotificationId") ?: DEFAULT_NOTIFICATION_ID
            )
        }

        private fun Map<String, Any?>.extractString(key: String): String? {
            val value = this[key] ?: return null
            val stringValue = when (value) {
                is String -> value
                is Number, is Boolean -> value.toString()
                else -> value.toString()
            }
            return stringValue.takeIf { it.isNotBlank() }
        }

        private fun Map<String, Any?>.extractInt(key: String): Int? {
            val value = this[key] ?: return null
            return when (value) {
                is Number -> value.toInt()
                is String -> value.toIntOrNull()
                else -> null
            }
        }
    }
}
