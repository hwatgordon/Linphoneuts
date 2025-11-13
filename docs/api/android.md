# Android Plugin API Reference

This document provides detailed API documentation for the Android plugin implementation.

## Core Classes

### Plugin

The main plugin class that provides the interface for native functionality.

#### Methods

##### `initialize(PluginConfig config) -> boolean`

Initializes the plugin with the provided configuration.

**Parameters:**
- `config`: Plugin configuration object

**Returns:**
- `boolean`: true if initialization successful, false otherwise

**Example:**
```java
Plugin plugin = new Plugin();
PluginConfig config = new PluginConfig.Builder()
    .setApiKey("your-api-key")
    .setDebugMode(true)
    .setTimeout(30000)
    .build();
boolean success = plugin.initialize(config);
```

##### `methodName(String param1, int param2) -> Result<String>`

Performs the specified operation with the given parameters.

**Parameters:**
- `param1`: First parameter description
- `param2`: Second parameter description

**Returns:**
- `Result<String>`: Result containing the operation outcome

**Example:**
```java
Result<String> result = plugin.methodName("value", 42);
if (result.isSuccess()) {
    String value = result.getData();
    Log.d("Plugin", "Success: " + value);
} else {
    Exception error = result.getError();
    Log.e("Plugin", "Error: " + error.getMessage());
}
```

### PluginManager

Manages the plugin lifecycle and configuration.

#### Methods

##### `getInstance() -> PluginManager`

Returns the singleton instance of the plugin manager.

##### `registerPlugin(PluginInterface plugin)`

Registers a plugin with the manager.

##### `getPlugin(String name) -> PluginInterface`

Retrieves a registered plugin by name.

## Data Models

### PluginConfig

Configuration object for plugin initialization.

**Builder Methods:**
- `setApiKey(String apiKey)`: Set API key for authentication
- `setDebugMode(boolean debugMode)`: Enable debug logging
- `setTimeout(long timeout)`: Set request timeout in milliseconds
- `setContext(Context context)`: Set application context

**Example:**
```java
PluginConfig config = new PluginConfig.Builder()
    .setApiKey("your-api-key")
    .setDebugMode(true)
    .setTimeout(30000)
    .setContext(getApplicationContext())
    .build();
```

## Events

### PluginEventListener

Interface for handling plugin events.

#### Methods

##### `onPluginInitialized(Plugin plugin)`

Called when the plugin finishes initialization.

##### `onPluginError(Plugin plugin, Exception error)`

Called when the plugin encounters an error.

##### `onPluginEvent(Plugin plugin, String eventType, Bundle data)`

Called when the plugin emits an event.

## Error Handling

### PluginException

Custom exception class for plugin operations.

**Types:**
- `INITIALIZATION_FAILED`: Plugin failed to initialize
- `INVALID_CONFIGURATION`: Invalid configuration provided
- `OPERATION_FAILED`: Operation failed with underlying error
- `TIMEOUT`: Operation timed out

**Example:**
```java
try {
    plugin.performOperation();
} catch (PluginException e) {
    switch (e.getType()) {
        case INITIALIZATION_FAILED:
            Log.e("Plugin", "Initialization failed");
            break;
        case OPERATION_FAILED:
            Log.e("Plugin", "Operation failed: " + e.getMessage());
            break;
        default:
            Log.e("Plugin", "Unknown error: " + e.getMessage());
    }
}
```

## Usage Examples

### Basic Setup

```java
public class MainActivity extends AppCompatActivity implements PluginEventListener {
    private Plugin plugin;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        plugin = new Plugin();
        plugin.setEventListener(this);
        
        PluginConfig config = new PluginConfig.Builder()
            .setApiKey("your-api-key")
            .setDebugMode(true)
            .setContext(this)
            .build();
            
        plugin.initialize(config);
    }
    
    @Override
    public void onPluginInitialized(Plugin plugin) {
        Log.d("Plugin", "Plugin initialized successfully");
    }
    
    @Override
    public void onPluginError(Plugin plugin, Exception error) {
        Log.e("Plugin", "Plugin error: " + error.getMessage());
    }
    
    @Override
    public void onPluginEvent(Plugin plugin, String eventType, Bundle data) {
        Log.d("Plugin", "Event: " + eventType + ", Data: " + data);
    }
}
```

### Async Operations

```java
plugin.performAsyncOperation(new ResultCallback<String>() {
    @Override
    public void onSuccess(String result) {
        runOnUiThread(() -> updateUI(result));
    }
    
    @Override
    public void onFailure(Exception error) {
        runOnUiThread(() -> showError(error.getMessage()));
    }
});
```

### Kotlin Usage

```kotlin
val plugin = Plugin()
val config = PluginConfig.Builder()
    .setApiKey("your-api-key")
    .setDebugMode(true)
    .setContext(this)
    .build()

val success = plugin.initialize(config)

if (success) {
    plugin.performOperation { result ->
        result.onSuccess { data ->
            updateUI(data)
        }.onFailure { error ->
            showError(error.message ?: "Unknown error")
        }
    }
}
```

## Thread Safety

All plugin methods are thread-safe and can be called from any thread. However, UI updates should be performed on the main thread using `runOnUiThread()`.

## Memory Management

The plugin follows Android's memory management guidelines. Ensure to:

- Release resources in `onDestroy()`
- Use weak references for Activity/Context when appropriate
- Avoid memory leaks in long-running operations

## Permissions

Add required permissions to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<!-- Add other required permissions -->
```

## Platform Limitations

- Requires Android API Level 21+ (Android 5.0)
- Some features may require specific Android versions
- Certain permissions may be required at runtime

## ProGuard Configuration

If using ProGuard, add the following rules:

```proguard
-keep class com.yourpackage.plugin.** { *; }
-keep class com.yourpackage.plugin.model.** { *; }
```