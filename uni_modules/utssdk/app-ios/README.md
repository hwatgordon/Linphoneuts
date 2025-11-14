# iOS Plugin

This directory hosts the native iOS implementation used by the UTS SDK to
communicate with the bundled Linphone binaries. The implementation is split
into three parts:

- `src/` — Objective-C and Swift sources for the bridge layer
- `Frameworks/` — Precompiled Linphone frameworks supplied with the SDK
- `utssdk.xcconfig` — Shared build settings that configure the Swift/Objective-C
  bridge and expose the framework search paths

## Integrating with Xcode

1. Add the contents of `Frameworks/` to your iOS target (either by
   drag-and-dropping the frameworks or by referencing them through a file
   group).
2. Import `utssdk.xcconfig` from your target's build configuration so the
   `SWIFT_OBJC_BRIDGING_HEADER`, `HEADER_SEARCH_PATHS`, and
   `FRAMEWORK_SEARCH_PATHS` are set correctly.
3. Ensure the Swift sources under `src/` are compiled as part of the target. The
   generated UTS Swift facade depends on `LinphoneSwiftBridge` to access the
   Objective-C wrapper.

## Runtime Architecture

```
UTS (JavaScript/TypeScript)
          │
          ▼
Generated Swift platform shim
          │
          ▼
LinphoneSwiftBridge (Swift facade)
          │
          ▼
LinphoneCApiWrapper (Objective-C, thread-safe)
          │
          ▼
Bundled Linphone C frameworks
```

The Objective-C wrapper exposes the minimal API necessary for registering SIP
accounts, controlling calls, sending messages, and managing audio routing. All
callbacks are marshalled back to the main queue to ensure UI safety, and the
Swift facade fans out events to UTS listeners without relying on CallKit.

## Build Requirements

- iOS 12.0+
- Xcode 14.0+
- Swift 5.0+
