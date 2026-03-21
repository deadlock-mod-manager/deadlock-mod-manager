import type { ThemeSettings } from "@/plugins/themes";

type PluginState = {
  pluginSettings: Record<string, unknown>;
  enabledPlugins: Record<string, boolean>;
};

function isThemeSettings(value: unknown): value is ThemeSettings {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.activeSection === "pre-defined" || obj.activeSection === "custom";
}

export function selectThemeSettings(
  state: Pick<PluginState, "pluginSettings">,
): ThemeSettings | undefined {
  const settings = state.pluginSettings.themes;
  if (isThemeSettings(settings)) return settings;
  return undefined;
}

export function selectActiveTheme(state: PluginState): string | undefined {
  const themesEnabled = state.enabledPlugins.themes ?? false;
  if (!themesEnabled) return undefined;
  const settings = selectThemeSettings(state);
  return settings?.activeTheme;
}

export function selectIsDeadlockApiTheme(state: PluginState): boolean {
  return selectActiveTheme(state) === "deadlock-api";
}
