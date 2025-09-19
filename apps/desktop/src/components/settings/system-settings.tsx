import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { NOOP } from "@/lib/constants";
import { usePersistedStore } from "@/lib/store";
import type { SystemSetting } from "@/types/settings";
import SettingCard from "./setting-card";

const getSystemSettings = (t: (key: string) => string): SystemSetting[] =>
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

  const settingStatusById = useMemo(() => {
    return Object.fromEntries(
      Object.entries(settings).map(([id, setting]) => [id, setting.enabled]),
    );
  }, [settings]);

  const systemSettings = useMemo(() => {
    return getSystemSettings(t).map((setting) => ({
      ...setting,
      enabled: settingStatusById[setting.id] ?? false,
      onChange: (newValue: boolean) => {
        toggleSetting(setting.id, setting, newValue);
      },
    }));
  }, [settingStatusById, toggleSetting, t]);

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
