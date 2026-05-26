import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { Switch } from "@deadlock-mods/ui/components/switch";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { FolderOpen } from "@deadlock-mods/ui/icons";
import { useMutation } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const SteamPathSettings = () => {
  const { t } = useTranslation();
  const useCustomSteamPath = usePersistedStore(
    (state) => state.useCustomSteamPath,
  );
  const steamPath = usePersistedStore((state) => state.steamPath);
  const setUseCustomSteamPath = usePersistedStore(
    (state) => state.setUseCustomSteamPath,
  );
  const setSteamPath = usePersistedStore((state) => state.setSteamPath);

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (enabled) {
        const { steamPath: currentSteamPath } = usePersistedStore.getState();
        if (!currentSteamPath) {
          return invoke<string>("find_steam_path");
        }
        return null;
      }

      await invoke("clear_steam_path");
      return null;
    },
    onSuccess: (path, enabled) => {
      if (enabled) {
        if (path) {
          setSteamPath(path);
        }
        setUseCustomSteamPath(true);
        return;
      }

      setUseCustomSteamPath(false);
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.steamPathToggleFailed"));
    },
  });

  const browseMutation = useMutation({
    mutationFn: async () => {
      const { steamPath: currentSteamPath } = usePersistedStore.getState();
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("settings.steamPath"),
        defaultPath: currentSteamPath || undefined,
      });

      if (selected && typeof selected === "string") {
        return invoke<string>("set_steam_path", { path: selected });
      }

      return null;
    },
    onSuccess: (path) => {
      if (!path) {
        return;
      }

      setSteamPath(path);
      toast.success(t("settings.steamPathSet"));
    },
    onError: (error) => {
      logger.errorOnly(error);
      toast.error(t("settings.invalidSteamPath"));
    },
  });

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex items-center justify-between gap-4'>
        <Label className='font-bold text-sm' htmlFor='toggle-custom-steam-path'>
          {t("settings.useCustomSteamPath")}
        </Label>
        <Switch
          checked={useCustomSteamPath}
          disabled={toggleMutation.isPending}
          id='toggle-custom-steam-path'
          onCheckedChange={(enabled) => toggleMutation.mutate(enabled)}
        />
      </div>

      {!useCustomSteamPath ? (
        <p className='text-muted-foreground text-sm'>
          {t("settings.steamPathAutoDetected")}
        </p>
      ) : (
        <div className='space-y-2'>
          <Label className='font-bold text-sm' htmlFor='steam-path'>
            {t("settings.currentSteamPath")}
          </Label>
          <div className='flex gap-2'>
            <Input
              className='flex-1 font-mono text-sm'
              id='steam-path'
              placeholder={t("settings.browseSteamPath")}
              readOnly
              value={steamPath}
            />
            <Button
              disabled={browseMutation.isPending}
              onClick={() => browseMutation.mutate()}
              size='icon'
              title={t("settings.browseSteamPath")}
              variant='outline'>
              <FolderOpen className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
