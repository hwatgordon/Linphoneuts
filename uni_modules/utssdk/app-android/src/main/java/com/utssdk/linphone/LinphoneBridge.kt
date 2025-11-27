package com.utssdk.linphone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import kotlin.jvm.functions.Function2

object LinphoneBridge : LinphoneManager.Callback {

    interface LinphoneEventListener {
        fun onEvent(type: String, payload: Map<String, Any?>)
        fun onError(category: String, message: String)
    }

    private val manager = LinphoneManager
    private val audioRouter = AudioRouter()


    private var applicationContext: Context? = null
    private var listener: LinphoneEventListener? = null
    private var eventCallback: Function2<String, Map<String, Any?>, Unit>? = null

    @JvmStatic
    @JvmOverloads
    fun initialize(context: Context, config: Map<String, Any?>? = emptyMap(), listener: LinphoneEventListener? = null) {
        applicationContext = context.applicationContext
        listener?.let { this.listener = it }
        manager.setCallback(this)

        if (!ensureMicrophonePermission()) {
            emitEvent(
                type = "permission",
                payload = mapOf(
                    "resource" to "microphone",
                    "status" to "denied"
                )
            )
            emitError("permission", IllegalStateException("Microphone permission denied"))
            return
        }

        val safeContext = requireNotNull(applicationContext) {
            "Application context must be set before calling initialize"
        }

        val configMap = config ?: emptyMap()
        val serviceConfig = LinphoneConfig.from(configMap)

        manager.initialize(safeContext, configMap)
        try {
            LinphoneService.start(safeContext, serviceConfig)
        } catch (throwable: Throwable) {
            emitError("service", throwable)
        }

        emitEvent(
            type = "permission",
            payload = mapOf(
                "resource" to "microphone",
                "status" to "granted"
            )
        )
        emitEvent(
            type = "registration",
            payload = mapOf(
                "state" to LinphoneManager.RegistrationState.IDLE.wireName,
                "message" to "Initialized"
            )
        )
        }

        @JvmStatic
        fun setEventListener(listener: LinphoneEventListener?) {
        this.listener = listener
        }

        @JvmStatic
        fun setEventCallback(callback: Function2<String, Map<String, Any?>, Unit>?) {
        this.eventCallback = callback
        }

        @JvmStatic
        fun clearEventCallback() {
        this.eventCallback = null
        }

        @JvmStatic

        manager.register()
    }

    @JvmStatic
    fun unregister() {
        manager.unregister()
    }

    @JvmStatic
    fun callDial(number: String) {
        manager.dial(number)
    }

    @JvmStatic
    fun callHangup() {
        manager.hangup()
    }

    @JvmStatic
    fun callAnswer() {
        manager.answer()
    }

    @JvmStatic
    fun sendDtmf(tone: String) {
        manager.sendDtmf(tone)
    }

    @JvmStatic
    fun messageSend(recipient: String, text: String) {
        manager.sendMessage(recipient, text)
    }

    @JvmStatic
    fun audioSetRoute(route: String) {
        val context = applicationContext
        if (context == null) {
            emitError("audioRoute", IllegalStateException("Context is not available"))
            return
        }

        val targetRoute = AudioRouter.Route.fromValue(route)
        val applied = audioRouter.applyRoute(context, targetRoute)
        if (applied) {
            manager.updateAudioRoute(targetRoute)
            emitEvent("audioRoute", mapOf("route" to targetRoute.wireName))
        } else {
            emitError("audioRoute", IllegalStateException("Failed to apply audio route"))
        }
    }

    private fun ensureMicrophonePermission(): Boolean {
        val context = applicationContext ?: return false
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!granted) {
            // TODO: Integrate runtime permission request flow once host Activity is wired.
        }
        return granted
    }

    private fun emitEvent(type: String, payload: Map<String, Any?>) {
        mainHandler.post {
            listener?.onEvent(type, payload)
            eventCallback?.invoke(type, payload)
        }
    }

    private fun emitError(category: String, throwable: Throwable) {
        val message = throwable.message ?: category
        mainHandler.post {
            listener?.onError(category, message)
        }
        emitEvent(
            type = "error",
            payload = mapOf(
                "category" to category,
                "message" to message
            )
        )
    }

    override fun onRegistrationStateChanged(state: LinphoneManager.RegistrationState, message: String?) {
        val payload = mutableMapOf<String, Any?>("state" to state.wireName)
        if (!message.isNullOrEmpty()) {
            payload["message"] = message
        }
        emitEvent("registration", payload)
    }

    override fun onCallStateChanged(state: LinphoneManager.CallState, info: Map<String, Any?>) {
        val payload = info.toMutableMap()
        payload["state"] = state.wireName
        emitEvent("call", payload)
    }

    override fun onMessage(payload: Map<String, Any?>) {
        emitEvent("message", payload)
    }

    override fun onAudioRoute(route: AudioRouter.Route) {
        emitEvent("audioRoute", mapOf("route" to route.wireName))
    }

    override fun onError(category: String, throwable: Throwable) {
        emitError(category, throwable)
    }
}
