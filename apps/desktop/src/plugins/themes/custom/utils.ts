import { usePersistedStore } from "@/lib/store";
import { DEFAULT_CUSTOM_THEME } from "./theme-defaults";
import type {
  CustomExportedTheme,
  CustomThemePalette,
  ThemeSettings,
} from "./types";

type LegacyGlowPartial = Partial<{
  glowEnabled: boolean;
  glowColor: string;
  glowIntensity: number;
  glowSpread: number;
}>;

function hasLegacyGlow(obj: unknown): obj is LegacyGlowPartial {
  if (typeof obj !== "object" || obj === null) return false;
  const candidate = obj as Record<string, unknown>;
  return (
    "glowEnabled" in candidate ||
    "glowColor" in candidate ||
    "glowIntensity" in candidate ||
    "glowSpread" in candidate
  );
}

export function mergeCustomThemePalette(
  partial?: Partial<CustomThemePalette> | CustomExportedTheme,
): CustomThemePalette {
  const merged = { ...DEFAULT_CUSTOM_THEME, ...partial };
  const legacy = hasLegacyGlow(partial) ? partial : undefined;

  const ambientBackgroundEnabled =
    merged.ambientBackgroundEnabled ??
    legacy?.glowEnabled ??
    DEFAULT_CUSTOM_THEME.ambientBackgroundEnabled;

  const ambientAccentColor =
    merged.ambientAccentColor ??
    legacy?.glowColor ??
    DEFAULT_CUSTOM_THEME.ambientAccentColor;

  const ambientIntensity =
    merged.ambientIntensity ??
    legacy?.glowIntensity ??
    DEFAULT_CUSTOM_THEME.ambientIntensity;

  const ambientSpread =
    merged.ambientSpread ??
    legacy?.glowSpread ??
    DEFAULT_CUSTOM_THEME.ambientSpread;

  const palette: CustomThemePalette = {
    lineColor: merged.lineColor,
    accentColor: merged.accentColor,
    cardColor: merged.cardColor,
    popoverColor: merged.popoverColor,
    secondaryColor: merged.secondaryColor,
    mutedColor: merged.mutedColor,
    foregroundColor: merged.foregroundColor,
    mutedForegroundColor: merged.mutedForegroundColor,
    sidebarOpacity:
      merged.sidebarOpacity ?? DEFAULT_CUSTOM_THEME.sidebarOpacity,
    ambientBackgroundEnabled,
    ambientAccentColor,
    ambientIntensity,
    ambientSpread,
    cornerRadiusPx:
      merged.cornerRadiusPx ?? DEFAULT_CUSTOM_THEME.cornerRadiusPx,
  };

  return palette;
}

export const getActiveThemeConfig = (
  current: ThemeSettings | undefined,
  override?: CustomExportedTheme,
): CustomThemePalette => {
  if (override) {
    return mergeCustomThemePalette(override);
  }
  const c = current?.customTheme;
  return mergeCustomThemePalette(c);
};

export const getUserThemes = (settings: ThemeSettings | undefined) => {
  return Array.isArray(settings?.userThemes) ? settings!.userThemes : [];
};

export const deleteUserTheme = (id: string) => {
  const settings = usePersistedStore.getState().pluginSettings.themes as
    | ThemeSettings
    | undefined;
  const setSettings = usePersistedStore.getState().setPluginSettings;
  const list = Array.isArray(settings?.userThemes) ? settings!.userThemes : [];
  const next = list.filter((t) => t.id !== id);
  setSettings("themes", { ...settings, userThemes: next });
};

export const beginEditingUserTheme = (id: string) => {
  const getState = usePersistedStore.getState;
  const setSettings = getState().setPluginSettings;
  const settings = (getState().pluginSettings.themes ?? {}) as ThemeSettings;
  const list = Array.isArray(settings.userThemes) ? settings.userThemes : [];
  const theme = list.find((t) => t.id === id);
  if (!theme) return;
  const merged = mergeCustomThemePalette(theme);
  setSettings("themes", {
    ...settings,
    activeSection: "custom",
    editingThemeId: id,
    customTheme: merged,
  });
};

export const saveEditingUserTheme = () => {
  const getState = usePersistedStore.getState;
  const setSettings = getState().setPluginSettings;
  const settings = (getState().pluginSettings.themes ?? {}) as ThemeSettings;
  const id = settings.editingThemeId;
  if (!id) return;
  const list = Array.isArray(settings.userThemes) ? settings.userThemes : [];
  const c = mergeCustomThemePalette(settings.customTheme);
  const next = list.map((t) =>
    t.id === id
      ? {
          ...t,
          ...c,
        }
      : t,
  );
  setSettings("themes", {
    ...settings,
    userThemes: next,
    editingThemeId: undefined,
  });
};

export const cancelEditingUserTheme = () => {
  const getState = usePersistedStore.getState;
  const setSettings = getState().setPluginSettings;
  const settings = (getState().pluginSettings.themes ?? {}) as ThemeSettings;
  setSettings("themes", { ...settings, editingThemeId: undefined });
};
