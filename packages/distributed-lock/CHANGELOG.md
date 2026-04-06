# @deadlock-mods/distributed-lock

## 1.0.8

### Patch Changes

- Updated dependencies [795024d]
- Updated dependencies [2c60dab]
- Updated dependencies [7bb1d98]
- Updated dependencies [791de90]
- Updated dependencies [7bb1d98]
- Updated dependencies [bca8aae]
- Updated dependencies [88b55b8]
- Updated dependencies [b573253]
  - @deadlock-mods/database@2.0.0
  - @deadlock-mods/logging@0.2.0

## 1.0.7

### Patch Changes

- 3da6533: Fix distributed locks expiring despite active heartbeats; extend expiresAt correctly
- Updated dependencies [c61de94]
- Updated dependencies [3da6533]
- Updated dependencies [3da6533]
  - @deadlock-mods/database@1.8.1

## 1.0.6

### Patch Changes

- Updated dependencies [cb40fc6]
  - @deadlock-mods/database@1.8.0

## 1.0.5

### Patch Changes

- Updated dependencies [07b9688]
- Updated dependencies [9c0bbf1]
- Updated dependencies [729e39c]
  - @deadlock-mods/database@1.7.1

## 1.0.4

### Patch Changes

- Updated dependencies [f48352c]
  - @deadlock-mods/database@1.7.0

## 1.0.3

### Patch Changes

- Updated dependencies [3127b8d]
  - @deadlock-mods/database@1.6.0

## 1.0.2

### Patch Changes

- Updated dependencies [f02f058]
- Updated dependencies [921a7a8]
- Updated dependencies [921a7a8]
- Updated dependencies [921a7a8]
- Updated dependencies [0a2b9f4]
- Updated dependencies [23e1528]
- Updated dependencies [51c1afb]
  - @deadlock-mods/database@1.5.0

## 1.0.1

### Patch Changes

- Updated dependencies
  - @deadlock-mods/database@1.4.0

## 1.0.0

### Added

- Initial release of distributed lock service
- Support for acquiring and releasing distributed locks with automatic heartbeats
- Configurable timeouts and heartbeat intervals
- Automatic cleanup of expired locks
- Lock status querying and information retrieval
- Proper cleanup of resources on service shutdown
