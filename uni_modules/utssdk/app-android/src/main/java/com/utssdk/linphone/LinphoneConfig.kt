package com.utssdk.linphone

import org.linphone.core.TransportType
import java.io.File

data class LinphoneConfig(
    val domain: String,
    val username: String?,
    val transport: Transport = Transport.TLS,
    val autoStart: Boolean = true,
    val enableNativeLogs: Boolean = false,
    val logCollectionDirectory: File? = null,
    val userConfigPath: String? = null,
    val factoryConfigPath: String? = null,
    val extras: Map<String, Any?> = emptyMap()
) {
    init {
        require(domain.isNotBlank()) { "domain must not be blank" }
    }

    val transportType: TransportType
        get() = transport.sdkType

    enum class Transport(val wireName: String, val sdkType: TransportType) {
        UDP("udp", TransportType.Udp),
        TCP("tcp", TransportType.Tcp),
        TLS("tls", TransportType.Tls),
        DTLS("dtls", TransportType.Dtls);

        companion object {
            fun from(value: String?): Transport? =
                value?.let { candidate ->
                    values().firstOrNull { it.wireName.equals(candidate, ignoreCase = true) }
                }
        }
    }

    companion object {
        const val DEFAULT_DOMAIN = "sip.linphone.org"

        fun from(options: Map<String, Any?>): LinphoneConfig {
            val domain = (options["domain"] as? String)?.takeIf { it.isNotBlank() } ?: DEFAULT_DOMAIN
            val username = (options["username"] as? String)?.takeIf { it.isNotBlank() }
            val transport = Transport.from(options["transport"] as? String) ?: Transport.TLS
            val autoStart = (options["autoStart"] as? Boolean) ?: true
            val enableLogs = (options["enableLogs"] as? Boolean) ?: false
            val logDirectory = (options["logDirectory"] as? String)?.takeIf { it.isNotBlank() }?.let(::File)
            val userConfigPath = (options["userConfigPath"] as? String)?.takeIf { it.isNotBlank() }
            val factoryConfigPath = (options["factoryConfigPath"] as? String)?.takeIf { it.isNotBlank() }

            return LinphoneConfig(
                domain = domain,
                username = username,
                transport = transport,
                autoStart = autoStart,
                enableNativeLogs = enableLogs,
                logCollectionDirectory = logDirectory,
                userConfigPath = userConfigPath,
                factoryConfigPath = factoryConfigPath,
                extras = options
            )
        }
    }
}
