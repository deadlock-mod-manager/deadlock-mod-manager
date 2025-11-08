# @deadlock-mods/database

## 1.5.0

### Minor Changes

- f02f058: Add user-specific feature flag overrides with experimental features UI
- 921a7a8: Add background workers for mirror service validation and cleanup

  - Validation worker runs every hour (configurable) to check for stale files by comparing mirroredFiles with modDownloads
  - Cleanup worker runs daily to remove unused files older than 14 days (configurable)
  - Added Redis configuration and cron job scheduling using @deadlock-mods/queue
  - Enhanced MirroredFileRepository with new query methods for validation and cleanup
  - Added lastValidated and isStale fields to mirroredFiles schema
  - Implemented graceful shutdown handling for background workers

- 0a2b9f4: Add message triage system to automatically detect and redirect bug reports and help requests to appropriate channels
- 23e1528: Add user segmentation and priority-based overrides to feature flags system with automatic registration helper
- 51c1afb: Add mod blacklist system with Discord admin commands

### Patch Changes

- 921a7a8: Add metrics endpoint to mirror service with cache hit rate, storage usage, download counts, and bandwidth savings tracking
- 921a7a8: Rename gameBananaLastChecked to lastValidated for clarity

## 1.4.0

### Minor Changes

- Reporting system

## 1.3.1

### Patch Changes

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

## 1.3.0

### Minor Changes

- ba5faa1: Added support for audio mods

## 1.2.0

### Minor Changes

- Enhanced timestamp handling and sorting logic for accurate mod update tracking
- Improved database queries for better performance with large datasets

### Patch Changes

- Updated dependencies to support app version 0.5.1
- Various performance optimizations

## 1.1.0

### Minor Changes

- UI refactor + better download management
