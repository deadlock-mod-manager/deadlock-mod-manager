import { Label } from "@deadlock-mods/ui/components/label";
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
import { usePersistedStore } from "@/lib/store";

type GpuCompatMode = "auto" | "on" | "off";

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

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.linuxGpuCompat")}
        </Label>
        <p className='text-muted-foreground text-sm max-w-xl'>
          {t("settings.linuxGpuCompatDescription")}
        </p>
        {isActive && (
          <p className='text-muted-foreground text-xs'>
            {t("settings.linuxGpuCompatCurrentlyActive")}
          </p>
        )}
        {needsRestart && (
          <p className='text-amber-500 text-sm'>
            {t("settings.linuxGpuOptimizationRestartRequired")}
          </p>
        )}
      </div>
      <Select
        value={linuxGpuOptimization}
        onValueChange={(value: GpuCompatMode) =>
          setLinuxGpuOptimization(value)
        }>
        <SelectTrigger className='w-32'>
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
    </div>
  );
};
