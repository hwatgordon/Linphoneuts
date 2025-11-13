import Foundation

protocol LinphoneManagerDelegate: AnyObject {
    func linphoneManager(_ manager: LinphoneManager, didUpdateRegistration state: LinphoneManager.RegistrationState, message: String?)
    func linphoneManager(_ manager: LinphoneManager, didUpdateCall state: LinphoneManager.CallState, info: [String: Any])
    func linphoneManager(_ manager: LinphoneManager, didReceiveMessage payload: [String: Any])
    func linphoneManager(_ manager: LinphoneManager, didChangeAudioRoute route: AudioRoute)
    func linphoneManager(_ manager: LinphoneManager, didFailWith error: Error, category: String)
}

final class LinphoneManager {
    enum RegistrationState: String {
        case idle
        case registering
        case registered
        case unregistered
        case failed
    }

    enum CallState: String {
        case idle
        case outgoing
        case incoming
        case established
        case ended
        case failed
    }

    static let shared = LinphoneManager()

    weak var delegate: LinphoneManagerDelegate?

    private let workerQueue = DispatchQueue(label: "com.utssdk.linphone.manager", qos: .userInitiated)
    private var configuration: [String: Any] = [:]
    private var currentCallInfo: [String: Any] = [:]

    private init() {}

    func initialize(with config: [String: Any]) {
        workerQueue.async { [weak self] in
            guard let self = self else { return }
            self.configuration = config
            // TODO: Replace stub with Linphone SDK initialization and configuration loading.
            self.delegate?.linphoneManager(self, didUpdateRegistration: .idle, message: "Linphone manager initialized")
        }
    }

    func register() {
        workerQueue.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.linphoneManager(self, didUpdateRegistration: .registering, message: "Registering")

            // TODO: Replace stub with actual registration flow.
            self.workerQueue.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                guard let self = self else { return }
                self.delegate?.linphoneManager(self, didUpdateRegistration: .registered, message: "Registered")
            }
        }
    }

    func unregister() {
        workerQueue.async { [weak self] in
            guard let self = self else { return }
            // TODO: Replace stub with actual unregister call.
            self.delegate?.linphoneManager(self, didUpdateRegistration: .unregistered, message: "Unregistered")
        }
    }

    func dial(number: String) {
        workerQueue.async { [weak self] in
            guard let self = self else { return }

            self.currentCallInfo = ["remote": number]
            self.delegate?.linphoneManager(self, didUpdateCall: .outgoing, info: self.currentCallInfo)

            // TODO: Replace stub with Linphone SDK call initiation.
            self.workerQueue.asyncAfter(deadline: .now() + 0.5) { [weak self] in
                guard let self = self else { return }
                self.delegate?.linphoneManager(self, didUpdateCall: .established, info: self.currentCallInfo)
            }
        }
    }

    func hangup() {
        workerQueue.async { [weak self] in
            guard let self = self else { return }
            // TODO: Replace stub with Linphone SDK hangup.
            self.delegate?.linphoneManager(self, didUpdateCall: .ended, info: self.currentCallInfo)
            self.currentCallInfo.removeAll()
        }
    }

    func answer() {
        workerQueue.async { [weak self] in
            guard let self = self else { return }

            // TODO: Replace stub with Linphone SDK answer call.
            self.delegate?.linphoneManager(self, didUpdateCall: .established, info: self.currentCallInfo)
        }
    }

    func sendDtmf(tone: String) {
        workerQueue.async { [weak self] in
            guard let self = self else { return }

            // TODO: Replace stub with Linphone SDK DTMF handling.
            var info = self.currentCallInfo
            info["tone"] = tone
            self.delegate?.linphoneManager(self, didUpdateCall: .established, info: info)
        }
    }

    func sendMessage(to recipient: String, text: String) {
        workerQueue.async { [weak self] in
            guard let self = self else { return }

            // TODO: Replace stub with Linphone SDK message send.
            let payload: [String: Any] = [
                "direction": "outgoing",
                "to": recipient,
                "text": text
            ]
            self.delegate?.linphoneManager(self, didReceiveMessage: payload)
        }
    }

    func updateAudioRoute(_ route: AudioRoute) {
        workerQueue.async { [weak self] in
            guard let self = self else { return }
            // TODO: Hook into Linphone SDK audio routing callbacks.
            self.delegate?.linphoneManager(self, didChangeAudioRoute: route)
        }
    }

    func fail(with error: Error, category: String) {
        workerQueue.async { [weak self] in
            guard let self = self else { return }
            self.delegate?.linphoneManager(self, didFailWith: error, category: category)
        }
    }
}
