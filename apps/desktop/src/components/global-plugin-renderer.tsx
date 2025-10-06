import { useEffect, useMemo, useState } from "react";
import logger from "@/lib/logger";
import { getPlugins } from "@/lib/plugins";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";

const GlobalPluginRenderer = () => {
  const [loadedPlugins, setLoadedPlugins] = useState<
    Record<string, PluginModule>
  >({});
  const enabledPlugins = usePersistedStore((s) => s.enabledPlugins);

  // Memoize plugins to prevent infinite re-renders
  const plugins = useMemo(() => getPlugins(), []);

  // Create a stable reference for enabled plugin IDs
  const enabledPluginIds = useMemo(
    () => Object.keys(enabledPlugins),
    [enabledPlugins],
  );

  useEffect(() => {
    const loadEnabledPlugins = async () => {
      const newLoadedPlugins: Record<string, PluginModule> = {};

      for (const plugin of plugins) {
        if (
          enabledPluginIds.includes(plugin.manifest.id) &&
          plugin.entryImporter
        ) {
          try {
            const mod: unknown = await plugin.entryImporter();

            // Attempt to resolve both ESM default export and direct export
            const record =
              typeof mod === "object" && mod
                ? (mod as Record<string, unknown>)
                : undefined;
            const maybeDefault = record?.default as unknown;
            const candidate =
              maybeDefault && typeof maybeDefault === "object"
                ? maybeDefault
                : record;
            const resolved =
              candidate &&
              typeof candidate === "object" &&
              "manifest" in candidate
                ? (candidate as PluginModule)
                : undefined;

            if (resolved?.Render) {
              newLoadedPlugins[plugin.manifest.id] = resolved;
            }
          } catch (error) {
            logger.error("Failed to load plugin for global rendering", {
              pluginId: plugin.manifest.id,
              error,
            });
          }
        }
      }

      setLoadedPlugins(newLoadedPlugins);
    };

    loadEnabledPlugins();
  }, [enabledPluginIds, plugins]);

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
