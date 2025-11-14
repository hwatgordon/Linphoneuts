import Foundation

@objcMembers
public final class LinphoneSwiftBridge: NSObject {
    public static let shared = LinphoneSwiftBridge(wrapper: .shared)

    private enum Event: String, CaseIterable {
        case registration
        case call
        case message
        case audioRoute
    }

    private let wrapper: LinphoneCApiWrapper
    private let handlerQueue = DispatchQueue(label: "com.utssdk.linphone.bridge.handlers", qos: .userInitiated)
    private var eventHandlers: [Event: [String: ([String: Any]) -> Void]] = [:]

    public override convenience init() {
        self.init(wrapper: .shared)
    }

    internal init(wrapper: LinphoneCApiWrapper) {
        self.wrapper = wrapper
        super.init()
        self.wrapper.delegate = self
        Event.allCases.forEach { eventHandlers[$0] = [:] }
    }

    @discardableResult
    public func configure(config: [String: Any], error: NSErrorPointer) -> Bool {
        var localError: NSError?
        let success = wrapper.configure(with: config, error: &localError)
        if !success {
            error?.pointee = localError
        }
        return success
    }

    @discardableResult
    public func initWithConfig(_ config: [String: Any], error: NSErrorPointer) -> Bool {
        return configure(config: config, error: error)
    }

    public func register(completion: @escaping (NSError?) -> Void) {
        wrapper.registerWithCompletion { error in
            completion(error)
        }
    }

    public func unregister(completion: @escaping (NSError?) -> Void) {
        wrapper.unregisterWithCompletion { error in
            completion(error)
        }
    }

    public func callDial(_ number: String, completion: @escaping (NSError?) -> Void) {
        wrapper.callDial(number) { error in
            completion(error)
        }
    }

    public func callHangup(completion: @escaping (NSError?) -> Void) {
        wrapper.callHangup { error in
            completion(error)
        }
    }

    public func callAnswer(completion: @escaping (NSError?) -> Void) {
        wrapper.callAnswer { error in
            completion(error)
        }
    }

    public func sendDtmf(_ tone: String, completion: @escaping (NSError?) -> Void) {
        wrapper.sendDtmf(tone) { error in
            completion(error)
        }
    }

    public func messageSend(to recipient: String, body: String, completion: @escaping (NSError?) -> Void) {
        wrapper.messageSendTo(recipient, body: body) { error in
            completion(error)
        }
    }

    public func messageSend(_ recipient: String, text: String, completion: @escaping (NSError?) -> Void) {
        messageSend(to: recipient, body: text, completion: completion)
    }

    public func setAudioRoute(_ route: String, completion: @escaping (NSError?) -> Void) {
        wrapper.setAudioRoute(route) { error in
            completion(error)
        }
    }

    public func currentState() -> [String: Any] {
        return wrapper.getState()
    }

    public func getState() -> [String: Any] {
        return currentState()
    }

    @discardableResult
    public func subscribe(event: String, handler: @escaping ([String: Any]) -> Void) -> String? {
        guard let bridgeEvent = Event(rawValue: event) else {
            return nil
        }

        let token = UUID().uuidString
        handlerQueue.async { [weak self] in
            guard let self else { return }
            var handlers = self.eventHandlers[bridgeEvent] ?? [:]
            handlers[token] = handler
            self.eventHandlers[bridgeEvent] = handlers
        }
        return token
    }

    public func unsubscribe(event: String, token: String) {
        guard let bridgeEvent = Event(rawValue: event) else {
            return
        }

        handlerQueue.async { [weak self] in
            guard let self else { return }
            var handlers = self.eventHandlers[bridgeEvent] ?? [:]
            handlers.removeValue(forKey: token)
            self.eventHandlers[bridgeEvent] = handlers
        }
    }

    public func unsubscribeAll(event: String) {
        guard let bridgeEvent = Event(rawValue: event) else {
            return
        }
        handlerQueue.async { [weak self] in
            guard let self else { return }
            self.eventHandlers[bridgeEvent]?.removeAll()
        }
    }

    private func emit(event: Event, payload: [String: Any]) {
        var callbacks: [([String: Any]) -> Void] = []
        handlerQueue.sync {
            callbacks = Array(eventHandlers[event]?.values ?? [])
        }

        guard !callbacks.isEmpty else { return }
        DispatchQueue.main.async {
            callbacks.forEach { $0(payload) }
        }
    }
}

extension LinphoneSwiftBridge: LinphoneCApiWrapperDelegate {
    public func linphoneWrapper(_ wrapper: LinphoneCApiWrapper,
                                didUpdateRegistrationState state: String,
                                detail: [String: Any]?) {
        var payload: [String: Any] = ["state": state]
        if let detail {
            payload["detail"] = detail
        }
        emit(event: .registration, payload: payload)
    }

    public func linphoneWrapper(_ wrapper: LinphoneCApiWrapper,
                                didUpdateCallState state: String,
                                detail: [String: Any]?) {
        var payload: [String: Any] = ["state": state]
        if let detail {
            payload["detail"] = detail
        }
        emit(event: .call, payload: payload)
    }

    public func linphoneWrapper(_ wrapper: LinphoneCApiWrapper,
                                didReceiveMessageEvent event: String,
                                payload: [String: Any]?) {
        var body: [String: Any] = ["event": event]
        if let payload {
            body["payload"] = payload
        }
        emit(event: .message, payload: body)
    }

    public func linphoneWrapper(_ wrapper: LinphoneCApiWrapper,
                                didUpdateAudioRoute route: String) {
        emit(event: .audioRoute, payload: ["route": route])
    }
}
