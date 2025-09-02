# desktop

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
