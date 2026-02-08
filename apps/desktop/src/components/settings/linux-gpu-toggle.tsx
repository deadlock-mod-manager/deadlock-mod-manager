import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePersistedStore } from "@/lib/store";

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

  const needsRestart = linuxGpuOptimization !== isActive;

  return (
    <div className='flex items-center justify-between'>
      <div className='space-y-1'>
        <Label className='font-bold text-sm'>
          {t("settings.linuxGpuOptimization")}
        </Label>
        <p className='text-muted-foreground text-sm max-w-xl'>
          {t("settings.linuxGpuOptimizationDescription")}
        </p>
        {needsRestart && (
          <p className='text-amber-500 text-sm'>
            {t("settings.linuxGpuOptimizationRestartRequired")}
          </p>
        )}
      </div>
      <div className='flex items-center gap-2'>
        <Switch
          checked={linuxGpuOptimization}
          onCheckedChange={setLinuxGpuOptimization}
          id='toggle-setting-linux-gpu-optimization'
        />
        <Label htmlFor='toggle-setting-linux-gpu-optimization'>
          {linuxGpuOptimization ? t("status.enabled") : t("status.disabled")}
        </Label>
      </div>
    </div>
  );
};
