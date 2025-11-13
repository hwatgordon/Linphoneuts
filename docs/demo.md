# Demo Application Guide

This guide provides comprehensive instructions for using and understanding the UniApp demo application.

## Overview

The demo application showcases the integration and usage of the cross-platform mobile plugins across different platforms including H5, WeChat Mini-Program, iOS, and Android.

## Demo Features

### Core Functionality Demonstrations

1. **Plugin Initialization**
   - Configuration setup
   - Error handling
   - Platform detection

2. **Method Calls**
   - Synchronous operations
   - Asynchronous operations
   - Parameter handling

3. **Event Management**
   - Event registration
   - Event handling
   - Event cleanup

4. **Error Scenarios**
   - Network errors
   - Timeout handling
   - Invalid parameters

### Platform-Specific Examples

#### H5 Demo
- Browser compatibility testing
- Web API integration
- Performance monitoring

#### WeChat Mini-Program Demo
- Mini-program specific APIs
- WeChat ecosystem integration
- Permission handling

#### iOS Demo
- Native iOS features
- Performance optimization
- Memory management

#### Android Demo
- Native Android features
- Background processing
- Permission management

## Application Structure

```
uniapp-demo/
├── pages/
│   ├── index/               # Home page
│   ├── plugin-demo/         # Plugin functionality demo
│   ├── platform-tests/      # Platform-specific tests
│   └── settings/            # Configuration and settings
├── components/
│   ├── plugin-card/         # Plugin demo card component
│   ├── status-indicator/    # Status display component
│   └── error-display/       # Error handling component
├── static/
│   ├── images/             # Demo images and icons
│   └── data/               # Sample data files
├── plugins/
│   ├── ios-plugin.js       # iOS plugin wrapper
│   ├── android-plugin.js   # Android plugin wrapper
│   └── universal-plugin.js # Universal plugin interface
├── utils/
│   ├── plugin-manager.js   # Plugin management utilities
│   ├── platform-detector.js # Platform detection
│   └── logger.js           # Logging utilities
├── manifest.json           # App configuration
├── pages.json             # Page routing configuration
├── App.vue                # Root component
└── main.js               # Application entry point
```

## Getting Started

### Prerequisites

- Node.js 14.0+
- HBuilderX or VS Code with UniApp plugins
- WeChat Developer Tools (for mini-program development)

### Installation

```bash
cd uniapp-demo
npm install
```

### Development

#### H5 Development
```bash
npm run dev:h5
```

#### WeChat Mini-Program Development
```bash
npm run dev:mp-weixin
```

#### App Development (HBuilderX)
1. Open the project in HBuilderX
2. Select "运行" > "运行到手机或模拟器"
3. Choose the target platform

### Demo Pages

#### Home Page (`pages/index`)
- Overview of demo features
- Plugin status display
- Quick access to demo sections

#### Plugin Demo (`pages/plugin-demo`)
- Interactive plugin method testing
- Real-time result display
- Error scenario testing

#### Platform Tests (`pages/platform-tests`)
- Platform-specific feature testing
- Cross-platform compatibility checks
- Performance benchmarks

#### Settings (`pages/settings`)
- Plugin configuration
- Debug mode toggle
- Logging preferences

## Usage Examples

### Basic Plugin Integration

```javascript
// In a Vue component
export default {
  data() {
    return {
      pluginStatus: 'not-initialized',
      result: null,
      error: null
    };
  },
  
  async mounted() {
    await this.initializePlugin();
  },
  
  methods: {
    async initializePlugin() {
      try {
        const plugin = uni.requireNativePlugin('CrossPlatformPlugin');
        const config = {
          apiKey: 'demo-api-key',
          debugMode: true
        };
        
        const success = await plugin.initialize(config);
        this.pluginStatus = success ? 'initialized' : 'failed';
      } catch (error) {
        this.error = error.message;
        this.pluginStatus = 'error';
      }
    },
    
    async testMethod() {
      try {
        const plugin = uni.requireNativePlugin('CrossPlatformPlugin');
        this.result = await plugin.methodName('demo', 123);
      } catch (error) {
        this.error = error.message;
      }
    }
  }
};
```

### Event Handling

```javascript
export default {
  mounted() {
    const plugin = uni.requireNativePlugin('CrossPlatformPlugin');
    
    // Register event listeners
    plugin.addEventListener('pluginEvent', this.handlePluginEvent);
    plugin.addEventListener('pluginError', this.handlePluginError);
  },
  
  beforeDestroy() {
    const plugin = uni.requireNativePlugin('CrossPlatformPlugin');
    
    // Clean up event listeners
    plugin.removeEventListener('pluginEvent', this.handlePluginEvent);
    plugin.removeEventListener('pluginError', this.handlePluginError);
  },
  
  methods: {
    handlePluginEvent(data) {
      console.log('Plugin event:', data);
      // Update UI with event data
    },
    
    handlePluginError(error) {
      console.error('Plugin error:', error);
      // Display error to user
    }
  }
};
```

## Testing

### Running Tests

```bash
# Run all tests
npm run test

# Run specific platform tests
npm run test:h5
npm run test:mp-weixin
```

### Test Categories

1. **Unit Tests**
   - Plugin method validation
   - Error handling verification
   - Data type checking

2. **Integration Tests**
   - Cross-platform compatibility
   - Plugin lifecycle management
   - Event system testing

3. **UI Tests**
   - Component rendering
   - User interaction
   - Responsive design

## Debugging

### Enabling Debug Mode

1. Go to Settings page
2. Enable "Debug Mode"
3. Check console logs for detailed information

### Platform-Specific Debugging

#### H5
- Use browser developer tools
- Check console for plugin logs
- Monitor network requests

#### WeChat Mini-Program
- Use WeChat Developer Tools
- Check console output
- Monitor real-time logs

#### Mobile Apps
- Use device debugging tools
- Check native logs
- Monitor performance metrics

## Performance Monitoring

The demo includes built-in performance monitoring:

- Method execution time
- Memory usage tracking
- Network request monitoring
- Event processing metrics

Access performance data through the Settings page or console logs.

## Customization

### Adding New Demo Features

1. Create new page in `pages/` directory
2. Add route in `pages.json`
3. Implement plugin functionality
4. Update navigation in `App.vue`

### Modifying Plugin Configuration

Edit the configuration in the Settings page or directly in `utils/plugin-manager.js`.

### Styling Customization

Modify the global styles in `App.vue` or create component-specific styles.

## Troubleshooting

### Common Issues

1. **Plugin Not Found**
   - Ensure plugin is properly registered
   - Check platform compatibility
   - Verify configuration

2. **Initialization Failures**
   - Check API key validity
   - Verify network connectivity
   - Review error logs

3. **Event Not Triggering**
   - Ensure event listeners are registered
   - Check for proper cleanup
   - Verify event names

### Getting Help

1. Check the console logs for error details
2. Review the [API Documentation](../docs/api/uniapp.md)
3. Consult the [Troubleshooting Guide](../docs/troubleshooting.md)
4. Check the [Development Guide](../docs/development.md)

## Contributing

When contributing to the demo application:

1. Follow the established code style
2. Add tests for new features
3. Update documentation
4. Test across all supported platforms

## Best Practices

- Handle errors gracefully
- Provide user feedback for all operations
- Use appropriate loading states
- Implement proper cleanup in component lifecycle
- Test across different devices and platforms