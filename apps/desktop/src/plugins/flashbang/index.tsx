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
  version: "0.1.0",
  author: "Skeptic",
  icon: "public/icon.png",
} as const;

type FlashbangSettings = {
  enabled: boolean;
  chance?: number; // 0-100, percent chance to trigger on load
};

const DEFAULTS: FlashbangSettings = {
  enabled: false,
  chance: 50,
};

const COOLDOWN_MS = 60_000;
const LAST_TRIGGERED_KEY = "deadlock-flashbang-last-triggered";

// Roll once per app load, not on every remount of the plugin renderer.
let rolledThisLoad = false;

const rollFlashbang = (chance: number) => {
  const lastTriggered = Number(localStorage.getItem(LAST_TRIGGERED_KEY) ?? 0);
  if (Date.now() - lastTriggered < COOLDOWN_MS) {
    return false;
  }
  if (Math.random() * 100 >= chance) {
    return false;
  }
  localStorage.setItem(LAST_TRIGGERED_KEY, String(Date.now()));
  return true;
};

const Settings = () => {
  const { t } = useTranslation();
  const settings =
    (usePersistedStore((s) => s.pluginSettings[manifest.id]) as
      | FlashbangSettings
      | undefined) ?? DEFAULTS;
  const setSettings = usePersistedStore((s) => s.setPluginSettings);

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pl-4 pr-4'>
      <div className='flex flex-col gap-2'>
        <Label htmlFor='flashbang-chance'>
          {t("plugins.flashbang.chance")}
        </Label>
        <Input
          id='flashbang-chance'
          min={0}
          max={100}
          type='number'
          value={settings.chance ?? DEFAULTS.chance}
          onChange={(e) =>
            setSettings(manifest.id, {
              ...settings,
              chance: Math.max(0, Math.min(100, Number(e.target.value))),
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
  const { setFlashbangActive } = useTheme();
  const chance = pluginSettings.chance ?? DEFAULTS.chance!;

  useEffect(() => {
    if (!isEnabled) {
      rolledThisLoad = false;
      setFlashbangActive(false);
      return;
    }
    if (rolledThisLoad) {
      return;
    }
    rolledThisLoad = true;
    setFlashbangActive(rollFlashbang(chance));
  }, [isEnabled, chance, setFlashbangActive]);

  return null;
};

const mod: PluginModule = {
  manifest,
  Render,
  Settings,
};

export default mod;
