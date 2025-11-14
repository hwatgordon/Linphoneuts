package com.utssdk.linphone

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioManager

class AudioRouter {

    enum class Route(val wireName: String) {
        SYSTEM("system"),
        SPEAKER("speaker"),
        EARPIECE("earpiece"),
        BLUETOOTH("bluetooth");

        companion object {
            fun fromValue(value: String): Route = values().firstOrNull {
                it.wireName.equals(value, ignoreCase = true)
            } ?: SYSTEM
        }
    }

    @SuppressLint("MissingPermission")
    fun applyRoute(context: Context, route: Route): Boolean {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            ?: return false

        return try {
            when (route) {
                Route.SYSTEM -> {
                    audioManager.mode = AudioManager.MODE_NORMAL
                    audioManager.isSpeakerphoneOn = false
                    if (audioManager.isBluetoothScoOn) {
                        audioManager.stopBluetoothSco()
                    }
                }
                Route.SPEAKER -> {
                    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                    audioManager.isSpeakerphoneOn = true
                }
                Route.EARPIECE -> {
                    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                    audioManager.isSpeakerphoneOn = false
                    if (audioManager.isBluetoothScoOn) {
                        audioManager.stopBluetoothSco()
                    }
                }
                Route.BLUETOOTH -> {
                    audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
                    if (!audioManager.isBluetoothScoOn) {
                        audioManager.startBluetoothSco()
                    }
                    audioManager.isSpeakerphoneOn = false
                }
            }

            // TODO: Integrate with Linphone SDK audio state notifications once available.
            true
        } catch (security: SecurityException) {
            false
        }
    }
}
