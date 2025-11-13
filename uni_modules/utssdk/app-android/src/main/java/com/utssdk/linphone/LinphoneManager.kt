package com.utssdk.linphone

import android.content.Context
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
        }
    }

    fun fail(category: String, throwable: Throwable) {
        executor.execute {
            callback?.onError(category, throwable)
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
