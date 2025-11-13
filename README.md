# Cross-Platform Mobile Plugin Project

This project provides native mobile plugins for iOS and Android platforms, designed to work seamlessly with UniApp applications.

## Project Goals

- Develop native plugins for iOS and Android platforms
- Create a comprehensive UniApp demo application showcasing plugin integration
- Provide tooling for plugin development and management
- Establish clear documentation for setup, development, and deployment

## Repository Structure

```
├── ios-plugin/          # iOS native plugin implementation
├── android-plugin/      # Android native plugin implementation  
├── uniapp-demo/         # UniApp demo application
├── docs/               # Project documentation
├── tooling/            # Development and build tooling
├── README.md           # This file
└── .gitignore          # Git ignore rules
```

## Deliverables

### iOS Plugin (`ios-plugin/`)
- Native iOS plugin implementation
- Xcode project files
- Plugin documentation and API reference

### Android Plugin (`android-plugin/`)
- Native Android plugin implementation
- Android Studio project files
- Plugin documentation and API reference

### UniApp Demo (`uniapp-demo/`)
- Complete demo application
- Plugin integration examples
- Usage documentation

### Documentation (`docs/`)
- Setup guide
- Development documentation
- API reference
- Deployment instructions

### Tooling (`tooling/`)
- Build scripts
- Development utilities
- Testing frameworks

## Build and Test Entry Points

### iOS Plugin
```bash
cd ios-plugin
# Open in Xcode and build
```

### Android Plugin
```bash
cd android-plugin
# Open in Android Studio and build
# Or build via command line
./gradlew build
```

### UniApp Demo
```bash
cd uniapp-demo
npm install
npm run dev:mp-weixin    # WeChat mini-program
npm run build:mp-weixin  # Build for WeChat
npm run dev:h5          # H5 development
npm run build:h5        # Build for H5
```

## Setup Guide

Please refer to the [setup guide](docs/setup.md) for detailed installation and configuration instructions.

## Development

For development guidelines and contribution instructions, see the [development documentation](docs/development.md).

## Contributing

We welcome contributions! Please read our [contributing guidelines](CONTRIBUTING.md) for details on how to contribute to this project.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.