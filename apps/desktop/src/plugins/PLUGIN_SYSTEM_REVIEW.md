# Plugin System Review and Improvement Plan

**Date**: October 15, 2025  
**Status**: Analysis Complete

## Executive Summary

This document outlines potential issues identified in the plugin system architecture and provides a prioritized roadmap for improvements. The plugin system currently supports dynamic loading of UI extensions but lacks robust error handling, dependency management, and lifecycle controls.

---

## Critical Issues

### 1. Missing Plugin Dependency Resolution

**Severity**: Critical  
**Location**: `apps/desktop/src/plugins/themes/index.tsx:231`

**Problem**:

- The themes plugin directly calls `setEnabledPlugin("background", false)` to disable the background plugin
- No formal dependency management or conflict resolution system exists
- Plugins can arbitrarily enable/disable other plugins without validation

**Impact**:

- Unexpected plugin behavior when conflicts occur
- Potential for circular dependencies
- No way to declare required or conflicting plugins

**Recommendation**:

```typescript
// Add to PluginManifest type
type PluginManifest = {
  // ... existing fields
  dependencies?: string[]; // Plugin IDs this plugin requires
  conflicts?: string[]; // Plugin IDs incompatible with this one
};
```

---

### 2. No Plugin Manifest Validation

**Severity**: Critical  
**Location**: `apps/desktop/src/lib/plugins.ts:54-56`

**Problem**:

- Only basic type checking: `if (!manifest || typeof manifest !== "object")`
- No schema validation for required fields
- Missing fields like `id`, `nameKey`, or `icon` aren't caught early

**Impact**:

- Runtime errors from malformed manifests
- Poor developer experience
- Difficult to debug missing or incorrect manifest fields

**Recommendation**:

```typescript
import { z } from "zod";

const PluginManifestSchema = z.object({
  id: z.string().min(1),
  nameKey: z.string(),
  descriptionKey: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  author: z.string(),
  homepageUrl: z.string().url().optional(),
  icon: z.string(),
  tags: z.array(z.string()).optional(),
  entry: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  conflicts: z.array(z.string()).optional(),
});

// Validate during plugin loading
export function getPlugins(): LoadedPlugin[] {
  const plugins: LoadedPlugin[] = [];

  for (const [manifestPath, manifest] of Object.entries(manifestModules)) {
    try {
      const validatedManifest = PluginManifestSchema.parse(manifest);
      // ... continue processing
    } catch (error) {
      logger.error("Invalid plugin manifest", { manifestPath, error });
      continue;
    }
  }

  return plugins;
}
```

---

### 3. Silent Plugin Load Failures

**Severity**: High  
**Location**: `apps/desktop/src/lib/plugins.ts:71-78`

**Problem**:

- When `entryImporter` is undefined, plugins are still added to the list
- Icon loading failures are silent
- Users see non-functional plugins in the UI

**Impact**:

- Confusing UX when plugins appear but don't work
- No feedback on why a plugin can't be loaded
- Difficult debugging

**Recommendation**:

```typescript
// Add loading status to LoadedPlugin type
export type LoadedPlugin = {
  manifest: PluginManifest;
  iconUrl?: string;
  basePath: string;
  entryImporter?: () => Promise<unknown>;
  loadingStatus: "valid" | "no-entry" | "no-icon" | "invalid-manifest";
  loadingErrors?: string[];
};

// In getPlugins():
const loadingErrors: string[] = [];

if (!entryImporter) {
  loadingErrors.push("Entry point not found");
}

if (manifest.icon && !iconUrl) {
  loadingErrors.push("Icon not found");
}

const plugin = {
  manifest,
  iconUrl,
  basePath,
  entryImporter,
  loadingStatus: loadingErrors.length > 0 ? "invalid" : "valid",
  loadingErrors: loadingErrors.length > 0 ? loadingErrors : undefined,
};
```

---

### 4. Weak Module Export Resolution

**Severity**: High  
**Location**: `apps/desktop/src/pages/plugin.tsx:38-57`, `apps/desktop/src/components/global-plugin-renderer.tsx:38-53`

**Problem**:

- Complex fallback logic for ESM/CommonJS resolution
- Loose type checking with multiple attempts
- Duplicated logic between components

**Impact**:

- Could accept invalid plugin structures
- Maintenance burden from code duplication
- Potential runtime errors from incorrect resolution

**Recommendation**:

```typescript
// Create shared utility in lib/plugins.ts
export async function loadPluginModule(
  entryImporter: () => Promise<unknown>
): Promise<PluginModule | null> {
  try {
    const mod: unknown = await entryImporter();

    // Try direct export first
    if (isValidPluginModule(mod)) {
      return mod as PluginModule;
    }

    // Try default export
    const record =
      typeof mod === "object" && mod
        ? (mod as Record<string, unknown>)
        : undefined;
    if (record?.default && isValidPluginModule(record.default)) {
      return record.default as PluginModule;
    }

    logger.warn("Plugin module does not export valid PluginModule");
    return null;
  } catch (error) {
    logger.error("Failed to load plugin module", { error });
    return null;
  }
}

function isValidPluginModule(candidate: unknown): boolean {
  if (!candidate || typeof candidate !== "object") return false;
  const obj = candidate as Record<string, unknown>;
  return "manifest" in obj && typeof obj.manifest === "object";
}
```

---

## High Priority Issues

### 5. No Plugin Settings Migration/Validation

**Severity**: High  
**Location**: `apps/desktop/src/lib/store/slices/ui.ts:26,99-102`

**Problem**:

- `pluginSettings` typed as `Record<string, unknown>`
- No validation or migration for settings changes
- Breaking changes between plugin versions will corrupt settings

**Impact**:

- Settings corruption when plugins update
- No way to handle deprecated settings
- Poor upgrade experience

**Recommendation**:

```typescript
// Add settings schema to plugin manifest
type PluginManifest = {
  // ... existing fields
  settingsVersion?: number;
  settingsSchema?: z.ZodSchema; // Optional Zod schema for validation
};

// In store migration, add plugin settings migration
migrate: (persistedState: unknown, version: number) => {
  const state = persistedState as State;

  // Migrate plugin settings
  if (state.pluginSettings) {
    const migratedSettings: Record<string, unknown> = {};

    for (const [pluginId, settings] of Object.entries(state.pluginSettings)) {
      try {
        const plugin = getPluginById(pluginId);
        if (plugin?.manifest.settingsSchema) {
          // Validate and migrate
          migratedSettings[pluginId] =
            plugin.manifest.settingsSchema.parse(settings);
        } else {
          // Keep as-is if no schema
          migratedSettings[pluginId] = settings;
        }
      } catch (error) {
        logger.warn("Failed to migrate plugin settings", { pluginId, error });
        // Use default settings or empty object
      }
    }

    return { ...state, pluginSettings: migratedSettings };
  }

  return state;
};
```

---

### 6. Race Conditions in Global Plugin Renderer

**Severity**: High  
**Location**: `apps/desktop/src/components/global-plugin-renderer.tsx:25-76`

**Problem**:

- Sequential plugin loading in a loop
- `cancelled` flag but no proper promise cancellation
- Rapid `enabledPluginIds` changes can trigger multiple loads

**Impact**:

- Memory leaks from uncancelled plugin loads
- Duplicate renders
- Performance degradation

**Recommendation**:

```typescript
useEffect(() => {
  const abortController = new AbortController();

  const loadEnabledPlugins = async () => {
    const newLoadedPlugins: Record<string, PluginModule> = {};

    // Load plugins in parallel with abort support
    await Promise.all(
      plugins
        .filter(
          (plugin) =>
            enabledPluginIds.includes(plugin.manifest.id) &&
            plugin.entryImporter
        )
        .map(async (plugin) => {
          if (abortController.signal.aborted) return;

          try {
            const module = await loadPluginModule(plugin.entryImporter!);

            if (!abortController.signal.aborted && module?.Render) {
              newLoadedPlugins[plugin.manifest.id] = module;
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              logger.error("Failed to load plugin", {
                pluginId: plugin.manifest.id,
                error,
              });
            }
          }
        })
    );

    if (!abortController.signal.aborted) {
      setLoadedPlugins(newLoadedPlugins);
    }
  };

  loadEnabledPlugins();

  return () => {
    abortController.abort();
  };
}, [enabledPluginIds, plugins]);
```

---

### 7. Error Boundary Lacks Plugin-Specific Context

**Severity**: Medium  
**Location**: `apps/desktop/src/components/shared/error-boundary.tsx`

**Problem**:

- Generic error messages without plugin identification
- No automatic plugin disable on repeated failures
- Can't isolate which plugin caused the error

**Impact**:

- Poor debugging experience
- Users can't identify problematic plugins
- One broken plugin can prevent others from loading

**Recommendation**:

```typescript
// Create plugin-specific error boundary
const PluginErrorBoundary = ({
  pluginId,
  children,
}: {
  pluginId: string;
  children: React.ReactNode;
}) => {
  const { t } = useTranslation();
  const setEnabledPlugin = usePersistedStore((s) => s.setEnabledPlugin);
  const [errorCount, setErrorCount] = useState(0);

  const handleError = (error: Error) => {
    logger.error("Plugin error", { pluginId, error });

    const newCount = errorCount + 1;
    setErrorCount(newCount);

    // Auto-disable after 3 errors
    if (newCount >= 3) {
      logger.warn("Auto-disabling plugin due to repeated errors", { pluginId });
      setEnabledPlugin(pluginId, false);
    }
  };

  return (
    <ReactErrorBoundary
      onError={handleError}
      fallbackRender={({ error, resetErrorBoundary }) => (
        <Alert>
          <AlertDescription>
            <p>{t("plugins.error.message", { pluginId })}</p>
            <pre>{error.message}</pre>
            <Button onClick={resetErrorBoundary}>{t("common.retry")}</Button>
            <Button onClick={() => setEnabledPlugin(pluginId, false)}>
              {t("plugins.error.disable")}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    >
      {children}
    </ReactErrorBoundary>
  );
};

// Usage in GlobalPluginRenderer
return (
  <>
    {Object.entries(loadedPlugins).map(([pluginId, pluginModule]) => {
      const RenderComponent = pluginModule.Render;
      return RenderComponent ? (
        <PluginErrorBoundary key={pluginId} pluginId={pluginId}>
          <RenderComponent />
        </PluginErrorBoundary>
      ) : null;
    })}
  </>
);
```

---

### 8. Store Persistence Issues

**Severity**: High  
**Location**: `apps/desktop/src/lib/store/slices/ui.ts:99-102`, `apps/desktop/src/lib/store/index.ts:36-82`

**Problem**:

- Plugin settings persisted as `unknown` without versioning
- Store migration doesn't handle plugin state changes
- Corrupted settings could break entire app

**Impact**:

- Data loss on plugin updates
- App crash on corrupted plugin settings
- No rollback mechanism

**Recommendation**:

- Implement plugin settings versioning (see Issue #5)
- Add try-catch around plugin settings hydration
- Provide fallback to default settings on parse errors

---

## Medium Priority Issues

### 9. Missing Plugin Lifecycle Management

**Severity**: Medium  
**Location**: All plugin implementations

**Problem**:

- No `onEnable`, `onDisable`, `onLoad`, or `onUnload` hooks
- Cleanup logic runs on every state change, not just disable
- Plugins can't properly initialize resources

**Impact**:

- Inefficient resource management
- Can't perform one-time setup/teardown
- Difficult to implement complex plugins

**Recommendation**:

```typescript
export type PluginModule = {
  manifest: PluginManifest;
  Render?: ComponentType;
  Settings?: ComponentType;

  // Lifecycle hooks
  onLoad?: () => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
  onEnable?: () => void | Promise<void>;
  onDisable?: () => void | Promise<void>;
};

// In GlobalPluginRenderer, call lifecycle hooks
useEffect(() => {
  const loadEnabledPlugins = async () => {
    // ... load plugins

    // Call onEnable for newly enabled plugins
    for (const [pluginId, module] of Object.entries(newLoadedPlugins)) {
      if (!loadedPlugins[pluginId] && module.onEnable) {
        try {
          await module.onEnable();
        } catch (error) {
          logger.error("Plugin onEnable failed", { pluginId, error });
        }
      }
    }
  };

  return () => {
    // Call onDisable for disabled plugins
    for (const [pluginId, module] of Object.entries(loadedPlugins)) {
      if (module.onDisable) {
        module.onDisable().catch((error) => {
          logger.error("Plugin onDisable failed", { pluginId, error });
        });
      }
    }
  };
}, [enabledPluginIds]);
```

---

### 10. DOM Manipulation Without Cleanup Validation

**Severity**: Medium  
**Location**: `apps/desktop/src/plugins/background/index.tsx:211-229`

**Problem**:

- Direct CSS class manipulation on `documentElement`
- If plugin crashes, classes persist
- Multiple plugins can conflict over same DOM

**Impact**:

- Visual bugs from lingering styles
- Difficult to debug DOM conflicts
- Poor isolation between plugins

**Recommendation**:

```typescript
// Create plugin DOM manager
class PluginDOMManager {
  private classes = new Map<string, Set<string>>();

  addClass(pluginId: string, className: string) {
    if (!this.classes.has(pluginId)) {
      this.classes.set(pluginId, new Set());
    }
    this.classes.get(pluginId)!.add(className);
    document.documentElement.classList.add(className);
  }

  removeClass(pluginId: string, className: string) {
    this.classes.get(pluginId)?.delete(className);
    document.documentElement.classList.remove(className);
  }

  cleanupPlugin(pluginId: string) {
    const pluginClasses = this.classes.get(pluginId);
    if (pluginClasses) {
      for (const className of pluginClasses) {
        document.documentElement.classList.remove(className);
      }
      this.classes.delete(pluginId);
    }
  }
}

export const pluginDOMManager = new PluginDOMManager();

// In plugin cleanup
useEffect(() => {
  // ... setup
  return () => {
    pluginDOMManager.cleanupPlugin(manifest.id);
  };
}, []);
```

---

### 11. File Reader Memory Leak Potential

**Severity**: Medium  
**Location**: `apps/desktop/src/plugins/background/index.tsx:146-160`

**Problem**:

- No error handling on `FileReader`
- No file size limits
- Large images can cause memory issues

**Impact**:

- App crash on huge files
- Poor UX with no progress indication
- Memory exhaustion

**Recommendation**:

```typescript
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

onChange={(e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate file size
  if (file.size > MAX_IMAGE_SIZE) {
    logger.warn('Image file too large', { size: file.size });
    // Show toast notification
    return;
  }

  // Validate file type
  if (!file.type.startsWith('image/')) {
    logger.warn('Invalid file type', { type: file.type });
    return;
  }

  const reader = new FileReader();

  reader.onerror = () => {
    logger.error('Failed to read image file');
  };

  reader.onload = () => {
    const dataUrl = reader.result as string;
    setSettings(manifest.id, {
      ...current,
      sourceType: 'local',
      imageData: dataUrl,
      imageUrl: '',
    });
  };

  reader.readAsDataURL(file);
}}
```

---

### 12. No Plugin Loading Order Control

**Severity**: Medium  
**Location**: `apps/desktop/src/lib/plugins.ts:84-89`

**Problem**:

- Plugins sorted only by tags and ID
- No dependency-based ordering
- Dependent plugins might load before dependencies

**Impact**:

- Plugin initialization failures
- Race conditions between plugins
- Difficult to build complex plugin ecosystems

**Recommendation**:

```typescript
// Topological sort based on dependencies
function sortPluginsByDependencies(plugins: LoadedPlugin[]): LoadedPlugin[] {
  const graph = new Map<string, string[]>();
  const pluginMap = new Map<string, LoadedPlugin>();

  // Build dependency graph
  for (const plugin of plugins) {
    pluginMap.set(plugin.manifest.id, plugin);
    graph.set(plugin.manifest.id, plugin.manifest.dependencies || []);
  }

  // Topological sort
  const sorted: LoadedPlugin[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(pluginId: string) {
    if (visited.has(pluginId)) return;
    if (visiting.has(pluginId)) {
      throw new Error(`Circular dependency detected: ${pluginId}`);
    }

    visiting.add(pluginId);

    const dependencies = graph.get(pluginId) || [];
    for (const depId of dependencies) {
      if (!pluginMap.has(depId)) {
        logger.warn("Missing plugin dependency", { pluginId, depId });
        continue;
      }
      visit(depId);
    }

    visiting.delete(pluginId);
    visited.add(pluginId);

    const plugin = pluginMap.get(pluginId);
    if (plugin) sorted.push(plugin);
  }

  for (const pluginId of pluginMap.keys()) {
    visit(pluginId);
  }

  return sorted;
}
```

---

### 13. Discord RPC Reconnection Loop Risk

**Severity**: Low  
**Location**: `apps/desktop/src/plugins/discord/index.tsx:178-206`

**Problem**:

- Retry logic without exponential backoff
- No max lifetime retry limit
- Continuous reconnection attempts if Discord closed

**Impact**:

- CPU/battery drain
- Excessive logging
- Poor resource management

**Recommendation**:

```typescript
const MAX_RETRY_LIFETIME = 5 * 60 * 1000; // 5 minutes
const retryStartTime = useRef<number | null>(null);

const attemptConnection = async (retries = 3, backoff = 2000) => {
  if (cancelledRef.current) return;

  // Check if retry lifetime exceeded
  if (retryStartTime.current) {
    const elapsed = Date.now() - retryStartTime.current;
    if (elapsed > MAX_RETRY_LIFETIME) {
      logger.warn("Discord connection retry lifetime exceeded");
      return;
    }
  } else {
    retryStartTime.current = Date.now();
  }

  try {
    await invoke("set_discord_presence", { applicationId, activity });
    logger.info("Discord Rich Presence connected successfully");
    retryStartTime.current = null; // Reset on success
  } catch (error) {
    if (retries > 0) {
      logger.warn(
        `Failed to set Discord presence, retrying in ${backoff}ms...`
      );
      if (cancelledRef.current) return;

      const retryId = window.setTimeout(() => {
        if (cancelledRef.current) return;
        attemptConnection(retries - 1, backoff * 2); // Exponential backoff
      }, backoff);

      timeoutsRef.current.push(retryId);
    } else {
      logger.warn("Failed to set Discord presence after all attempts");
      retryStartTime.current = null;
    }
  }
};
```

---

### 14. Vite Glob Pattern Issues

**Severity**: Low  
**Location**: `apps/desktop/src/lib/plugins.ts:8`

**Problem**:

- `@/plugins/*/**` eagerly loads ALL files
- Binary files, large assets unnecessarily bundled
- Increases app size and load time

**Impact**:

- Larger bundle size
- Slower initial load
- Wasted resources

**Recommendation**:

```typescript
// Be more specific with glob patterns
const iconModules = import.meta.glob(
  [
    "@/plugins/*/public/**/*.svg",
    "@/plugins/*/public/**/*.png",
    "@/plugins/*/public/**/*.jpg",
    "@/plugins/*/public/**/*.webp",
  ],
  {
    eager: true,
  }
) as Record<string, { default?: string } | string>;

// Or use dynamic imports for large assets
const iconModules = import.meta.glob(
  "@/plugins/*/public/*.{svg,png,jpg,webp}",
  {
    eager: false,
  }
);
```

---

### 15. Missing Plugin Uninstall/Removal Flow

**Severity**: Low  
**Location**: N/A - feature doesn't exist

**Problem**:

- No UI or API to remove plugins
- Users must manually delete files
- No cleanup of plugin settings/data

**Impact**:

- Poor UX
- Orphaned settings data
- Manual file management required

**Recommendation**:

```typescript
// Add plugin management commands
export async function uninstallPlugin(pluginId: string): Promise<void> {
  // 1. Disable plugin
  const setEnabledPlugin = usePersistedStore.getState().setEnabledPlugin;
  setEnabledPlugin(pluginId, false);

  // 2. Clean up settings
  const setPluginSettings = usePersistedStore.getState().setPluginSettings;
  setPluginSettings(pluginId, undefined);

  // 3. Remove plugin files (requires Tauri command)
  await invoke("remove_plugin_directory", { pluginId });

  // 4. Reload plugin list
  location.reload(); // Or trigger re-scan
}

// Add to plugin page UI
<Button
  variant="destructive"
  onClick={() => uninstallPlugin(plugin.manifest.id)}
>
  {t("plugins.uninstall")}
</Button>;
```

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1-2)

1. Add Zod validation for plugin manifests
2. Implement plugin dependency/conflict system
3. Fix silent plugin load failures with proper error reporting
4. Refactor module resolution into shared utility

**Deliverables**:

- Type-safe plugin manifest validation
- Plugin dependency declarations working
- Clear error messages for plugin load failures

### Phase 2: Stability Improvements (Week 3-4)

1. Add plugin settings validation and migration
2. Fix race conditions in GlobalPluginRenderer
3. Implement plugin-specific error boundaries
4. Add store persistence safeguards

**Deliverables**:

- No more race conditions in plugin loading
- Auto-disable for problematic plugins
- Settings persist correctly across versions

### Phase 3: Developer Experience (Week 5-6)

1. Implement plugin lifecycle hooks
2. Create plugin DOM manager
3. Add file size validation
4. Implement dependency-based loading order

**Deliverables**:

- Plugin SDK with lifecycle hooks
- Better resource management
- Predictable plugin initialization order

### Phase 4: Polish and Features (Week 7-8)

1. Fix Discord RPC exponential backoff
2. Optimize Vite glob patterns
3. Implement plugin uninstall flow
4. Add plugin marketplace foundation

**Deliverables**:

- Better performance and bundle size
- Plugin management UI
- Foundation for future plugin ecosystem

---

## Testing Requirements

### Unit Tests Needed

- Plugin manifest validation
- Dependency resolution algorithm
- Module loading and resolution
- Settings migration logic
- DOM manager class

### Integration Tests Needed

- Plugin enable/disable flow
- Plugin conflict detection
- Settings persistence and recovery
- Error boundary behavior

### Manual Testing Scenarios

1. Enable multiple plugins simultaneously
2. Rapidly toggle plugins on/off
3. Load plugin with missing dependencies
4. Load plugin with invalid manifest
5. Corrupt plugin settings and verify recovery
6. Test each plugin in isolation
7. Test all plugins together for conflicts

---

## Monitoring and Metrics

### Key Metrics to Track

- Plugin load success/failure rate
- Average plugin initialization time
- Plugin error frequency
- Settings migration success rate
- Memory usage per plugin

### Logging Requirements

- All plugin lifecycle events
- Dependency resolution results
- Plugin errors with full context
- Settings validation failures
- Performance metrics

---

## Security Considerations

### Current Risks

1. Plugins can access full Zustand store
2. No sandboxing or permission system
3. Plugins can manipulate any DOM elements
4. No code signing or verification

### Future Security Enhancements

1. Implement plugin permissions system
2. Add plugin API surface area restrictions
3. Consider iframe-based sandboxing for third-party plugins
4. Add code signing for official plugins
5. Implement CSP restrictions for plugin content

---

## Documentation Needs

1. Plugin development guide
2. Plugin manifest specification
3. Plugin API reference
4. Plugin lifecycle documentation
5. Plugin settings schema guide
6. Plugin testing guide
7. Plugin publishing guide

---

## Open Questions

1. Should we support hot-reloading of plugins during development?
2. How should we handle plugin updates (auto-update vs manual)?
3. What permissions system makes sense for this use case?
4. Should plugins be allowed to register custom Tauri commands?
5. How to handle plugins that depend on specific app versions?
6. Should we support plugin A/B testing or feature flags?

---

## References

- Plugin system source: `apps/desktop/src/lib/plugins.ts`
- Plugin types: `apps/desktop/src/types/plugins.ts`
- Global renderer: `apps/desktop/src/components/global-plugin-renderer.tsx`
- Example plugins: `apps/desktop/src/plugins/*/`
- Store implementation: `apps/desktop/src/lib/store/`

---

**Last Updated**: October 15, 2025  
**Next Review**: After Phase 1 completion
