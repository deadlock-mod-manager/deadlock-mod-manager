import { useEffect, useMemo, useState } from "react";
import { useFeatureFlags } from "@/hooks/use-feature-flags";
import logger from "@/lib/logger";
import { getPlugins } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";
import type { LoadedPlugin } from "@/types/plugins";

const isPluginModule = (obj: unknown): obj is PluginModule =>
  typeof obj === "object" && obj !== null && "manifest" in obj;

const resolvePluginModule = (mod: unknown): PluginModule | undefined => {
  if (typeof mod !== "object" || !mod) return undefined;

  const record = mod as Record<string, unknown>;
  const maybeDefault = record.default;
  const candidate =
    maybeDefault && typeof maybeDefault === "object" ? maybeDefault : mod;

  return isPluginModule(candidate) ? candidate : undefined;
};

const loadPlugin = async (
  plugin: LoadedPlugin,
): Promise<PluginModule | undefined> => {
  if (!plugin.entryImporter) return undefined;
  const mod: unknown = await plugin.entryImporter();
  return resolvePluginModule(mod);
};

const GlobalPluginRenderer = () => {
  const [loadedPlugins, setLoadedPlugins] = useState<
    Record<string, PluginModule>
  >({});
  const enabledPlugins = usePersistedStore((s) => s.enabledPlugins);
  const { data: featureFlags } = useFeatureFlags();

  // Memoize plugins to prevent infinite re-renders
  const plugins = useMemo(() => getPlugins(), []);

  // Create a map of feature flags for quick lookup
  const featureFlagMap = useMemo(() => {
    const flagMap = new Map<string, boolean>();
    if (featureFlags && Array.isArray(featureFlags)) {
      for (const flag of featureFlags) {
        flagMap.set(flag.name, flag.value as boolean);
      }
    }
    return flagMap;
  }, [featureFlags]);

  // Check if a plugin is enabled considering both local and feature flag configuration
  const isPluginEnabled = useMemo(() => {
    return (pluginId: string) => {
      // Check feature flag first (defaults to true if no flag exists)
      const flagName = `plugin-${pluginId}`;
      const flagEnabled = featureFlagMap.get(flagName) ?? true;
      if (!flagEnabled) {
        return false;
      }

      // Then check local configuration
      return enabledPlugins[pluginId] ?? false;
    };
  }, [enabledPlugins, featureFlagMap]);

  useEffect(() => {
    let cancelled = false;
    const loadEnabledPlugins = async () => {
      const newLoadedPlugins: Record<string, PluginModule> = {};

      for (const plugin of plugins) {
        if (!isPluginEnabled(plugin.manifest.id)) continue;

        try {
          const resolved = await loadPlugin(plugin);

          if (!cancelled && resolved?.Render) {
            newLoadedPlugins[plugin.manifest.id] = resolved;
          }
        } catch (error) {
          logger
            .withMetadata({ pluginId: plugin.manifest.id })
            .withError(error)
            .error("Failed to load plugin for global rendering");
        }
      }

      if (!cancelled) {
        setLoadedPlugins(newLoadedPlugins);
      }
    };

    loadEnabledPlugins();
    return () => {
      cancelled = true;
    };
  }, [plugins, isPluginEnabled]);

  return (
    <>
      {Object.entries(loadedPlugins).map(([pluginId, pluginModule]) => {
        const RenderComponent = pluginModule.Render;
        return RenderComponent ? <RenderComponent key={pluginId} /> : null;
      })}
    </>
  );
};

export default GlobalPluginRenderer;
