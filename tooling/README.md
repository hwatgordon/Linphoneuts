# Development Tooling

This directory contains tooling and utilities for developing, building, and testing the cross-platform mobile plugins.

## Structure

```
tooling/
├── scripts/          # Build and utility scripts
├── config/           # Configuration files
├── templates/        # Project templates
├── tests/           # Testing utilities
├── linters/         # Code quality tools
└── README.md        # This file
```

## Available Tools

### Build Scripts
- `build-all.js` - Build all components
- `build-ios.js` - Build iOS plugin
- `build-android.js` - Build Android plugin
- `build-demo.js` - Build UniApp demo

### Testing Tools
- `test-runner.js` - Run all tests
- `test-ios.sh` - iOS-specific tests
- `test-android.sh` - Android-specific tests
- `test-demo.js` - UniApp demo tests

### Code Quality
- ESLint configuration
- SwiftLint configuration
- Android Lint configuration
- Pre-commit hooks

### Development Utilities
- Plugin generator
- Project scaffolder
- Dependency manager
- Release automation

## Usage

```bash
# Install tooling dependencies
npm install

# Run all builds
npm run build

# Run all tests
npm run test

# Run linting
npm run lint

# Generate new plugin
npm run generate:plugin
```

## Configuration

Tooling configuration files are located in the `config/` directory. Modify these files to customize build processes, test environments, and code quality rules.

## Contributing

When adding new tools:

1. Follow existing naming conventions
2. Include documentation and usage examples
3. Add tests for the tooling itself
4. Update the README with new tool descriptions