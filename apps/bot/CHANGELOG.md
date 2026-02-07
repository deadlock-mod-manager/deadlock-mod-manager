# @deadlock-mods/bot

## 1.2.4

### Patch Changes

- Updated dependencies [48f028f]
- Updated dependencies [cb40fc6]
  - @deadlock-mods/shared@1.8.0
  - @deadlock-mods/database@1.8.0
  - @deadlock-mods/feature-flags@0.2.4
  - @deadlock-mods/instrumentation@0.1.6

## 1.2.3

### Patch Changes

- 3414ada: Add Redis caching for mod listings and stats to reduce database egress bandwidth
- Updated dependencies [07b9688]
- Updated dependencies [3414ada]
- Updated dependencies [9c0bbf1]
- Updated dependencies [729e39c]
  - @deadlock-mods/database@1.7.1
  - @deadlock-mods/common@1.2.0
  - @deadlock-mods/feature-flags@0.2.3
  - @deadlock-mods/instrumentation@0.1.5
  - @deadlock-mods/shared@1.7.0

## 1.2.2

### Patch Changes

- Updated dependencies [f48352c]
  - @deadlock-mods/database@1.7.0
  - @deadlock-mods/shared@1.7.0
  - @deadlock-mods/feature-flags@0.2.2
  - @deadlock-mods/instrumentation@0.1.4

## 1.2.1

### Patch Changes

- Updated dependencies [3127b8d]
  - @deadlock-mods/database@1.6.0
  - @deadlock-mods/shared@1.6.0
  - @deadlock-mods/feature-flags@0.2.1
  - @deadlock-mods/instrumentation@0.1.3

## 1.2.0

### Minor Changes

- 1e128a5: Add health checks and improve bot reliability
- 0a2b9f4: Add message triage system to automatically detect and redirect bug reports and help requests to appropriate channels
- 0a2b9f4: Add bot command to manage message triage patterns
- 51c1afb: Add mod blacklist system with Discord admin commands
- 0a2b9f4: Add automatic support bot replies to bug report forum channel posts and replies
- 0a2b9f4: Add prompt syncing to Langfuse on bot startup

### Patch Changes

- 0a2b9f4: Fix bot crashes by adding global error handlers and improving error boundaries
- aff54c9: Fix bot pod crashes and health check timeouts in Kubernetes deployment
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
  - @deadlock-mods/instrumentation@0.1.2

## 1.1.0

### Minor Changes

- Reporting system

### Patch Changes

- Updated dependencies
  - @deadlock-mods/database@1.4.0
  - @deadlock-mods/instrumentation@0.1.1
  - @deadlock-mods/shared@1.4.0
