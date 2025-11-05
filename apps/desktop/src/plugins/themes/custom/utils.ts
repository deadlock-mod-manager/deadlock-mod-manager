import { usePersistedStore } from "@/lib/store";
import type { CustomExportedTheme, ThemeSettings } from "./types";

export const getActiveThemeConfig = (
  current: ThemeSettings | undefined,
  override?: CustomExportedTheme,
) => {
  if (override) return override;
  const c = current?.customTheme;
  return {
    id: "custom",
    name: "Custom",
    description: undefined,
    subDescription: undefined,
    previewData: undefined,
    lineColor: c?.lineColor ?? "#6b7280",
    iconData: c?.iconData,
    backgroundSource: c?.backgroundSource,
    backgroundUrl: c?.backgroundUrl,
    backgroundData: c?.backgroundData,
    backgroundOpacity: c?.backgroundOpacity,
    userCreated: true as const,
  } satisfies CustomExportedTheme;
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
  setSettings("themes", { ...(settings ?? {}), userThemes: next });
};

export const beginEditingUserTheme = (id: string) => {
  const getState = usePersistedStore.getState;
  const setSettings = getState().setPluginSettings;
  const settings = (getState().pluginSettings.themes ?? {}) as ThemeSettings;
  const list = Array.isArray(settings.userThemes) ? settings.userThemes : [];
  const theme = list.find((t) => t.id === id);
  if (!theme) return;
  setSettings("themes", {
    ...settings,
    activeSection: "custom",
    activeTheme: "custom",
    editingThemeId: id,
    customTheme: {
      lineColor: theme.lineColor,
      iconData: theme.iconData,
      backgroundSource: theme.backgroundSource,
      backgroundUrl: theme.backgroundUrl,
      backgroundData: theme.backgroundData,
      backgroundOpacity: theme.backgroundOpacity,
    },
  });
};

export const saveEditingUserTheme = () => {
  const getState = usePersistedStore.getState;
  const setSettings = getState().setPluginSettings;
  const settings = (getState().pluginSettings.themes ?? {}) as ThemeSettings;
  const id = settings.editingThemeId;
  if (!id) return;
  const list = Array.isArray(settings.userThemes) ? settings.userThemes : [];
  const c = settings.customTheme;
  if (!c) return;
  const next = list.map((t) =>
    t.id === id
      ? {
          ...t,
          lineColor: c.lineColor,
          iconData: c.iconData,
          backgroundSource: c.backgroundSource,
          backgroundUrl: c.backgroundUrl,
          backgroundData: c.backgroundData,
          backgroundOpacity: c.backgroundOpacity,
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
