import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@deadlock-mods/ui/components/select";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingRow } from "@/components/settings/setting-row";
import { usePersistedStore } from "@/lib/store";

type GpuCompatMode = "auto" | "on" | "off";

const DESCRIPTION_ID = "settings-linux-gpu-description";
const ACTIVE_NOTE_ID = "settings-linux-gpu-active";

export const LinuxGpuToggle = () => {
  const { t } = useTranslation();
  const [isLinux, setIsLinux] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const linuxGpuOptimization = usePersistedStore(
    (state) => state.linuxGpuOptimization,
  );
  const setLinuxGpuOptimization = usePersistedStore(
    (state) => state.setLinuxGpuOptimization,
  );

  useEffect(() => {
    const checkPlatform = async () => {
      const currentPlatform = platform();
      setIsLinux(currentPlatform === "linux");

      if (currentPlatform === "linux") {
        try {
          const active = await invoke<boolean>(
            "is_linux_gpu_optimization_active",
          );
          setIsActive(active);
        } catch {
          setIsActive(false);
        }
      }
    };

    checkPlatform();
  }, []);

  if (!isLinux) {
    return null;
  }

  const currentEffective =
    linuxGpuOptimization === "on" || linuxGpuOptimization === "off"
      ? linuxGpuOptimization === "on"
      : isActive;
  const needsRestart = currentEffective !== isActive;

  const describedBy = isActive
    ? `${DESCRIPTION_ID} ${ACTIVE_NOTE_ID}`
    : DESCRIPTION_ID;

  return (
    <SettingRow
      description={t("settings.linuxGpuCompatDescription")}
      descriptionId={DESCRIPTION_ID}
      notes={
        <>
          {isActive && (
            <p className='text-muted-foreground text-xs' id={ACTIVE_NOTE_ID}>
              {t("settings.linuxGpuCompatCurrentlyActive")}
            </p>
          )}
          {needsRestart && (
            <p className='text-amber-500 text-sm'>
              {t("settings.linuxGpuOptimizationRestartRequired")}
            </p>
          )}
        </>
      }
      title={t("settings.linuxGpuCompat")}>
      <Select
        value={linuxGpuOptimization}
        onValueChange={(value: GpuCompatMode) =>
          setLinuxGpuOptimization(value)
        }>
        <SelectTrigger
          aria-describedby={describedBy}
          aria-label={t("settings.linuxGpuCompat")}
          className='w-32'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='auto'>
            {t("settings.linuxGpuCompatAuto")}
          </SelectItem>
          <SelectItem value='on'>{t("settings.linuxGpuCompatOn")}</SelectItem>
          <SelectItem value='off'>{t("settings.linuxGpuCompatOff")}</SelectItem>
        </SelectContent>
      </Select>
    </SettingRow>
  );
};
