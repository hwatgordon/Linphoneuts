package com.utssdk.linphone

import android.content.Context
import android.media.AudioManager
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class LinphoneManager {

    enum class RegistrationState(val wireName: String) {
        IDLE("idle"),
        REGISTERING("registering"),
        REGISTERED("registered"),
        UNREGISTERED("unregistered"),
        FAILED("failed")
    }

    enum class CallState(val wireName: String) {
        IDLE("idle"),
        OUTGOING("outgoing"),
        INCOMING("incoming"),
        ESTABLISHED("established"),
        ENDED("ended"),
        FAILED("failed")
    }

    interface Callback {
        fun onRegistrationStateChanged(state: RegistrationState, message: String?)
        fun onCallStateChanged(state: CallState, info: Map<String, Any?>)
        fun onMessage(payload: Map<String, Any?>)
        fun onAudioRoute(route: AudioRouter.Route)
        fun onDeviceChange(devices: List<Map<String, Any?>>, active: Map<String, Any?>?)
        fun onConnectivity(status: Map<String, Any?>)
        fun onError(category: String, throwable: Throwable)
    }

    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "linphone-manager")
    }
    @Volatile
    private var callback: Callback? = null

    private var configuration: Map<String, Any?> = emptyMap()
    private var currentCallInfo: MutableMap<String, Any?> = mutableMapOf()
    @Volatile
    private var appContext: Context? = null

    fun setCallback(callback: Callback?) {
        this.callback = callback
    }

    fun initialize(context: Context, config: Map<String, Any?>) {
        val applicationContext = context.applicationContext
        executor.execute {
            appContext = applicationContext
            configuration = config
            // TODO: Integrate Linphone SDK initialization once bindings are ready.
            callback?.onRegistrationStateChanged(RegistrationState.IDLE, "Linphone manager initialized")
            notifyDeviceChange(AudioRouter.Route.SYSTEM)
            notifyConnectivityChange(true)
        }
    }

    fun register() {
        executor.execute {
            callback?.onRegistrationStateChanged(RegistrationState.REGISTERING, "Registering")
            simulateDelay(250)
            callback?.onRegistrationStateChanged(RegistrationState.REGISTERED, "Registered")
        }
    }

    fun unregister() {
        executor.execute {
            callback?.onRegistrationStateChanged(RegistrationState.UNREGISTERED, "Unregistered")
            notifyConnectivityChange(false)
        }
    }

    fun dial(number: String) {
        executor.execute {
            currentCallInfo = mutableMapOf("remote" to number)
            callback?.onCallStateChanged(CallState.OUTGOING, currentCallInfo)
            simulateDelay(400)
            callback?.onCallStateChanged(CallState.ESTABLISHED, currentCallInfo)
        }
    }

    fun answer() {
        executor.execute {
            if (currentCallInfo.isEmpty()) {
                currentCallInfo["remote"] = configuration["defaultRemote"] ?: "unknown"
            }
            callback?.onCallStateChanged(CallState.ESTABLISHED, currentCallInfo)
        }
    }

    fun hangup() {
        executor.execute {
            callback?.onCallStateChanged(CallState.ENDED, currentCallInfo)
            currentCallInfo.clear()
        }
    }

    fun sendDtmf(tone: String) {
        executor.execute {
            val info = currentCallInfo.toMutableMap()
            info["tone"] = tone
            // TODO: Integrate Linphone SDK DTMF handling once native bridge is available.
            callback?.onCallStateChanged(CallState.ESTABLISHED, info)
        }
    }

    fun sendMessage(recipient: String, text: String) {
        executor.execute {
            val payload = mapOf(
                "direction" to "outgoing",
                "to" to recipient,
                "text" to text
            )
            // TODO: Bridge to Linphone SDK messaging API.
            callback?.onMessage(payload)
        }
    }

    fun updateAudioRoute(route: AudioRouter.Route) {
        executor.execute {
            callback?.onAudioRoute(route)
            notifyDeviceChange(route)
        }
    }

    fun fail(category: String, throwable: Throwable) {
        executor.execute {
            callback?.onError(category, throwable)
        }
    }

    private fun notifyDeviceChange(route: AudioRouter.Route) {
        val (devices, active) = buildDeviceSnapshot(route)
        callback?.onDeviceChange(devices, active)
    }

    private fun notifyConnectivityChange(connected: Boolean) {
        val payload = mapOf(
            "status" to if (connected) "online" else "offline",
            "detail" to mapOf("reachable" to connected)
        )
        callback?.onConnectivity(payload)
    }

    private fun buildDeviceSnapshot(activeRoute: AudioRouter.Route): Pair<List<Map<String, Any?>>, Map<String, Any?>?> {
        val context = appContext
        val audioManager = context?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
        val bluetoothConnected = audioManager?.isBluetoothScoOn == true || audioManager?.isBluetoothA2dpOn == true

        val descriptors = mutableListOf<MutableMap<String, Any?>>()
        descriptors += deviceDescriptor(
            id = "system",
            label = "System Default",
            type = "system",
            isActive = activeRoute == AudioRouter.Route.SYSTEM,
            isConnected = true,
            isDefault = true
        )
        descriptors += deviceDescriptor(
            id = "speaker",
            label = "Speaker",
            type = "speaker",
            isActive = activeRoute == AudioRouter.Route.SPEAKER,
            isConnected = true
        )
        descriptors += deviceDescriptor(
            id = "earpiece",
            label = "Earpiece",
            type = "earpiece",
            isActive = activeRoute == AudioRouter.Route.EARPIECE,
            isConnected = true
        )
        descriptors += deviceDescriptor(
            id = "bluetooth",
            label = "Bluetooth",
            type = "bluetooth",
            isActive = activeRoute == AudioRouter.Route.BLUETOOTH,
            isConnected = bluetoothConnected
        )

        val activeMutable = descriptors.firstOrNull { it["isActive"] == true }
        descriptors.forEach { it.remove("isActive") }
        val activeDescriptor = activeMutable?.toMap()

        return Pair(descriptors.map { it.toMap() }, activeDescriptor)
    }

    private fun deviceDescriptor(
        id: String,
        label: String,
        type: String,
        isActive: Boolean,
        isConnected: Boolean,
        isDefault: Boolean = false
    ): MutableMap<String, Any?> {
        val descriptor = mutableMapOf<String, Any?>(
            "id" to id,
            "label" to label,
            "type" to type,
            "isConnected" to isConnected
        )
        if (isDefault) {
            descriptor["isDefault"] = true
        }
        if (isActive) {
            descriptor["isActive"] = true
        }
        return descriptor
    }

    fun dispose() {
        executor.execute {
            currentCallInfo.clear()
            configuration = emptyMap()
            notifyConnectivityChange(false)
            notifyDeviceChange(AudioRouter.Route.SYSTEM)
            appContext = null
            callback = null
        }
    }

    private fun simulateDelay(durationMs: Long) {
        try {
            Thread.sleep(durationMs)
        } catch (interrupted: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }
}
