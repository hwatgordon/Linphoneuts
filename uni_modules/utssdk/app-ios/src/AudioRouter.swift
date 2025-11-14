import Foundation
import AVFoundation

enum AudioRoute: String {
    case system
    case speaker
    case earpiece
    case bluetooth

    static var defaultRoute: AudioRoute { .system }
}

final class AudioRouter {
    private let session = AVAudioSession.sharedInstance()
    private let accessQueue = DispatchQueue(label: "com.utssdk.linphone.audio-router")

    func setRoute(_ route: AudioRoute) throws {
        try accessQueue.sync {
            let targetRoute = route
            try configureSession(for: targetRoute)
            try applyOverride(for: targetRoute)
            try session.setActive(true, options: [])
        }
    }

    private func configureSession(for route: AudioRoute) throws {
        let category: AVAudioSession.Category = .playAndRecord
        var mode: AVAudioSession.Mode = .voiceChat
        var options: AVAudioSession.CategoryOptions = [
            .allowBluetooth,
            .allowBluetoothA2DP
        ]

        switch route {
        case .system:
            options.insert(.allowAirPlay)
        case .earpiece:
            options.remove(.allowBluetoothA2DP)
        case .speaker:
            options.insert(.defaultToSpeaker)
            mode = .videoChat
        case .bluetooth:
            options.insert(.duckOthers)
        }

        try session.setCategory(category, mode: mode, options: options)
        try configurePreferredIO(for: route)
    }

    private func configurePreferredIO(for route: AudioRoute) throws {
        switch route {
        case .bluetooth:
            if let bluetoothInput = session.availableInputs?.first(where: { $0.portType.isBluetooth }) {
                do {
                    try session.setPreferredInput(bluetoothInput)
                } catch {
                    // prefer to follow system routing if Bluetooth override fails
                }
            }
        default:
            do {
                try session.setPreferredInput(nil)
            } catch {
                // ignore inability to clear preferred input when falling back to system routing
            }
        }

        do {
            try session.setPreferredSampleRate(48_000)
        } catch {
            // preferred sample rate adjustments are best-effort
        }

        do {
            try session.setPreferredIOBufferDuration(0.005)
        } catch {
            // buffer duration tuning is best-effort
        }
    }

    private func applyOverride(for route: AudioRoute) throws {
        switch route {
        case .system, .earpiece, .bluetooth:
            try session.overrideOutputAudioPort(.none)
        case .speaker:
            try session.overrideOutputAudioPort(.speaker)
        }
    }
}

private extension AVAudioSession.Port {
    var isBluetooth: Bool {
        switch self {
        case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
            return true
        default:
            return false
        }
    }
}
