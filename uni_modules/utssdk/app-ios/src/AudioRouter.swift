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
        var options: AVAudioSession.CategoryOptions = [
            .allowBluetooth,
            .allowBluetoothA2DP
        ]

        switch route {
        case .system, .earpiece:
            break
        case .speaker:
            options.insert(.defaultToSpeaker)
        case .bluetooth:
            options.insert(.duckOthers)
        }

        // TODO: Add fine-grained configuration once SDK audio requirements are defined.
        try session.setCategory(category, mode: .voiceChat, options: options)
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
