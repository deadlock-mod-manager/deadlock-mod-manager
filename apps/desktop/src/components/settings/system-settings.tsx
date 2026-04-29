import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { platform } from "@tauri-apps/plugin-os";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NOOP } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";

type SystemSettingDef = {
  id: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
};

const getSystemSettings = (
  t: (key: string) => string,
  isLinux: boolean,
): SystemSettingDef[] => [
  {
    id: "auto-reapply-mods",
    label: t("settings.autoReapplyMods"),
    description: t("settings.autoReapplyModsDescription"),
    defaultEnabled: false,
  },
  {
    id: "launch-vanilla-no-args",
    label: t("settings.launchVanillaNoArgs"),
    description: t("settings.launchVanillaNoArgsDescription"),
    defaultEnabled: false,
  },
  {
    id: "mods-store-pagination",
    label: t("settings.modsStorePagination"),
    description: t("settings.modsStorePaginationDescription"),
    defaultEnabled: isLinux,
  },
];

const SystemSettings = () => {
  const { t } = useTranslation();
  const { settings, toggleSetting } = usePersistedStore();
  const isLinux = platform() === "linux";

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled]),
    );
  }, [settings]);

  const systemSettings = getSystemSettings(t, isLinux);

  return (
    <>
      {systemSettings.map((def) => {
        const enabled = settingStatusById[def.id] ?? def.defaultEnabled;
        return (
          <div className='flex items-center justify-between' key={def.id}>
            <div className='space-y-1'>
              <Label className='font-bold text-sm'>{def.label}</Label>
              <p className='text-muted-foreground text-sm'>{def.description}</p>
            </div>
            <div className='flex items-center gap-2'>
              <Switch
                checked={enabled}
                id={`toggle-setting-${def.id}`}
                onCheckedChange={(newValue) => {
                  toggleSetting(def.id, {
                    id: def.id,
                    key: "",
                    value: "",
                    type: "boolean",
                    description: def.description ?? def.label,
                    enabled,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  }, newValue);
                }}
              />
              <Label htmlFor={`toggle-setting-${def.id}`}>
                {enabled ? t("status.enabled") : t("status.disabled")}
              </Label>
            </div>
          </div>
        );
      })}
    </>
  );
};

export default SystemSettings;
