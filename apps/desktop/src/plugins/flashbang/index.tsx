import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/components/providers/theme";
import { usePersistedStore } from "@/lib/store";
import type { PluginModule } from "@/plugins/types";

export const manifest = {
  id: "flashbang",
  nameKey: "plugins.flashbang.title",
  descriptionKey: "plugins.flashbang.description",
  version: "0.0.2",
  author: "Skeptic",
  icon: "public/icon.png",
} as const;

type FlashbangSettings = {
  enabled: boolean;
  startHour?: number; // 0-23
  endHour?: number; // 0-23
};

const DEFAULTS: FlashbangSettings = {
  enabled: false,
  startHour: 20,
  endHour: 8,
};

const Settings = () => {
  const { t } = useTranslation();
  const settings =
    (usePersistedStore((s) => s.pluginSettings[manifest.id]) as
      | FlashbangSettings
      | undefined) ?? DEFAULTS;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);

  useEffect(() => {
    // sync schedule with provider storage
    const start = settings.startHour ?? DEFAULTS.startHour!;
    const end = settings.endHour ?? DEFAULTS.endHour!;
    localStorage.setItem("deadlock-flashbang-start", String(start));
    localStorage.setItem("deadlock-flashbang-end", String(end));
  }, [settings.startHour, settings.endHour]);

  return (
    <div className='flex flex-col gap-4 pl-4 max-h-[calc(100vh-16rem)] overflow-y-auto pr-4'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='flashbang-start'>
          {t("plugins.flashbang.startHour")}
        </Label>
        <Input
          id='flashbang-start'
          min={0}
          max={23}
          type='number'
          value={settings.startHour}
          onChange={(e) =>
            setSettings(manifest.id, {
              ...settings,
              startHour: Math.max(0, Math.min(23, Number(e.target.value))),
            })
          }
        />
      </div>

      <div className='flex flex-col gap-2'>
        <Label htmlFor='flashbang-end'>{t("plugins.flashbang.endHour")}</Label>
        <Input
          id='flashbang-end'
          min={0}
          max={23}
          type='number'
          value={settings.endHour}
          onChange={(e) =>
            setSettings(manifest.id, {
              ...settings,
              endHour: Math.max(0, Math.min(23, Number(e.target.value))),
            })
          }
        />
      </div>
    </div>
  );
};

const Render = () => {
  const pluginSettings =
    (usePersistedStore((s) => s.pluginSettings[manifest.id]) as
      | FlashbangSettings
      | undefined) ?? DEFAULTS;
  const isEnabled = usePersistedStore(
    (s) => s.enabledPlugins[manifest.id] ?? false,
  );
  const { setFlashbangEnabled } = useTheme();

  useEffect(() => {
    // Enable/disable provider flag based on plugin enable state
    setFlashbangEnabled(isEnabled);

    // Keep schedule in sync
    localStorage.setItem(
      "deadlock-flashbang-start",
      String(pluginSettings.startHour ?? DEFAULTS.startHour),
    );
    localStorage.setItem(
      "deadlock-flashbang-end",
      String(pluginSettings.endHour ?? DEFAULTS.endHour),
    );
  }, [
    isEnabled,
    pluginSettings.startHour,
    pluginSettings.endHour,
    setFlashbangEnabled,
  ]);

  return null;
};

const mod: PluginModule = {
  manifest,
  Render,
  Settings,
};

export default mod;
