# desktop

## 0.8.2

### Patch Changes

- Fixed prefetch failures on Linux (thanks to Thyron on discord)

## 0.8.1

### Patch Changes

- Use HTTP plugin for all API calls

## 0.8.0

### Minor Changes

- 45d2f75: Major desktop UI features and enhancements

  - Add new bottom bar component for improved navigation
  - Implement filter mode for enhanced mod browsing experience
  - Add file drag-and-drop functionality for easier mod processing
  - Enhanced file selection dialogs and mod management UI
  - Integrate PostHog analytics for user behavior insights
  - Add Reddit and X (Twitter) links to the application
  - Implement audio volume control for mod management
  - Add ability to upload custom mods with enhanced processing
  - Persist filters and sort options through navigation for better UX
  - Add scrollbar to file selector dialog
  - Update ModStatus enum with better state management
  - Improved dialog handling for multi-file downloads

- 45d2f75: Comprehensive internationalization support

  - Add multiple new language support with locale files
  - Add confirmation messages for mod deletion and disabling across all languages
  - Support for Arabic, German, French, Polish, Russian, Turkish, and Swiss German
  - Enhanced localization infrastructure
  - Improved language file organization in /apps/desktop/src/locales/
  - Better language detection and switching capabilities

- 45d2f75: Enhanced theme support and visual improvements

  - Add comprehensive light mode support with system theme detection
  - Switch default theme to dark mode with updated logo colors
  - Recognize and respond to system default theme value
  - Add flashbang prevention option in settings for accessibility
  - Improved theme switching capabilities
  - Better visual consistency across light and dark modes

### Patch Changes

- 45d2f75: Dependencies and maintenance updates

  - Update dependencies in Cargo.lock and Cargo.toml for Rust components
  - Update dependencies and scripts across multiple packages
  - Improve code formatting and consistency across files
  - General maintenance and dependency updates for better security and performance

- 45d2f75: Desktop refactoring and performance optimizations

  - Optimize useDeepLink and useInstall hooks for better performance
  - Replace static fallback SVG with dynamic generation
  - Remove unused DownloadProgress component and update related UI elements
  - Split and reorganize all components for better maintainability
  - Refactor mod buttons and related components
  - Improve code structure and component organization
  - Enhanced component separation and modularity
  - Better state management and hook optimization

- 41ee2fc: Light theme support

## 0.7.0

### Minor Changes

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

- 4e5202f: Fix search results relevance
- Updated dependencies [7f379a5]
  - @deadlock-mods/utils@1.4.0

## 0.6.1

### Patch Changes

- 9dcc699: Support for 1-click deep links

## 0.6.0

### Minor Changes

- ba5faa1: Added support for audio mods

### Patch Changes

- 2cc1984: Removed the assumption that every launch option has a "+" prefix
- Updated dependencies [ba5faa1]
  - @deadlock-mods/utils@1.3.0

## 0.5.1

### Minor Changes

- **Enhancement:** Integrated virtualization for mods page to significantly improve performance with large mod lists
- **Fix:** Resolved "last updated" sort option not accurately reflecting actual mod update timestamps
- **Feature:** Added category and hero filters to the mods page for better mod discovery
- **Enhancement:** Added clear button (X) to search input for quick search reset
- **Enhancement:** Improved filtering and searching functionality on the mods page
- **Enhancement:** Updated UI to acknowledge GameBanana as data source

### Patch Changes

- **Fix:** Resolved Docker images compatibility issues
- **Enhancement:** Added comprehensive project guidelines and development workflows
- Enhanced mod card layout and styling for better user experience
- Various performance optimizations and stability improvements

## 0.5.0

### Minor Changes

- **Fix:** Resolved Windows crash issue caused by tauri-plugin-single-instance null pointer dereference
- **Feature:** Added "What's New" dialog to showcase new features and updates
- **Feature:** Added outdated mod warning system to alert users about outdated modifications
- **Enhancement:** Improved mod management and user experience
- **Enhancement:** Updated various UI components and layout improvements

### Patch Changes

- **Fix:** Custom Launch Options enabled/disabled status is now properly respected when launching modded games
- Updated tauri-plugin-single-instance from 2.2.0 to 2.2.2 to fix Windows stability issues
- Enhanced about dialog functionality
- Improved mod card display and functionality
- Updated utility functions for better performance
- Various bug fixes and stability improvements

## 0.4.0

### Minor Changes

- Fix mod deletion (thanks @Skeptic-systems)

## 0.3.0

### Minor Changes

- UI refactor + better download management

### Patch Changes

- Updated dependencies
  - @deadlock-mods/utils@1.1.0

## 0.2.0

### Minor Changes

- Add sentry issue tracking and fix updater permissions

## 0.1.1

### Patch Changes

- 079f045: Fixed mods unintall and added a stop game button

  - Add game stop button to toolbar
  - Fixed mod uninstallation process
  - Add support for 7zip archives
