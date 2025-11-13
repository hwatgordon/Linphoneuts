# iOS Plugin API Reference

This document provides detailed API documentation for the iOS plugin implementation.

## Core Classes

### Plugin

The main plugin class that provides the interface for native functionality.

#### Methods

##### `initialize(config: PluginConfig) -> Bool`

Initializes the plugin with the provided configuration.

**Parameters:**
- `config`: Plugin configuration object

**Returns:**
- `Bool`: True if initialization successful, false otherwise

**Example:**
```swift
let plugin = Plugin()
let config = PluginConfig(apiKey: "your-api-key")
let success = plugin.initialize(config: config)
```

##### `methodName(param1: String, param2: Int) -> Result<String>`

Performs the specified operation with the given parameters.

**Parameters:**
- `param1`: First parameter description
- `param2`: Second parameter description

**Returns:**
- `Result<String>`: Result containing the operation outcome

**Example:**
```swift
let result = plugin.methodName(param1: "value", param2: 42)
switch result {
case .success(let value):
    print("Success: \(value)")
case .failure(let error):
    print("Error: \(error)")
}
```

### PluginManager

Manages the plugin lifecycle and configuration.

#### Methods

##### `shared -> PluginManager`

Returns the shared instance of the plugin manager.

##### `registerPlugin(_ plugin: PluginProtocol)`

Registers a plugin with the manager.

## Data Models

### PluginConfig

Configuration object for plugin initialization.

**Properties:**
- `apiKey: String`: API key for authentication
- `debugMode: Bool`: Enable debug logging
- `timeout: TimeInterval`: Request timeout in seconds

## Events

### PluginEventDelegate

Delegate protocol for handling plugin events.

#### Methods

##### `pluginDidInitialize(_ plugin: Plugin)`

Called when the plugin finishes initialization.

##### `plugin(_ plugin: Plugin, didEncounterError error: Error)`

Called when the plugin encounters an error.

## Error Handling

### PluginError

Custom error types for plugin operations.

**Cases:**
- `initializationFailed`: Plugin failed to initialize
- `invalidConfiguration`: Invalid configuration provided
- `operationFailed`: Operation failed with underlying error
- `timeout`: Operation timed out

## Usage Examples

### Basic Setup

```swift
import Plugin

class ViewController: UIViewController, PluginEventDelegate {
    let plugin = Plugin()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        plugin.delegate = self
        
        let config = PluginConfig(
            apiKey: "your-api-key",
            debugMode: true,
            timeout: 30.0
        )
        
        plugin.initialize(config: config)
    }
    
    func pluginDidInitialize(_ plugin: Plugin) {
        print("Plugin initialized successfully")
    }
    
    func plugin(_ plugin: Plugin, didEncounterError error: Error) {
        print("Plugin error: \(error)")
    }
}
```

### Async Operations

```swift
plugin.performAsyncOperation { result in
    DispatchQueue.main.async {
        switch result {
        case .success(let data):
            self.updateUI(with: data)
        case .failure(let error):
            self.showError(error)
        }
    }
}
```

## Thread Safety

All plugin methods are thread-safe and can be called from any thread. However, UI updates should be performed on the main thread.

## Memory Management

The plugin uses ARC (Automatic Reference Counting) for memory management. Ensure to maintain proper strong/weak references to avoid retain cycles.

## Platform Limitations

- Requires iOS 12.0 or later
- Some features may require specific iOS versions
- Certain permissions may be required in Info.plist