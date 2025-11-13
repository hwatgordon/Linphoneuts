# Setup Guide

This guide will help you set up the development environment for the cross-platform mobile plugin project.

## Prerequisites

### General Requirements
- Node.js 14.0+ 
- npm or yarn
- Git

### iOS Development
- macOS 10.15+
- Xcode 14.0+
- iOS 12.0+ SDK
- CocoaPods

### Android Development
- Android Studio Arctic Fox+
- Android SDK (API Level 21+)
- Java 8+ or Kotlin 1.5+
- Gradle 7.0+

### UniApp Development
- HBuilderX or VS Code with UniApp plugins
- WeChat Developer Tools (for mini-program development)

## Initial Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd cross-platform-mobile-plugin
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Set up all components
npm run setup
```

### 3. Platform-Specific Setup

#### iOS Plugin Setup
```bash
cd ios-plugin
pod install
```
Then open `Plugin.xcworkspace` in Xcode.

#### Android Plugin Setup
```bash
cd android-plugin
./gradlew build
```
Then open the project in Android Studio.

#### UniApp Demo Setup
```bash
cd uniapp-demo
npm install
```

## Environment Configuration

### iOS Configuration
1. Configure your Apple Developer account in Xcode
2. Set up provisioning profiles and certificates
3. Update bundle identifiers as needed

### Android Configuration
1. Configure Android SDK paths in `local.properties`
2. Set up signing configurations for release builds
3. Update package names as needed

### UniApp Configuration
1. Configure app IDs and keys in `manifest.json`
2. Set up platform-specific configurations
3. Configure plugin parameters

## Verification

To verify your setup:

```bash
# Test iOS plugin
cd ios-plugin && xcodebuild test

# Test Android plugin  
cd android-plugin && ./gradlew test

# Test UniApp demo
cd uniapp-demo && npm run dev:h5
```

## Troubleshooting

For common issues and solutions, see the [Troubleshooting Guide](troubleshooting.md).

## Next Steps

After setup, refer to the [Development Guide](development.md) to start building your plugins.