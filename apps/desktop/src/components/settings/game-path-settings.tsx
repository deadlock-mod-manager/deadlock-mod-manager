import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Label } from "@deadlock-mods/ui/components/label";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { FolderOpen, RefreshCw } from "@deadlock-mods/ui/icons";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

export const GamePathSettings = () => {
  const { t } = useTranslation();
  const { gamePath, setGamePath } = usePersistedStore();
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const handleBrowse = async () => {
    try {
      setIsBrowsing(true);
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("settings.gamePath"),
        defaultPath: gamePath || undefined,
      });

      if (selected && typeof selected === "string") {
        const path = await invoke<string>("set_game_path", { path: selected });
        setGamePath(path);
        toast.success(t("settings.gamePathSet"));
      }
    } catch (error) {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.invalidGamePath"));
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleAutoDetect = async () => {
    try {
      setIsAutoDetecting(true);
      const path = await invoke<string>("find_game_path");
      setGamePath(path);
      toast.success(t("settings.gamePathAutoDetected"));
    } catch (error) {
      logger.errorOnly(
        error instanceof Error ? error : new Error(String(error)),
      );
      toast.error(t("settings.invalidGamePath"));
    } finally {
      setIsAutoDetecting(false);
    }
  };

  return (
    <div className='flex flex-col gap-4'>
      <div className='space-y-2'>
        <Label className='font-bold text-sm' htmlFor='game-path'>
          {t("settings.currentGamePath")}
        </Label>
        <div className='flex gap-2'>
          <Input
            className='flex-1 font-mono text-sm'
            id='game-path'
            readOnly
            value={gamePath || t("settings.autoDetectGamePath")}
          />
          <Button
            disabled={isBrowsing}
            onClick={handleBrowse}
            size='icon'
            title={t("settings.browseGamePath")}
            variant='outline'>
            <FolderOpen className='h-4 w-4' />
          </Button>
          <Button
            disabled={isAutoDetecting}
            onClick={handleAutoDetect}
            size='icon'
            title={t("settings.autoDetectGamePath")}
            variant='outline'>
            <RefreshCw
              className={`h-4 w-4 ${isAutoDetecting ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>
    </div>
  );
};
