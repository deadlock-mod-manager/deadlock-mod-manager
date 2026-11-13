# @deadlock-mods/shared

## 2.6.0

### Minor Changes

- 072b9fe: Publish stable hero and content-type IDs for mod sources at /v1/taxonomy.json
- 9fab2e1: Show YouTube and Vimeo videos from GameBanana on mod pages

### Patch Changes

- 0a05843: Let library groups turn on one random mod each launch

## 2.5.0

### Minor Changes

- 4b36850: Back up profiles to your account and restore them on another PC

### Patch Changes

- 75477e2: Find the hero and category of skins in GameBanana's new hero subcategories

## 2.4.1

### Patch Changes

- 7fbc30f: Add /perfconfig to mark GameBanana uploads as performance configs

## 2.4.0

### Minor Changes

- 4970162: Show every Deadworks server and fetch the maps and addons each one advertises

## 2.3.0

### Minor Changes

- 8547a02: Add rich GameBanana author profiles to mod browsing

### Patch Changes

- 2f18d23: Add Baba, Deadman Danny, Nurse Harrow, Rat King, Solomon and Violet to hero detection, the Skins page and the Foundry.
- 25a668d: Make the mod store, dashboard and search much faster: cards load small thumbnails, the store loads mods as you scroll, searches return in milliseconds, and browsing no longer uses up the GameBanana request limit needed for mod pages and downloads.

## 2.2.0

### Minor Changes

- 34cbd98: Add provider-identity policy rules, a versioned policy manifest, desktop enforcement, legacy-rule backfill, and Mod/Sound blacklist management.
- 55be2ff: Namespace GameBanana Sound identities across persisted desktop state, installed files, deep links, and shared profile v3 imports.
- 437e943: Detach reports, Lockdex ingestion, server requirements, website surfaces, statistics, and Discord announcements from the mirrored GameBanana catalog.

### Patch Changes

- 1f98b35: Keep pre-v2 database migrations compatible with the existing API and Lockdex.
- cbab84a: Fix direct GameBanana downloads, catalog recovery, and policy metadata.
- cbab84a: Return partial server mod requirements when provider lookups run long instead of closing the connection
- fd4234f: Show Deadworks community servers with live ping and their custom maps

## 2.1.0

### Minor Changes

- 0665051: Align server browser required mods with Deadworks Relay and show mod source links
- 2dfceee: Add server browser schemas shared between API and desktop clients.

### Patch Changes

- 9946781: Add hero detection for mods via VPK path analysis with conflict warnings when activating multiple mods for the same hero
- 2c9d7a0: Resolve GameBanana heroes from profile categories and invalidate mod caches when synced content changes.

## 2.0.0

### Major Changes

- bca8aae: Simplify reports to broken-only model, removing report types, statuses, and moderation workflow

### Minor Changes

- 2c60dab: Add "How to Play" card with instructions for custom maps
- 7074850: Add ability to disable mod report submissions for specific mods

### Patch Changes

- 795024d: Add mod metadata overrides that persist across sync runs
- 0687f21: Add GameBanana file server selection with latency testing
- 791de90: Allow overriding mod download URLs and filenames
- b573253: Add custom map support with sync, installation, and browsing

## 1.8.1

### Patch Changes

- a8a0e2c: Map GameBanana mod categories using parent category when present so skin sub-categories match the Skins filter

## 1.8.0

### Minor Changes

- 48f028f: Add 6 new heroes to shared regex search and heroes list: Apollo, Celeste, Graves, Rem, Silver, Venator
- cb40fc6: Detect when mod files change during sync, set filesUpdatedAt, dismiss unverified reports, and show "Updated recently" and "Update available" in the desktop UI

## 1.7.0

### Minor Changes

- f48352c: Add crosshair publishing feature with database schema, API endpoints, and desktop UI for creating, publishing, and applying crosshairs

## 1.6.0

### Minor Changes

- 3127b8d: Annoucements and admin dashboard

## 1.5.0

### Minor Changes

- f02f058: Add user-specific feature flag overrides with experimental features UI

## 1.4.0

### Minor Changes

- 7f379a5: New API version to support multiple download files per mod, file selection when a mod has multiple archives or VPK files, and a new logo

## 1.3.0

### Minor Changes

- ba5faa1: Added support for audio mods

## 1.2.0

### Minor Changes

- Enhanced utilities for mod virtualization and performance optimization
- Improved data processing functions for better filtering and search capabilities

### Patch Changes

- Updated dependencies to support app version 0.5.1
- Various bug fixes and performance improvements

## 1.1.0

### Minor Changes

- UI refactor + better download management
