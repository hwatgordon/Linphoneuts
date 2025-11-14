import Foundation
import AVFoundation

// TODO: Ensure the Linlin frameworks are linked in the consuming Xcode target (see app-ios/Frameworks).

@objc public protocol LinphoneBridgeListener: AnyObject {
    func linphoneBridge(_ bridge: LinphoneBridge, didReceiveEvent type: String, payload: NSDictionary)
    func linphoneBridge(_ bridge: LinphoneBridge, didEncounterError error: NSError)
}

@objcMembers
public final class LinphoneBridge: NSObject {
    public static let shared = LinphoneBridge()

    private let manager = LinphoneManager.shared
    private let audioRouter = AudioRouter()
    private let callbackQueue = DispatchQueue.main

    private var eventCallback: ((String, NSDictionary) -> Void)?

    public weak var listener: LinphoneBridgeListener?

    private override init() {
        super.init()
        manager.delegate = self
    }

    public func initialize(with config: NSDictionary?, listener: LinphoneBridgeListener? = nil) {
        if let listener = listener {
            self.listener = listener
        }

        requestMicrophonePermission { [weak self] granted in
            guard let self = self else { return }

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

            let configuration = config as? [String: Any] ?? [:]
            self.emitEvent(type: "permission", payload: [
                "resource": "microphone",
                "status": "granted"
            ])
            self.manager.initialize(with: configuration)

            self.emitEvent(type: "registration", payload: [
                "state": LinphoneManager.RegistrationState.idle.rawValue,
                "message": "Initialized"
            ])
        }
    }

    public func setEventCallback(_ callback: @escaping (String, NSDictionary) -> Void) {
        eventCallback = callback
    }

    public func clearEventCallback() {
        eventCallback = nil
    }

    public func register() {
        manager.register()
    }

    public func unregister() {
        manager.unregister()
    }

    public func callDial(number: String) {
        manager.dial(number: number)
    }

    public func callHangup() {
        manager.hangup()
    }

    public func callAnswer() {
        manager.answer()
    }

    public func sendDtmf(tone: String) {
        manager.sendDtmf(tone: tone)
    }

    public func messageSend(to recipient: String, text: String) {
        manager.sendMessage(to: recipient, text: text)
    }

    public func audioSetRoute(route: String) {
        let selectedRoute = AudioRoute(rawValue: route.lowercased()) ?? .system

        do {
            try audioRouter.setRoute(selectedRoute)
            manager.updateAudioRoute(selectedRoute)
            emitEvent(type: "audioRoute", payload: [
                "route": selectedRoute.rawValue
            ])
        } catch {
            emitError("audioRoute", error: error)
        }
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
                guard let self = self else { return }
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
            guard let self = self else { return }
            let dictionary = payload as NSDictionary
            self.listener?.linphoneBridge(self, didReceiveEvent: type, payload: dictionary)
            self.eventCallback?(type, dictionary)
        }
    }

    private func emitError(_ type: String, error: Error) {
        let nsError = error as NSError
        callbackQueue.async { [weak self] in
            guard let self = self else { return }
            self.listener?.linphoneBridge(self, didEncounterError: nsError)
        }
        emitEvent(type: "error", payload: [
            "category": type,
            "message": error.localizedDescription
        ])
    }
}

extension LinphoneBridge: LinphoneManagerDelegate {
    public func linphoneManager(_ manager: LinphoneManager, didUpdateRegistration state: LinphoneManager.RegistrationState, message: String?) {
        var payload: [String: Any] = ["state": state.rawValue]
        if let message = message {
            payload["message"] = message
        }
        emitEvent(type: "registration", payload: payload)
    }

    public func linphoneManager(_ manager: LinphoneManager, didUpdateCall state: LinphoneManager.CallState, info: [String: Any]) {
        var payload = info
        payload["state"] = state.rawValue
        emitEvent(type: "call", payload: payload)
    }

    public func linphoneManager(_ manager: LinphoneManager, didReceiveMessage payload: [String: Any]) {
        emitEvent(type: "message", payload: payload)
    }

    public func linphoneManager(_ manager: LinphoneManager, didChangeAudioRoute route: AudioRoute) {
        emitEvent(type: "audioRoute", payload: [
            "route": route.rawValue
        ])
    }

    public func linphoneManager(_ manager: LinphoneManager, didFailWith error: Error, category: String) {
        emitError(category, error: error)
    }
}
