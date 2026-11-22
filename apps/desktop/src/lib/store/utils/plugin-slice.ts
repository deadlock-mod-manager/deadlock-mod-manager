import { getPlugins } from "@/lib/plugins";
import type { PluginManifest } from "@/types/plugins";
import type { State } from "..";

export type PluginSliceState = Pick<State, "enabledPlugins" | "pluginSettings">;

type ThemePluginSettings = { activeTheme?: string };

const getManifests = (): PluginManifest[] =>
  getPlugins().map((plugin) => plugin.manifest);

const isAlwaysEnabled = (
  manifests: PluginManifest[],
  pluginId: string,
): boolean =>
  manifests.some(
    (manifest) => manifest.id === pluginId && manifest.alwaysEnabled === true,
  );

const getExcludedPluginIds = (
  manifests: PluginManifest[],
  pluginId: string,
): Set<string> =>
  new Set([
    ...(manifests.find((manifest) => manifest.id === pluginId)
      ?.disabledPlugins ?? []),
    ...manifests
      .filter((manifest) => manifest.disabledPlugins?.includes(pluginId))
      .map((manifest) => manifest.id),
  ]);

const hasActiveTheme = (value: unknown): value is ThemePluginSettings =>
  typeof value === "object" &&
  value !== null &&
  "activeTheme" in value &&
  typeof value.activeTheme === "string";

const clearActiveTheme = (
  pluginSettings: State["pluginSettings"],
  pluginId: string,
): State["pluginSettings"] => {
  const settings = pluginSettings[pluginId];
  if (!hasActiveTheme(settings)) {
    return pluginSettings;
  }

  return {
    ...pluginSettings,
    [pluginId]: { ...settings, activeTheme: undefined },
  };
};

/** Always-enabled plugins have no persisted switch, so a missing flag is not "disabled". */
export const resolvePluginEnabled = (
  enabledPlugins: State["enabledPlugins"],
  pluginId: string,
): boolean =>
  isAlwaysEnabled(getManifests(), pluginId) ||
  (enabledPlugins[pluginId] ?? false);

export const enablePlugin = (
  state: PluginSliceState,
  pluginId: string,
): Partial<PluginSliceState> => {
  const manifests = getManifests();
  if (isAlwaysEnabled(manifests, pluginId)) {
    return {};
  }

  const enabledPlugins = { ...state.enabledPlugins, [pluginId]: true };
  let pluginSettings = state.pluginSettings;

  for (const excludedId of getExcludedPluginIds(manifests, pluginId)) {
    // Always-enabled plugins have no toggle to switch them back on, so clear
    // their selection rather than disabling them.
    if (isAlwaysEnabled(manifests, excludedId)) {
      pluginSettings = clearActiveTheme(pluginSettings, excludedId);
    } else {
      enabledPlugins[excludedId] = false;
    }
  }

  return { enabledPlugins, pluginSettings };
};

export const disablePlugin = (
  state: PluginSliceState,
  pluginId: string,
): Partial<PluginSliceState> =>
  isAlwaysEnabled(getManifests(), pluginId)
    ? {}
    : { enabledPlugins: { ...state.enabledPlugins, [pluginId]: false } };

export const applyPluginSettings = (
  state: PluginSliceState,
  pluginId: string,
  value: unknown,
): Partial<PluginSliceState> => {
  const pluginSettings = { ...state.pluginSettings, [pluginId]: value };
  if (!hasActiveTheme(value)) {
    return { pluginSettings };
  }

  // Always-enabled plugins have no switch; their selection activates them.
  const manifests = getManifests();
  if (!isAlwaysEnabled(manifests, pluginId)) {
    return { pluginSettings };
  }

  const enabledPlugins = { ...state.enabledPlugins };
  for (const excludedId of getExcludedPluginIds(manifests, pluginId)) {
    enabledPlugins[excludedId] = false;
  }

  return { enabledPlugins, pluginSettings };
};
