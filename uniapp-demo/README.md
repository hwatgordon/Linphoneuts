# UniApp Demo Application

This directory contains a comprehensive demo application showcasing the integration and usage of the cross-platform mobile plugins.

## Structure

```
uniapp-demo/
├── pages/             # Application pages
├── components/        # Reusable components
├── static/           # Static assets
├── plugins/          # Plugin integration
├── manifest.json     # App configuration
├── pages.json        # Page routing
├── App.vue           # Root component
└── main.js           # Entry point
```

## Features

- Plugin usage examples
- Multi-platform support (H5, WeChat Mini-Program, App)
- Comprehensive test cases
- Performance benchmarks

## Development

```bash
# Install dependencies
npm install

# Development
npm run dev:h5              # H5 development
npm run dev:mp-weixin       # WeChat mini-program
npm run dev:app             # App development

# Build
npm run build:h5            # Build for H5
npm run build:mp-weixin     # Build for WeChat
npm run build:app           # Build for App
```

## Plugin Integration

The demo application shows how to:

1. Initialize plugins
2. Call native methods
3. Handle callbacks and events
4. Manage plugin lifecycle

## Platform Support

- H5 (Web)
- WeChat Mini-Program
- iOS App
- Android App

## Documentation

See [Demo Documentation](../docs/demo.md) for detailed usage examples.