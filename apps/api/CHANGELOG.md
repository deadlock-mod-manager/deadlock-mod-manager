# api

## 2.4.0

### Minor Changes

- f48352c: Add crosshair publishing feature with database schema, API endpoints, and desktop UI for creating, publishing, and applying crosshairs

### Patch Changes

- Updated dependencies [f48352c]
  - @deadlock-mods/database@1.7.0
  - @deadlock-mods/shared@1.7.0
  - @deadlock-mods/distributed-lock@1.0.4
  - @deadlock-mods/feature-flags@0.2.2
  - @deadlock-mods/instrumentation@0.1.4

## 2.3.0

### Minor Changes

- 3127b8d: Annoucements and admin dashboard

### Patch Changes

- Updated dependencies [3127b8d]
  - @deadlock-mods/database@1.6.0
  - @deadlock-mods/shared@1.6.0
  - @deadlock-mods/distributed-lock@1.0.3
  - @deadlock-mods/feature-flags@0.2.1
  - @deadlock-mods/instrumentation@0.1.3

## 2.2.0

### Minor Changes

- 20e7f42: Add artifacts route to serve game files like gameinfo.gi. Includes new endpoint `/artifacts/deadlock/gameinfo.gi` and GitHub workflow for automatically downloading and updating game files from Steam depot.
- f02f058: Add user-specific feature flag overrides with experimental features UI
- bca1b80: Add feature flag to show plugins functionality and implement it in settings page
- 82aad00: Folder based profile management
- 51c1afb: Add mod blacklist system with Discord admin commands

### Patch Changes

- 23e1528: Add user segmentation and priority-based overrides to feature flags system with automatic registration helper
- Updated dependencies [f02f058]
- Updated dependencies [921a7a8]
- Updated dependencies [921a7a8]
- Updated dependencies [921a7a8]
- Updated dependencies [0a2b9f4]
- Updated dependencies [23e1528]
- Updated dependencies [51c1afb]
  - @deadlock-mods/feature-flags@0.2.0
  - @deadlock-mods/database@1.5.0
  - @deadlock-mods/shared@1.5.0
  - @deadlock-mods/distributed-lock@1.0.2
  - @deadlock-mods/instrumentation@0.1.2

## 2.1.0

### Minor Changes

- Ability to scan local packages for existing addons
- Reporting system

### Patch Changes

- Updated dependencies
  - @deadlock-mods/common@1.1.0
  - @deadlock-mods/database@1.4.0
  - @deadlock-mods/feature-flags@0.1.1
  - @deadlock-mods/instrumentation@0.1.1
  - @deadlock-mods/distributed-lock@1.0.1
  - @deadlock-mods/shared@1.4.0

## 2.0.0

### Major Changes

- Refactored the API and bumped to match current API version v2

### Patch Changes

- Updated dependencies [5e75639]
  - @deadlock-mods/vpk-parser@1.0.0

## 1.1.0

### Minor Changes

- 45d2f75: Major API improvements and refactoring

  - Streamline mod synchronization process with better performance
  - Introduce oRPC and OpenAPI for better type safety and documentation
  - Add distributed locking for mod synchronization jobs
  - Implement comprehensive caching system with configurable durations
  - Add legacy route support for backward compatibility
  - Enhanced CORS configuration with environment variable support
  - Improved health check endpoint
  - Add timestamps for mod downloads
  - Fix GameBanana provider download count reference
  - Fix tag parsing to handle non-array tags properly
  - Update cache configuration for optimal performance (1-12 hour durations)

### Patch Changes

- 45d2f75: Dependencies and maintenance updates

  - Update dependencies in Cargo.lock and Cargo.toml for Rust components
  - Update dependencies and scripts across multiple packages
  - Improve code formatting and consistency across files
  - General maintenance and dependency updates for better security and performance

## 1.0.0

### Major Changes

- 7f379a5: ## 🎉 Major Features

  ### Multi-File Download System

  - **Multi-file download support**: Mods can now have multiple download files per version
  - **File selection dialogs**: Choose which files to install when mods have multiple archives or VPK files
  - **Streamlined download handling**: Improved UI and backend processing for better user experience

  ### Content Management & Safety

  - **NSFW content detection and filtering**: Automatic detection and filtering of NSFW content with user controls
  - **Gameinfo.gi management**: Advanced gameinfo.gi section replacement and management features
  - **Enhanced mod descriptions**: Rich text support using Interweave for better mod descriptions

  ### New Logging System

  - **Dedicated logging package**: New `@deadlock-mods/logging` package for better error tracking and debugging across all applications

  ## 🎨 UI/UX Improvements

  ### Visual Updates

  - **New logo design**: Updated logo across desktop and web applications with modern design
  - **Enhanced settings layout**: Improved settings page styling and organization
  - **Launch button animation**: Added smooth animations to launch buttons
  - **Improved button styling**: Better visual feedback and animation handling throughout the app

  ### Enhanced Navigation & Performance

  - **Scroll position management**: Maintains scroll position in mod cards and mods page for better navigation
  - **Improved search sorting**: Enhanced search results relevance and sorting capabilities
  - **Better mod card functionality**: Enhanced mod card components with improved interactions

  ## 🔧 Technical Improvements

  ### API Enhancements

  - **Version handling in health checks**: Better API version management and health check responses
  - **Enhanced backend structure**: Improved API architecture to support new multi-file features

  ### Web Application Updates

  - **Fixed image sources**: Corrected image references in web HeroSection component
  - **Updated documentation**: Improved README with better development instructions and screenshots

  ## 🛠️ Development & Maintenance

  - **Package.json updates**: Refined build scripts and development workflow
  - **Documentation updates**: Updated README with new screenshots and development instructions
  - **Code quality improvements**: Various refactoring and optimization across the codebase

### Patch Changes

- Updated dependencies [7f379a5]
  - @deadlock-mods/logging@0.1.0
  - @deadlock-mods/shared@1.4.0
  - @deadlock-mods/database@1.3.1

## 0.6.0

### Minor Changes

- ba5faa1: Added support for audio mods

### Patch Changes

- Updated dependencies [ba5faa1]
  - @deadlock-mods/database@1.3.0
  - @deadlock-mods/shared@1.3.0

## 0.5.1

### Minor Changes

- **Fix:** Resolved Docker compatibility issues affecting API deployment
- **Enhancement:** Improved mod data processing and timestamp handling for accurate sorting
- **Enhancement:** Enhanced filtering and search capabilities for better mod discovery

### Patch Changes

- Updated database timestamp handling logic
- Improved API response performance
- Various bug fixes and stability improvements

## 0.5.0

### Minor Changes

- **Enhancement:** Updated API functionality to support new desktop features
- **Fix:** Improved mod handling and processing
- **Enhancement:** Better compatibility with version 0.5.0 desktop client

### Patch Changes

- Various bug fixes and performance improvements

## 0.4.0

### Minor Changes

- UI refactor + better download management

### Patch Changes

- Updated dependencies
  - @deadlock-mods/database@1.1.0
  - @deadlock-mods/shared@1.1.0

## 0.3.0

### Minor Changes

- Downgrade prisma version to fix sentry issue #4

## 0.2.0

### Minor Changes

- Remove Hono middleware

## 0.1.0

### Minor Changes

- 4a66010: Synchronize all mods from GameBanana and added instrumentation
