import type { ThemeSettings } from "@/plugins/themes";

type PluginState = {
  pluginSettings: Record<string, unknown>;
};

function isThemeSettings(value: unknown): value is ThemeSettings {
  if (!value || typeof value !== "object") return false;
  if (!("activeSection" in value)) return false;
  const { activeSection } = value;
  return activeSection === "pre-defined" || activeSection === "custom";
}

export function selectThemeSettings(
  state: Pick<PluginState, "pluginSettings">,
): ThemeSettings | undefined {
  const settings = state.pluginSettings.themes;
  if (isThemeSettings(settings)) return settings;
  return undefined;
}

export function selectActiveTheme(state: PluginState): string | undefined {
  const settings = selectThemeSettings(state);
  return settings?.activeTheme;
}
