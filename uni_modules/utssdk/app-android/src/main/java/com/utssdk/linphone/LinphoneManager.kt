package com.utssdk.linphone

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.io.File
import java.util.Locale
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import org.linphone.core.AuthInfo
import org.linphone.core.Core
import org.linphone.core.CoreListenerStub
import org.linphone.core.Factory
import org.linphone.core.LogCollectionState
import org.linphone.core.ProxyConfig
import org.linphone.core.TransportType
import org.linphone.core.RegistrationState as SdkRegistrationState

object LinphoneManager {

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

    private const val TAG = "LinphoneManager"
    private const val CORE_ITERATE_INTERVAL_MS = 60L
    private val executor: ExecutorService = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "linphone-manager")
    }

    @Volatile
    private var callback: Callback? = null
    private var configuration: Map<String, Any?> = emptyMap()
    private var currentCallInfo: MutableMap<String, Any?> = mutableMapOf()
    @Volatile
    private var appContext: Context? = null
    @Volatile
    private var serviceConfig: LinphoneConfig = LinphoneConfig()

    private val coreLock = Any()
    private var coreThread: HandlerThread? = null
    private var coreHandler: Handler? = null
    private var linphoneCore: Core? = null
    private var iteratePosted = false

    private var currentProxyConfig: ProxyConfig? = null
    private var currentAuthInfo: AuthInfo? = null

    @Volatile
    private var registrationState: RegistrationState = RegistrationState.IDLE

    private val coreListener = object : CoreListenerStub() {
        override fun onRegistrationStateChanged(
            core: Core,
            proxyConfig: ProxyConfig,
            state: SdkRegistrationState,
            message: String
        ) {
            handleRegistrationState(state, message)
        }
    }

    fun setCallback(callback: Callback?) {
        this.callback = callback
    }

    fun initialize(context: Context, config: Map<String, Any?>) {
        val applicationContext = context.applicationContext
        executor.execute {
            appContext = applicationContext
            configuration = config
            updateServiceConfig(LinphoneConfig.from(config))
            callback?.onRegistrationStateChanged(RegistrationState.IDLE, "Linphone manager initialized")
        }
    }

    fun updateServiceConfig(config: LinphoneConfig) {
        serviceConfig = config
    }

    fun getServiceConfig(): LinphoneConfig = serviceConfig

    fun startCore(context: Context? = null) {
        val resolvedContext = context?.applicationContext ?: appContext
        if (resolvedContext == null) {
            Log.w(TAG, "Cannot start Linphone core without context")
            return
        }
        synchronized(coreLock) {
            if (coreHandler != null) {
                Log.d(TAG, "Linphone core already running")
                return
            }
            val thread = HandlerThread("linphone-core")
            thread.start()
            val handler = Handler(thread.looper)
            coreThread = thread
            coreHandler = handler
            handler.post {
                try {
                    bootstrapCore(resolvedContext)
                } catch (throwable: Throwable) {
                    Log.e(TAG, "Failed to start Linphone core", throwable)
                    callback?.onError("core", throwable)
                    val (detachedThread, detachedHandler) = detachCoreThread()
                    performCoreShutdown(detachedThread ?: thread, detachedHandler ?: handler)
                }
            }
        }
    }

    fun stopCore() {
        val (thread, handler) = detachCoreThread()
        if (thread == null || handler == null) {
            return
        }
        handler.post { performCoreShutdown(thread, handler) }
    }

    fun registerAccount(
        username: String,
        password: String,
        domain: String,
        proxy: String?,
        transport: String?
    ): Boolean {
        if (username.isBlank() || password.isBlank() || domain.isBlank()) {
            val error = IllegalArgumentException("Username, password, and domain are required")
            Log.e(TAG, "Invalid registration parameters", error)
            fail("registration", error)
            return false
        }

        val handler = coreHandler
        if (handler == null) {
            Log.w(TAG, "Cannot register account because the Linphone core is not running")
            return false
        }

        handler.post {
            val core = linphoneCore
            if (core == null) {
                Log.w(TAG, "Linphone core is not ready for registration")
                return@post
            }

            try {
                callback?.onRegistrationStateChanged(RegistrationState.REGISTERING, "Submitting registration request")
                registrationState = RegistrationState.REGISTERING

                clearCurrentAccount(core)

                val factory = Factory.instance()
                val identity = factory.createAddress("sip:$username@$domain")
                    ?: throw IllegalStateException("Failed to create identity address")

                val proxyUri = proxy?.takeIf { it.isNotBlank() } ?: "sip:$domain"
                val serverAddress = factory.createAddress(proxyUri)
                    ?: throw IllegalStateException("Failed to create proxy address")
                parseTransport(transport)?.let { serverAddress.transport = it }

                val proxyConfig = core.createProxyConfig()
                proxyConfig.identityAddress = identity
                proxyConfig.serverAddr = serverAddress.asStringUriOnly()
                proxyConfig.isRegisterEnabled = true
                proxy?.takeIf { it.isNotBlank() }?.let {
                    proxyConfig.route = serverAddress.asStringUriOnly()
                }

                val authInfo = factory.createAuthInfo(
                    username,
                    null,
                    password,
                    null,
                    domain,
                    domain
                )
                currentAuthInfo = authInfo

                core.addAuthInfo(authInfo)
                core.addProxyConfig(proxyConfig)
                core.defaultProxyConfig = proxyConfig
                currentProxyConfig = proxyConfig

                core.refreshRegisters()

                Log.i(TAG, "Registration request sent for $username@$domain")
            } catch (throwable: Throwable) {
                Log.e(TAG, "Failed to register SIP account", throwable)
                registrationState = RegistrationState.FAILED
                callback?.onError("registration", throwable)
            }
        }
        return true
    }

    fun unregisterAccount(): Boolean {
        val handler = coreHandler
        if (handler == null) {
            Log.w(TAG, "Cannot unregister because the Linphone core is not running")
            return false
        }

        handler.post {
            val core = linphoneCore ?: return@post
            try {
                clearCurrentAccount(core)
                core.refreshRegisters()
                registrationState = RegistrationState.UNREGISTERED
                callback?.onRegistrationStateChanged(RegistrationState.UNREGISTERED, "Unregister requested")
                Log.i(TAG, "SIP account unregistered")
            } catch (throwable: Throwable) {
                Log.e(TAG, "Failed to unregister SIP account", throwable)
                callback?.onError("registration", throwable)
            }
        }
        return true
    }

    fun isRegistered(): Boolean = registrationState == RegistrationState.REGISTERED

    fun register() {
        executor.execute {
            val username = configuration["username"]?.toString()?.takeIf { it.isNotBlank() }
            val password = configuration["password"]?.toString()?.takeIf { it.isNotBlank() }
            val domain = configuration["domain"]?.toString()?.takeIf { it.isNotBlank() }
            val proxy = configuration["proxy"]?.toString()?.takeIf { it.isNotBlank() }
            val transport = configuration["transport"]?.toString()?.takeIf { it.isNotBlank() }

            if (username == null || password == null || domain == null) {
                val error = IllegalStateException("Missing SIP registration configuration (username/password/domain)")
                Log.e(TAG, "Unable to register: configuration incomplete")
                callback?.onError("registration", error)
                return@execute
            }

            val success = registerAccount(username, password, domain, proxy, transport)
            if (!success) {
                val error = IllegalStateException("Linphone core is not ready for registration")
                callback?.onError("registration", error)
            }
        }
    }

    fun unregister() {
        executor.execute {
            val success = unregisterAccount()
            if (!success) {
                val error = IllegalStateException("Linphone core is not ready for unregistration")
                callback?.onError("registration", error)
            }
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
            Log.e(TAG, "Failure in $category", throwable)
            callback?.onError(category, throwable)
        }
    }

    private fun bootstrapCore(context: Context) {
        val factory = Factory.instance()
        val configFile = ensureConfigFile(context)
        val logsDir = File(context.filesDir, "linphone/logs").apply {
            if (!exists()) {
                mkdirs()
            }
        }

        factory.setLogCollectionPath(logsDir.absolutePath)
        factory.enableLogCollection(LogCollectionState.Enabled)
        factory.setDebugMode(true, TAG)

        val core = factory.createCore(configFile.absolutePath, null, context)
        core.addListener(coreListener)
        core.start()
        linphoneCore = core
        registrationState = RegistrationState.IDLE
        callback?.onRegistrationStateChanged(RegistrationState.IDLE, "Linphone core started")
        scheduleCoreIteration()
    }

    private fun ensureConfigFile(context: Context): File {
        val directory = File(context.filesDir, "linphone")
        if (!directory.exists()) {
            directory.mkdirs()
        }
        val configFile = File(directory, "linphonerc")
        if (!configFile.exists()) {
            try {
                configFile.createNewFile()
            } catch (throwable: Throwable) {
                Log.w(TAG, "Unable to pre-create Linphone config file", throwable)
            }
        }
        return configFile
    }

    private fun scheduleCoreIteration() {
        val handler = coreHandler ?: return
        if (iteratePosted) {
            return
        }
        iteratePosted = true
        handler.post(iterateRunnable)
    }

    private val iterateRunnable = object : Runnable {
        override fun run() {
            val handler = coreHandler
            val core = linphoneCore
            if (handler == null || core == null) {
                iteratePosted = false
                return
            }
            try {
                core.iterate()
            } catch (throwable: Throwable) {
                Log.e(TAG, "Linphone core iterate failure", throwable)
            }
            handler.postDelayed(this, CORE_ITERATE_INTERVAL_MS)
        }
    }

    private fun detachCoreThread(): Pair<HandlerThread?, Handler?> {
        synchronized(coreLock) {
            val thread = coreThread
            val handler = coreHandler
            coreThread = null
            coreHandler = null
            return thread to handler
        }
    }

    private fun performCoreShutdown(thread: HandlerThread?, handler: Handler?) {
        if (thread == null || handler == null) {
            iteratePosted = false
            linphoneCore = null
            currentProxyConfig = null
            currentAuthInfo = null
            registrationState = RegistrationState.UNREGISTERED
            callback?.onRegistrationStateChanged(RegistrationState.UNREGISTERED, "Linphone core stopped")
            return
        }

        handler.removeCallbacks(iterateRunnable)
        iteratePosted = false
        try {
            linphoneCore?.removeListener(coreListener)
            linphoneCore?.stop()
        } catch (throwable: Throwable) {
            Log.w(TAG, "Error while stopping Linphone core", throwable)
        } finally {
            linphoneCore = null
            currentProxyConfig = null
            currentAuthInfo = null
            registrationState = RegistrationState.UNREGISTERED
            callback?.onRegistrationStateChanged(RegistrationState.UNREGISTERED, "Linphone core stopped")
            thread.quitSafely()
        }
    }

    private fun clearCurrentAccount(core: Core) {
        currentProxyConfig?.let { proxyConfig ->
            try {
                proxyConfig.isRegisterEnabled = false
                core.removeProxyConfig(proxyConfig)
            } catch (throwable: Throwable) {
                Log.w(TAG, "Unable to remove existing proxy config", throwable)
            }
        }
        currentProxyConfig = null

        currentAuthInfo?.let { authInfo ->
            try {
                core.removeAuthInfo(authInfo)
            } catch (throwable: Throwable) {
                Log.w(TAG, "Unable to remove existing auth info", throwable)
            }
        }
        currentAuthInfo = null
    }

    private fun parseTransport(value: String?): TransportType? {
        val normalized = value?.trim()?.lowercase(Locale.US) ?: return null
        return when (normalized) {
            "udp" -> TransportType.Udp
            "tcp" -> TransportType.Tcp
            "tls" -> TransportType.Tls
            "dtls" -> TransportType.Dtls
            else -> null
        }
    }

    private fun handleRegistrationState(state: SdkRegistrationState, message: String?) {
        val mappedState = when (state) {
            SdkRegistrationState.Ok -> RegistrationState.REGISTERED
            SdkRegistrationState.Progress, SdkRegistrationState.Refreshing -> RegistrationState.REGISTERING
            SdkRegistrationState.Cleared, SdkRegistrationState.None -> RegistrationState.UNREGISTERED
            SdkRegistrationState.Failed -> RegistrationState.FAILED
            else -> RegistrationState.IDLE
        }
        registrationState = mappedState
        Log.i(TAG, "Linphone registration state: ${state.name} -> ${mappedState.wireName} (${message ?: ""})")
        callback?.onRegistrationStateChanged(mappedState, message)
        if (mappedState == RegistrationState.FAILED) {
            callback?.onError("registration", IllegalStateException(message ?: "Registration failed"))
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
