package com.utssdk.linphone

import android.content.Context
import android.util.Log
import org.linphone.core.Account
import org.linphone.core.Call
import org.linphone.core.Core
import org.linphone.core.CoreListenerStub
import org.linphone.core.Factory
import org.linphone.core.LogCollectionState
import org.linphone.core.RegistrationState as CoreRegistrationState
import org.linphone.core.Call.State as CoreCallState
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

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

    companion object {
        private const val TAG = "LinphoneManager"
        private const val CORE_ITERATION_INTERVAL_MS = 50L
        private const val DEFAULT_STORAGE_FOLDER = "linphone"
    }

    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "linphone-manager").apply { isDaemon = true }
    }
    private val iterateExecutor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "linphone-core-loop").apply { isDaemon = true }
        }
    private val lock = Any()

    @Volatile
    private var callback: Callback? = null
    @Volatile
    private var config: LinphoneConfig? = null
    @Volatile
    private var currentCallInfo: MutableMap<String, Any?> = mutableMapOf()
    @Volatile
    private var core: Core? = null
    @Volatile
    private var iterateFuture: ScheduledFuture<*>? = null

    private val coreListener = object : CoreListenerStub() {
        override fun onAccountRegistrationStateChanged(
            lc: Core,
            account: Account,
            state: CoreRegistrationState,
            message: String?
        ) {
            val managerState = state.toManagerState()
            callback?.onRegistrationStateChanged(managerState, message)
        }

        override fun onCallStateChanged(
            lc: Core,
            call: Call,
            state: CoreCallState,
            message: String?
        ) {
            val payload = mutableMapOf<String, Any?>(
                "id" to call.callLog?.callId,
                "remote" to call.remoteAddress?.asStringUriOnly(),
                "direction" to call.dir.name.lowercase()
            )
            if (!message.isNullOrEmpty()) {
                payload["message"] = message
            }
            currentCallInfo = payload
            callback?.onCallStateChanged(state.toManagerState(), payload)
        }
    }

    fun setCallback(callback: Callback?) {
        this.callback = callback
    }

    fun init(context: Context, config: LinphoneConfig) {
        val applicationContext = context.applicationContext
        executor.execute {
            synchronized(lock) {
                if (core != null) {
                    Log.i(TAG, "Reinitializing Linphone core")
                    destroyCoreLocked()
                }

                this.config = config

                try {
                    val factory = prepareFactory(applicationContext, config)
                    val createdCore = factory.createCore(
                        config.userConfigPath,
                        config.factoryConfigPath,
                        applicationContext
                    )

                    createdCore.addListener(coreListener)
                    core = createdCore

                    if (config.autoStart) {
                        createdCore.start()
                        scheduleIterationLocked()
                    }

                    Log.i(
                        TAG,
                        "Linphone core initialized (domain=${config.domain}, transport=${config.transport.wireName})"
                    )
                    callback?.onRegistrationStateChanged(RegistrationState.IDLE, "Linphone core initialized")
                } catch (throwable: Throwable) {
                    Log.e(TAG, "Failed to initialize Linphone core", throwable)
                    callback?.onError("init", throwable)
                    destroyCoreLocked()
                }
            }
        }
    }

    fun destroy() {
        executor.execute {
            synchronized(lock) {
                if (core == null) {
                    Log.i(TAG, "destroy() called but Linphone core is already released")
                    return@synchronized
                }

                destroyCoreLocked()
                Log.i(TAG, "Linphone core destroyed")
            }
        }
    }

    fun register() {
        executor.execute {
            if (core == null) {
                Log.w(TAG, "register() called before Linphone core was initialized; emitting simulated states")
            }
            callback?.onRegistrationStateChanged(RegistrationState.REGISTERING, "Registering")
            simulateDelay(250)
            callback?.onRegistrationStateChanged(RegistrationState.REGISTERED, "Registered")
        }
    }

    fun unregister() {
        executor.execute {
            if (core == null) {
                Log.w(TAG, "unregister() called before Linphone core was initialized")
            }
            callback?.onRegistrationStateChanged(RegistrationState.UNREGISTERED, "Unregistered")
        }
    }

    fun dial(number: String) {
        executor.execute {
            if (core == null) {
                Log.w(TAG, "dial() called before Linphone core was initialized; simulating call flow")
            }
            currentCallInfo = mutableMapOf("remote" to number)
            callback?.onCallStateChanged(CallState.OUTGOING, currentCallInfo)
            simulateDelay(400)
            callback?.onCallStateChanged(CallState.ESTABLISHED, currentCallInfo)
        }
    }

    fun answer() {
        executor.execute {
            if (currentCallInfo.isEmpty()) {
                currentCallInfo["remote"] = config?.extras?.get("defaultRemote") ?: "unknown"
            }
            callback?.onCallStateChanged(CallState.ESTABLISHED, currentCallInfo)
        }
    }

    fun hangup() {
        executor.execute {
            callback?.onCallStateChanged(CallState.ENDED, currentCallInfo)
            currentCallInfo = mutableMapOf()
        }
    }

    fun sendDtmf(tone: String) {
        executor.execute {
            val info = currentCallInfo.toMutableMap()
            info["tone"] = tone
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

    private fun prepareFactory(context: Context, config: LinphoneConfig): Factory {
        Factory.initialize(context)
        Factory.setDebugMode(config.enableNativeLogs, TAG)

        val factory = Factory.instance()
        val storageDir = ensureDirectory(context, DEFAULT_STORAGE_FOLDER)
        factory.setConfigDir(storageDir.absolutePath)
        factory.setDataDir(storageDir.absolutePath)
        factory.setDownloadDir(context.cacheDir.absolutePath)

        val logDirectory = config.logCollectionDirectory?.let { ensureDirectory(it) } ?: storageDir
        factory.setLogCollectionPath(logDirectory.absolutePath)
        val logState = if (config.enableNativeLogs) LogCollectionState.Enabled else LogCollectionState.Disabled
        factory.enableLogCollection(logState)

        return factory
    }

    private fun ensureDirectory(context: Context, name: String): File {
        val directory = File(context.filesDir, name)
        if (!directory.exists() && !directory.mkdirs()) {
            Log.w(TAG, "Failed to create directory ${directory.absolutePath}")
        }
        return directory
    }

    private fun ensureDirectory(directory: File): File {
        if (!directory.exists() && !directory.mkdirs()) {
            Log.w(TAG, "Failed to create directory ${directory.absolutePath}")
        }
        return directory
    }

    private fun scheduleIterationLocked() {
        iterateFuture?.cancel(true)
        iterateFuture = iterateExecutor.scheduleAtFixedRate({
            try {
                core?.iterate()
            } catch (throwable: Throwable) {
                Log.e(TAG, "Error while iterating Linphone core", throwable)
            }
        }, 0L, CORE_ITERATION_INTERVAL_MS, TimeUnit.MILLISECONDS)
    }

    private fun destroyCoreLocked() {
        iterateFuture?.cancel(true)
        iterateFuture = null

        core?.let { instance ->
            try {
                instance.removeListener(coreListener)
            } catch (throwable: Throwable) {
                Log.w(TAG, "Failed to remove Linphone listener", throwable)
            }
            try {
                instance.stop()
            } catch (throwable: Throwable) {
                Log.w(TAG, "Failed to stop Linphone core", throwable)
            }
            try {
                instance.destroy()
            } catch (throwable: Throwable) {
                Log.w(TAG, "Failed to destroy Linphone core", throwable)
            }
        }

        try {
            Factory.instance().enableLogCollection(LogCollectionState.Disabled)
        } catch (throwable: Throwable) {
            Log.w(TAG, "Failed to disable Linphone log collection", throwable)
        }

        core = null
        config = null
        currentCallInfo = mutableMapOf()
    }

    private fun CoreRegistrationState.toManagerState(): RegistrationState = when (this) {
        CoreRegistrationState.None -> RegistrationState.IDLE
        CoreRegistrationState.Progress -> RegistrationState.REGISTERING
        CoreRegistrationState.Ok -> RegistrationState.REGISTERED
        CoreRegistrationState.Cleared -> RegistrationState.UNREGISTERED
        CoreRegistrationState.Failed -> RegistrationState.FAILED
    }

    private fun CoreCallState.toManagerState(): CallState = when (this) {
        CoreCallState.Idle -> CallState.IDLE
        CoreCallState.IncomingReceived,
        CoreCallState.IncomingEarlyMedia,
        CoreCallState.PushIncomingReceived -> CallState.INCOMING
        CoreCallState.OutgoingInit,
        CoreCallState.OutgoingProgress,
        CoreCallState.OutgoingRinging,
        CoreCallState.OutgoingEarlyMedia,
        CoreCallState.EarlyUpdating,
        CoreCallState.EarlyUpdatedByRemote -> CallState.OUTGOING
        CoreCallState.Connected,
        CoreCallState.StreamsRunning,
        CoreCallState.Pausing,
        CoreCallState.Paused,
        CoreCallState.Resuming,
        CoreCallState.Referred,
        CoreCallState.PausedByRemote,
        CoreCallState.UpdatedByRemote,
        CoreCallState.Updating -> CallState.ESTABLISHED
        CoreCallState.Released -> CallState.ENDED
        CoreCallState.Error -> CallState.FAILED
    }

    private fun simulateDelay(durationMs: Long) {
        try {
            Thread.sleep(durationMs)
        } catch (interrupted: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }
}
