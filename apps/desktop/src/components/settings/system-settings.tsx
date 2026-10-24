import { platform } from "@tauri-apps/plugin-os";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SettingToggleRow } from "@/components/settings/setting-row";
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
  {
    id: "hero-conflict-warning",
    label: t("settings.heroConflictWarning"),
    description: t("settings.heroConflictWarningDescription"),
    defaultEnabled: true,
  },
];

const SystemSettings = ({ ids }: { ids: readonly string[] }) => {
  const { t } = useTranslation();
  const { settings, toggleSetting } = usePersistedStore();
  const isLinux = platform() === "linux";

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled]),
    );
  }, [settings]);

  const systemSettings = getSystemSettings(t, isLinux).filter((def) =>
    ids.includes(def.id),
  );

  return (
    <>
      {systemSettings.map((def) => {
        const enabled = settingStatusById[def.id] ?? def.defaultEnabled;
        return (
          <SettingToggleRow
            checked={enabled}
            description={def.description}
            id={`toggle-setting-${def.id}`}
            key={def.id}
            onCheckedChange={(newValue) => {
              toggleSetting(
                def.id,
                {
                  id: def.id,
                  key: "",
                  value: "",
                  type: "boolean",
                  description: def.description,
                  enabled,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                newValue,
              );
            }}
            title={def.label}
          />
        );
      })}
    </>
  );
};

export default SystemSettings;
