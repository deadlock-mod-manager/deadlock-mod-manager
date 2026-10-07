# web

## 0.6.0

### Minor Changes

- bbb30d2: Add a Randomizer that rolls a hero, a buyable build and bravery rules
- b32e06f: Announce V2 with a site-wide banner and hero badge linking to the preview build, and include the latest release version in the home and download page descriptions and the SoftwareApplication structured data
- 62cdd3d: Add a "What's new in V2" page and a changelog built from the desktop app's release notes, and point the V2 banner at it
- cf5b35b: Redesign the landing page around a live, clickable copy of the app, fix the hydration crash and SSR data loading that made the site slow and broke Google's preview, and give every page proper SEO metadata, a sitemap and structured data

### Patch Changes

- 2e252ca: Fix primary Linux downloads to prefer Wry and label CEF as experimental
- Updated dependencies [8547a02]
- Updated dependencies [2f18d23]
- Updated dependencies [25a668d]
- Updated dependencies [2cc198e]
  - @deadlock-mods/shared@2.3.0
  - @deadlock-mods/crosshair@0.2.6

## 0.5.0

### Minor Changes

- 437e943: Detach reports, Lockdex ingestion, server requirements, website surfaces, statistics, and Discord announcements from the mirrored GameBanana catalog.

### Patch Changes

- fc07a56: Download and check GameBanana mods directly with verified, locally cached metadata.
- e9ef733: Add DeadlockSkins.gg to the website footer partners list
- Updated dependencies [1f98b35]
- Updated dependencies [cbab84a]
- Updated dependencies [34cbd98]
- Updated dependencies [55be2ff]
- Updated dependencies [437e943]
- Updated dependencies [cbab84a]
- Updated dependencies [fd4234f]
  - @deadlock-mods/shared@2.2.0
  - @deadlock-mods/crosshair@0.2.5

## 0.4.2

### Patch Changes

- Updated dependencies [9946781]
- Updated dependencies [700bfe8]
- Updated dependencies [2c9d7a0]
- Updated dependencies [0665051]
- Updated dependencies [2dfceee]
  - @deadlock-mods/shared@2.1.0
  - @deadlock-mods/common@1.3.0
  - @deadlock-mods/crosshair@0.2.4

## 0.4.1

### Patch Changes

- 83915cf: Better image display in mod gallery and mod detail page.
- Updated dependencies [795024d]
- Updated dependencies [0687f21]
- Updated dependencies [2c60dab]
- Updated dependencies [7bb1d98]
- Updated dependencies [82ec280]
- Updated dependencies [791de90]
- Updated dependencies [7bb1d98]
- Updated dependencies [7074850]
- Updated dependencies [bca8aae]
- Updated dependencies [88b55b8]
- Updated dependencies [b573253]
  - @deadlock-mods/shared@2.0.0
  - @deadlock-mods/logging@0.2.0
  - @deadlock-mods/ui@0.3.1
  - @deadlock-mods/crosshair@0.2.3

## 0.4.0

### Minor Changes

- 76f0355: Add GameBanana sound categories as category filters with clearer labels (Ability Sounds, Weapon Sounds, Voice Lines, Kill Sounds, Music)

### Patch Changes

- Updated dependencies [a8a0e2c]
  - @deadlock-mods/shared@1.8.1
  - @deadlock-mods/crosshair@0.2.2

## 0.3.1

### Patch Changes

- 3da6533: Fix race where concurrent token refresh could unexpectedly log users out
- e7342a2: Throttle React Query usage: shared constants, remove unused OTA hook, and sensible defaults to avoid rate-limiting and excessive refetches
- Updated dependencies [87fa249]
  - @deadlock-mods/common@1.2.1
  - @deadlock-mods/shared@1.8.0

## 0.3.0

### Minor Changes

- 6f1a1bb: Add transparency page with financial information and platform statistics

## 0.2.0

### Minor Changes

- 48f028f: Add MSI installer downloads to the download page alongside EXE files

### Patch Changes

- Updated dependencies [48f028f]
- Updated dependencies [cb40fc6]
  - @deadlock-mods/shared@1.8.0
  - @deadlock-mods/crosshair@0.2.1

## 0.1.0

### Minor Changes

- 0892387: Remove old KV-parser (TS package) and replace with KV-parser-rs

### Patch Changes

- Updated dependencies [3414ada]
  - @deadlock-mods/common@1.2.0
  - @deadlock-mods/shared@1.7.0

## 0.1.0

### Minor Changes

- 45d2f75: Web application improvements and migration
  - Migrate Next.js app to Vite for better performance and development experience
  - Initialize new website app with modern tooling
  - Redesign favicon.svg with updated graphics and improved dimensions
  - Better build system and development workflow
  - Enhanced web application architecture
