import Foundation
import AVFoundation

@objc public protocol LinphoneBridgeListener: AnyObject {
    func linphoneBridge(_ bridge: LinphoneBridge, didReceiveEvent type: String, payload: NSDictionary)
    func linphoneBridge(_ bridge: LinphoneBridge, didEncounterError error: NSError)
}

@objcMembers
public final class LinphoneBridge: NSObject {
    public static let shared = LinphoneBridge()

    private let swiftBridge = LinphoneSwiftBridge.shared
    private let audioRouter = AudioRouter()
    private let callbackQueue = DispatchQueue.main
    private let forwardedEvents: [String] = ["registration", "call", "message", "audioRoute", "deviceChange", "connectivity"]

    private var eventCallback: ((String, NSDictionary) -> Void)?
    private var eventTokens: [String: String] = [:]

    public weak var listener: LinphoneBridgeListener?

    private override init() {
        super.init()
    }

    public func initialize(with config: NSDictionary?, listener: LinphoneBridgeListener? = nil) {
        if let listener = listener {
            self.listener = listener
        }

        requestMicrophonePermission { [weak self] granted in
            guard let self else { return }

            guard granted else {
                self.emitEvent(type: "permission", payload: [
                    "resource": "microphone",
                    "status": "denied"
                ])

                let error = NSError(
                    domain: "LinphoneBridge.Permission",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied"]
                )
                self.emitError("permission", error: error)
                return
            }

            self.emitEvent(type: "permission", payload: [
                "resource": "microphone",
                "status": "granted"
            ])

            let configuration = config as? [String: Any] ?? [:]
            var bridgeError: NSError?
            let success = self.swiftBridge.configure(config: configuration, error: &bridgeError)

            guard success else {
                let nsError = bridgeError ?? NSError(
                    domain: "LinphoneBridge.Initialize",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to initialize Linphone bridge"]
                )
                self.emitError("initialize", error: nsError)
                return
            }

            self.installEventForwarding()

            let stateSnapshot = self.swiftBridge.currentState()
            if let audioRoute = stateSnapshot["audioRoute"] as? String {
                self.emitEvent(type: "audioRoute", payload: ["route": audioRoute])
            }

            self.emitEvent(type: "registration", payload: [
                "state": "none"
            ])
        }
    }

    public func setEventCallback(_ callback: @escaping (String, NSDictionary) -> Void) {
        eventCallback = callback
        installEventForwarding()
    }

    public func clearEventCallback() {
        eventCallback = nil
        if listener == nil {
            uninstallEventForwarding()
        }
    }

    public func register() {
        swiftBridge.register { [weak self] error in
            guard let self, let error else { return }
            self.emitError("register", error: error)
        }
    }

    public func unregister() {
        swiftBridge.unregister { [weak self] error in
            guard let self, let error else { return }
            self.emitError("unregister", error: error)
        }
    }

    public func callDial(number: String) {
        swiftBridge.callDial(number) { [weak self] error in
            guard let self, let error else { return }
            self.emitError("callDial", error: error)
        }
    }

    public func callHangup() {
        swiftBridge.callHangup { [weak self] error in
            guard let self, let error else { return }
            self.emitError("callHangup", error: error)
        }
    }

    public func callAnswer() {
        swiftBridge.callAnswer { [weak self] error in
            guard let self, let error else { return }
            self.emitError("callAnswer", error: error)
        }
    }

    public func sendDtmf(tone: String) {
        swiftBridge.sendDtmf(tone) { [weak self] error in
            guard let self, let error else { return }
            self.emitError("sendDtmf", error: error)
        }
    }

    public func messageSend(to recipient: String, text: String) {
        swiftBridge.messageSend(to: recipient, body: text) { [weak self] error in
            guard let self, let error else { return }
            self.emitError("messageSend", error: error)
        }
    }

    public func audioSetRoute(route: String) {
        let normalizedRoute = route.lowercased()
        let audioRoute = AudioRoute(rawValue: normalizedRoute) ?? .system

        do {
            try audioRouter.setRoute(audioRoute)
        } catch {
            emitError("audioRoute", error: error)
        }

        swiftBridge.setAudioRoute(normalizedRoute) { [weak self] error in
            guard let self, let error else { return }
            self.emitError("audioRoute", error: error)
        }
    }

    public func dispose() {
        eventCallback = nil
        listener = nil
        uninstallEventForwarding()
        swiftBridge.dispose()

        do {
            try audioRouter.setRoute(.system)
        } catch {
            // ignore failures when resetting to system route during disposal
        }

        do {
            try AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        } catch {
            // session deactivation is best-effort during teardown
        }
    }

    private func installEventForwarding() {
        for event in forwardedEvents where eventTokens[event] == nil {
            guard let token = swiftBridge.subscribe(event: event, handler: { [weak self] payload in
                self?.forward(event: event, payload: payload)
            }) else { continue }
            eventTokens[event] = token
        }
    }

    private func uninstallEventForwarding() {
        guard !eventTokens.isEmpty else { return }
        for (event, token) in eventTokens {
            swiftBridge.unsubscribe(event: event, token: token)
        }
        eventTokens.removeAll()
    }

    private func forward(event: String, payload: [String: Any]) {
        emitEvent(type: event, payload: payload)
    }

    private func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        let session = AVAudioSession.sharedInstance()

        switch session.recordPermission {
        case .granted:
            completion(true)
        case .denied:
            completion(false)
        case .undetermined:
            session.requestRecordPermission { [weak self] granted in
                guard let self else { return }
                self.callbackQueue.async {
                    completion(granted)
                }
            }
        @unknown default:
            completion(false)
        }
    }

    private func emitEvent(type: String, payload: [String: Any]) {
        callbackQueue.async { [weak self] in
            guard let self else { return }
            let dictionary = payload as NSDictionary
            self.listener?.linphoneBridge(self, didReceiveEvent: type, payload: dictionary)
            self.eventCallback?(type, dictionary)
        }
    }

    private func emitError(_ type: String, error: Error) {
        let nsError = error as NSError
        callbackQueue.async { [weak self] in
            guard let self else { return }
            self.listener?.linphoneBridge(self, didEncounterError: nsError)
        }
        emitEvent(type: "error", payload: [
            "category": type,
            "message": error.localizedDescription
        ])
    }
}
