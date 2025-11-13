# UniApp Plugin API Reference

This document provides detailed API documentation for integrating the cross-platform plugins with UniApp applications.

## Plugin Registration

### Universal Plugin Interface

The plugin provides a universal interface that works across all supported platforms.

```javascript
// Register the plugin
const plugin = uni.requireNativePlugin('CrossPlatformPlugin');
```

## Core Methods

### initialize(config)

Initializes the plugin with the provided configuration.

**Parameters:**
- `config` (Object): Plugin configuration object
  - `apiKey` (String): API key for authentication
  - `debugMode` (Boolean): Enable debug logging (default: false)
  - `timeout` (Number): Request timeout in milliseconds (default: 30000)

**Returns:**
- `Promise<Boolean>`: Resolves to true if initialization successful

**Example:**
```javascript
const config = {
  apiKey: 'your-api-key',
  debugMode: true,
  timeout: 30000
};

try {
  const success = await plugin.initialize(config);
  if (success) {
    console.log('Plugin initialized successfully');
  } else {
    console.error('Plugin initialization failed');
  }
} catch (error) {
  console.error('Initialization error:', error);
}
```

### methodName(param1, param2)

Performs the specified operation with the given parameters.

**Parameters:**
- `param1` (String): First parameter
- `param2` (Number): Second parameter

**Returns:**
- `Promise<String>`: Result of the operation

**Example:**
```javascript
try {
  const result = await plugin.methodName('value', 42);
  console.log('Operation result:', result);
} catch (error) {
  console.error('Operation error:', error);
}
```

## Event Handling

### addEventListener(eventName, callback)

Registers an event listener for the specified event.

**Parameters:**
- `eventName` (String): Name of the event to listen for
- `callback` (Function): Callback function to handle the event

**Example:**
```javascript
plugin.addEventListener('pluginEvent', (data) => {
  console.log('Received event:', data);
});

plugin.addEventListener('pluginError', (error) => {
  console.error('Plugin error:', error);
});
```

### removeEventListener(eventName, callback)

Removes an event listener for the specified event.

**Parameters:**
- `eventName` (String): Name of the event
- `callback` (Function): Callback function to remove

**Example:**
```javascript
const handleEvent = (data) => console.log(data);
plugin.addEventListener('pluginEvent', handleEvent);

// Later, remove the listener
plugin.removeEventListener('pluginEvent', handleEvent);
```

## Platform-Specific Methods

### iOS-Specific Methods

These methods are only available on iOS platforms.

```javascript
// Check if running on iOS
if (uni.getSystemInfoSync().platform === 'ios') {
  const result = await plugin.iosSpecificMethod();
}
```

### Android-Specific Methods

These methods are only available on Android platforms.

```javascript
// Check if running on Android
if (uni.getSystemInfoSync().platform === 'android') {
  const result = await plugin.androidSpecificMethod();
}
```

## Utility Methods

### getPlatform()

Returns the current platform information.

**Returns:**
- `Object`: Platform information
  - `platform` (String): 'ios', 'android', 'h5', etc.
  - `version` (String): Platform version
  - `isSupported` (Boolean): Whether the platform is supported

**Example:**
```javascript
const platformInfo = plugin.getPlatform();
console.log('Platform:', platformInfo.platform);
console.log('Supported:', platformInfo.isSupported);
```

### getVersion()

Returns the plugin version information.

**Returns:**
- `String`: Plugin version

**Example:**
```javascript
const version = plugin.getVersion();
console.log('Plugin version:', version);
```

## Error Handling

### Error Types

The plugin can throw the following error types:

- `InitializationError`: Plugin failed to initialize
- `ConfigurationError`: Invalid configuration provided
- `OperationError`: Operation failed
- `TimeoutError`: Operation timed out
- `PlatformError`: Platform not supported

### Error Object Structure

```javascript
{
  code: 'ERROR_CODE',
  message: 'Error description',
  details: {
    // Additional error details
  }
}
```

### Error Handling Example

```javascript
try {
  const result = await plugin.methodName();
} catch (error) {
  switch (error.code) {
    case 'InitializationError':
      console.error('Plugin not initialized:', error.message);
      break;
    case 'OperationError':
      console.error('Operation failed:', error.message);
      break;
    case 'TimeoutError':
      console.error('Operation timed out:', error.message);
      break;
    default:
      console.error('Unknown error:', error);
  }
}
```

## Vue Component Integration

### Plugin Service

Create a plugin service for better integration with Vue components:

```javascript
// services/pluginService.js
class PluginService {
  constructor() {
    this.plugin = null;
    this.initialized = false;
  }

  async initialize(config) {
    if (this.initialized) return true;
    
    try {
      this.plugin = uni.requireNativePlugin('CrossPlatformPlugin');
      this.initialized = await this.plugin.initialize(config);
      return this.initialized;
    } catch (error) {
      console.error('Plugin service initialization failed:', error);
      return false;
    }
  }

  async methodName(param1, param2) {
    if (!this.initialized) {
      throw new Error('Plugin not initialized');
    }
    return await this.plugin.methodName(param1, param2);
  }

  addEventListener(eventName, callback) {
    if (this.plugin) {
      this.plugin.addEventListener(eventName, callback);
    }
  }
}

export default new PluginService();
```

### Vue Component Usage

```vue
<template>
  <view class="plugin-demo">
    <button @click="performOperation">Perform Operation</button>
    <text v-if="result">Result: {{ result }}</text>
    <text v-if="error" class="error">Error: {{ error }}</text>
  </view>
</template>

<script>
import pluginService from '@/services/pluginService';

export default {
  data() {
    return {
      result: '',
      error: ''
    };
  },
  
  async mounted() {
    await this.initializePlugin();
  },
  
  methods: {
    async initializePlugin() {
      const config = {
        apiKey: 'your-api-key',
        debugMode: process.env.NODE_ENV === 'development'
      };
      
      const success = await pluginService.initialize(config);
      if (!success) {
        this.error = 'Failed to initialize plugin';
      }
    },
    
    async performOperation() {
      try {
        this.error = '';
        this.result = await pluginService.methodName('test', 123);
      } catch (error) {
        this.error = error.message;
      }
    }
  }
};
</script>

<style>
.error {
  color: #ff4444;
}
</style>
```

## Platform Compatibility

| Method | iOS | Android | H5 | WeChat Mini-Program |
|--------|-----|---------|----|---------------------|
| initialize | ✅ | ✅ | ✅ | ✅ |
| methodName | ✅ | ✅ | ✅ | ✅ |
| addEventListener | ✅ | ✅ | ✅ | ✅ |
| getPlatform | ✅ | ✅ | ✅ | ✅ |
| getVersion | ✅ | ✅ | ✅ | ✅ |

## Performance Considerations

- Initialize the plugin only once per application lifecycle
- Cache plugin instance for reuse
- Use event listeners for real-time updates instead of polling
- Handle errors gracefully to prevent app crashes

## Debugging

### Enable Debug Mode

```javascript
const config = {
  debugMode: true
};
await plugin.initialize(config);
```

### Console Logging

The plugin will log debug information to the console when debug mode is enabled.

### Platform-Specific Debugging

- **iOS**: Check Xcode console for native logs
- **Android**: Use Android Studio's Logcat
- **H5**: Use browser developer tools
- **WeChat Mini-Program**: Use WeChat Developer Tools console