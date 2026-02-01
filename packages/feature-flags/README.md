# @deadlock-mods/feature-flags

A comprehensive feature flags management system with user segmentation support, priority-based overrides, and automatic caching.

## Features

- **Feature Flag Management**: Create, update, and delete feature flags with boolean values
- **User Segmentation**: Organize users into segments with priority-based override capabilities
- **Segment Overrides**: Override feature flag values for specific user segments
- **Priority System**: When a user belongs to multiple segments, the segment with the lowest rank (highest priority) wins
- **Caching**: Automatic caching of feature flag evaluations for improved performance (15-minute TTL)
- **Error Handling**: Robust error handling with structured error types using neverthrow
- **Database Integration**: Built on Drizzle ORM with PostgreSQL support
- **Bootstrap System**: Automatic feature flag registration on application startup
- **Type Safety**: Full TypeScript support throughout

## Installation

This package is part of the `@deadlock-mods` monorepo and uses workspace dependencies.

```bash
pnpm add @deadlock-mods/feature-flags --filter your-app
```

## Database Schema

The feature flags system uses four tables:

1. **feature_flags** - Stores feature flag definitions
2. **segments** - User segments with priority ranking
3. **segment_members** - Many-to-many relationship between users and segments
4. **segment_feature_flags** - Segment-specific feature flag overrides

## Basic Usage

### Initialization

```typescript
import {
  createRedisCache,
  FEATURE_FLAG_CACHE_TTL,
} from "@deadlock-mods/common";
import { db } from "@deadlock-mods/database";
import {
  FeatureFlagRepository,
  FeatureFlagService,
  SegmentRepository,
  SegmentService,
  FeatureFlagRegistry,
} from "@deadlock-mods/feature-flags";
import { createAppLogger } from "@deadlock-mods/logging";

const logger = createAppLogger({ app: "your-app" });

// Initialize repositories
const featureFlagRepository = new FeatureFlagRepository(db, logger);
const segmentRepository = new SegmentRepository(db, logger);

// Initialize cache (Redis-backed)
const cache = createRedisCache(process.env.REDIS_URL, {
  ttl: FEATURE_FLAG_CACHE_TTL,
});

// Initialize services
const segmentService = new SegmentService(segmentRepository, logger);
const featureFlagService = new FeatureFlagService(
  logger,
  featureFlagRepository,
  cache,
  segmentService, // optional - only needed for segment-based overrides
);

// Initialize registry
const registry = new FeatureFlagRegistry(featureFlagService, logger);
```

### Creating Feature Flags

```typescript
// Create a feature flag
const result = await featureFlagService.createFeatureFlag({
  name: "new-dashboard",
  description: "Enable the new dashboard interface",
  value: false,
});

if (result.isOk()) {
  console.log("Feature flag created:", result.value);
}
```

### Checking Feature Flags

```typescript
// Check if a feature flag is enabled (basic)
const isEnabled = await featureFlagService.isFeatureFlagEnabled(
  "feature-flag-id",
  { shouldThrow: false },
);

// Check with user context for segment overrides
const isEnabledForUser = await featureFlagService.isFeatureFlagEnabled(
  "feature-flag-id",
  {
    shouldThrow: false,
    userId: "user-123",
  },
);
```

### Finding Feature Flags

```typescript
// Find by ID
const flagById = await featureFlagRepository.findById("feature-flag-id");

// Find by name
const flagByName = await featureFlagService.findByName("new-dashboard");

// Check if exists
const exists = await featureFlagService.exists("new-dashboard");

// Get all feature flags
const allFlags = await featureFlagService.getAllFeatureFlags();
```

## User Segmentation

### Creating Segments

```typescript
// Create a segment with priority
const betaSegment = await segmentService.createSegment({
  name: "beta-users",
  description: "Beta testing users",
  rank: 1, // Lower rank = higher priority
});

const premiumSegment = await segmentService.createSegment({
  name: "premium-users",
  description: "Premium subscribers",
  rank: 2, // Lower priority than beta users
});
```

### Managing Segment Membership

```typescript
// Add user to segment
await segmentService.addUserToSegment("segment-id", "user-id");

// Remove user from segment
await segmentService.removeUserFromSegment("segment-id", "user-id");

// Get all segments for a user
const segments = await segmentService.getUserSegments("user-id");
```

### Segment Overrides

```typescript
// Create or update segment override
await segmentService.createSegmentFeatureFlagOverride(
  "segment-id",
  "feature-flag-id",
  true, // Enable for this segment
);

// Get specific override
const override = await segmentService.getSegmentOverride(
  "segment-id",
  "feature-flag-id",
);
```

### Priority-Based Evaluation

When a user belongs to multiple segments with different overrides, the segment with the **lowest rank number** (highest priority) wins.

```typescript
// User belongs to both segments:
// - beta-users (rank: 1) with override = true
// - premium-users (rank: 2) with override = false

// Result will be TRUE because beta-users has higher priority
const isEnabled = await featureFlagService.isFeatureFlagEnabled(
  "feature-flag-id",
  { userId: "user-id" },
);
```

## Bootstrap System

The bootstrap system allows you to register feature flags on application startup, ensuring they exist in the database with proper defaults.

### Basic Bootstrap

```typescript
// Register multiple feature flags on startup
const definitions = [
  {
    name: "new-ui",
    description: "Enable new user interface",
    defaultValue: false,
  },
  {
    name: "beta-features",
    description: "Enable beta features",
    defaultValue: false,
  },
  {
    name: "advanced-search",
    description: "Enable advanced search functionality",
    defaultValue: true,
  },
];

const successCount = await registry.bootstrap(definitions);
console.log(`Registered ${successCount} feature flags`);
```

### Application Startup Integration

```typescript
// In your application startup file
async function initializeApp() {
  // ... other initialization

  // Bootstrap feature flags
  await featureFlagsService.bootstrap([
    { name: "new-dashboard", defaultValue: false },
    { name: "analytics", defaultValue: true },
    { name: "notifications", defaultValue: true },
  ]);

  // ... continue with app initialization
}
```

## API Service Singleton (for API app)

The API application includes a convenient singleton wrapper:

```typescript
import { featureFlagsService } from "./services/feature-flags";

// Check feature flag (basic)
const isEnabled = await featureFlagsService.isFeatureEnabled("new-dashboard");

// Check with user context
const isEnabledForUser = await featureFlagsService.isFeatureEnabled(
  "new-dashboard",
  "user-id",
);

// Bootstrap on startup
await featureFlagsService.bootstrap([
  { name: "feature-1", defaultValue: false },
  { name: "feature-2", defaultValue: true },
]);

// Segment operations
await featureFlagsService.addUserToSegment("segment-id", "user-id");
await featureFlagsService.setSegmentOverride("segment-id", "flag-id", true);
```

## Caching

Feature flag evaluations are automatically cached for 15 minutes to improve performance:

- Cache keys include both feature flag ID and user ID (if provided)
- User-specific evaluations are cached separately from global evaluations
- Cache invalidation: Wait up to 15 minutes or restart the service

```typescript
// First call - queries database
await featureFlagService.isFeatureFlagEnabled("flag-id", { userId: "user-1" });

// Second call - returns cached result (fast)
await featureFlagService.isFeatureFlagEnabled("flag-id", { userId: "user-1" });

// Different user - separate cache entry
await featureFlagService.isFeatureFlagEnabled("flag-id", { userId: "user-2" });
```

## Error Handling

All operations use the neverthrow Result pattern for type-safe error handling:

```typescript
import { ok, err } from "neverthrow";

const result = await featureFlagService.findByName("my-feature");

if (result.isOk()) {
  console.log("Feature flag:", result.value);
} else {
  console.error("Error:", result.error);
}

// With shouldThrow option
try {
  const isEnabled = await featureFlagService.isFeatureFlagEnabled("flag-id", {
    shouldThrow: true,
  });
} catch (error) {
  console.error("Feature flag check failed:", error);
}
```

## Best Practices

### 1. Use Descriptive Names

Choose clear, meaningful names for feature flags:

```typescript
// Good
{ name: "new-dashboard", defaultValue: false }
{ name: "advanced-user-search", defaultValue: false }
{ name: "email-notifications", defaultValue: true }

// Bad
{ name: "feature1", defaultValue: false }
{ name: "test", defaultValue: true }
```

### 2. Document Feature Flags

Always include descriptions:

```typescript
{
  name: "new-checkout-flow",
  description: "Enable the redesigned checkout process with improved UX",
  defaultValue: false
}
```

### 3. Use Segments for Gradual Rollouts

Create segments for controlled feature rollouts:

```typescript
// Create segments with different priorities
await segmentService.createSegment({
  name: "internal-team",
  description: "Internal team members",
  rank: 1, // Highest priority
});

await segmentService.createSegment({
  name: "beta-testers",
  description: "External beta testers",
  rank: 2,
});

await segmentService.createSegment({
  name: "early-adopters",
  description: "Users who opt into early features",
  rank: 3,
});
```

### 4. Bootstrap on Startup

Always register expected feature flags on application startup:

```typescript
// In your app initialization
await registry.bootstrap([
  { name: "feature-a", defaultValue: false },
  { name: "feature-b", defaultValue: false },
  { name: "feature-c", defaultValue: true },
]);
```

### 5. Handle Errors Gracefully

Use `shouldThrow: false` in user-facing code:

```typescript
// Safe for user-facing features
const isEnabled = await featureFlagService.isFeatureFlagEnabled(
  "feature-id",
  { shouldThrow: false }, // Returns false if error occurs
);

// Use shouldThrow: true for admin operations
const result = await featureFlagService.isFeatureFlagEnabled(
  "feature-id",
  { shouldThrow: true }, // Throws error for debugging
);
```

### 6. Consider Cache TTL

Remember that feature flag changes may take up to 15 minutes to propagate due to caching. For immediate updates, restart the service.

### 7. Clean Up Old Flags

Regularly review and remove feature flags that are no longer needed:

```typescript
// When a feature is fully rolled out
await featureFlagService.deleteFeatureFlag("old-feature-id");
```

## Architecture

The system follows a layered architecture:

```
┌─────────────────────────────────────┐
│   API Service Singleton             │
│   (Convenience wrapper)             │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Service Layer                     │
│   - FeatureFlagService              │
│   - SegmentService                  │
│   - FeatureFlagRegistry             │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Repository Layer                  │
│   - FeatureFlagRepository           │
│   - SegmentRepository               │
└────────────┬────────────────────────┘
             │
┌────────────▼────────────────────────┐
│   Database Layer                    │
│   - Drizzle ORM                     │
│   - PostgreSQL                      │
└─────────────────────────────────────┘
```

## TypeScript Support

Full type safety with exported types:

```typescript
import type {
  FeatureFlag,
  NewFeatureFlag,
  Segment,
  NewSegment,
  SegmentMember,
  SegmentFeatureFlag,
  FeatureFlagDefinition,
  FeatureFlagReasonTypes,
} from "@deadlock-mods/feature-flags";
```

## License

Part of the Deadlock Mod Manager project.
