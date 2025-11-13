# iOS Plugin

This directory contains the native iOS plugin implementation.

## Structure

```
ios-plugin/
├── Plugin/             # Plugin source code
├── Plugin.xcodeproj/   # Xcode project
├── Plugin.xcworkspace/ # Xcode workspace
├── Podfile            # CocoaPods dependencies
├── README.md          # iOS-specific documentation
└── Example/           # Example iOS app
```

## Development

1. Open `Plugin.xcworkspace` in Xcode
2. Build and run the example project
3. Implement plugin functionality

## API Documentation

See [API Reference](../docs/api/ios.md) for detailed API documentation.

## Build Requirements

- iOS 12.0+
- Xcode 14.0+
- Swift 5.0+