import { platform } from "@tauri-apps/plugin-os";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NOOP } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import type { SystemSetting } from "@/types/settings";
import SettingCard from "./setting-card";

const getSystemSettings = (
  t: (key: string) => string,
  isLinux: boolean,
): SystemSetting[] =>
  [
    {
      id: "auto-reapply-mods",
      description: t("settings.autoReapplyMods"),
      enabled: false,
      onChange: NOOP,
    },
    {
      id: "launch-vanilla-no-args",
      description: t("settings.launchVanillaNoArgs"),
      enabled: false,
      onChange: NOOP,
    },
    {
      id: "mods-store-pagination",
      description: t("settings.modsStorePagination"),
      enabled: isLinux,
      onChange: NOOP,
    },
  ].map((setting) => ({
    ...setting,
    key: "",
    value: "",
    type: "boolean",
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

const SystemSettings = () => {
  const { t } = useTranslation();
  const { settings, toggleSetting } = usePersistedStore();
  const isLinux = platform() === "linux";

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled]),
    );
  }, [settings]);

  const systemSettings = useMemo(() => {
    return getSystemSettings(t, isLinux).map((setting) => ({
      ...setting,
      enabled: settingStatusById[setting.id] ?? setting.enabled,
      onChange: (newValue: boolean) => {
        toggleSetting(setting.id, setting, newValue);
      },
    }));
  }, [isLinux, settingStatusById, toggleSetting, t]);

  return (
    <>
      {systemSettings.map((setting) => (
        <SettingCard
          key={setting.id}
          onChange={setting.onChange}
          setting={setting}
        />
      ))}
    </>
  );
};

export default SystemSettings;
