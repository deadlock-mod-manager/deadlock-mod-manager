import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircle,
  FolderOpen,
  MagnifyingGlass,
  WarningCircle,
} from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import logger from "@/lib/logger";
import { usePersistedStore } from "@/lib/store";

type GamePathStepProps = {
  onComplete: () => void;
};

type DetectionState = "idle" | "detecting" | "success" | "error";

export const OnboardingStepGamePath = ({ onComplete }: GamePathStepProps) => {
  const { t } = useTranslation();
  const { gamePath, setGamePath } = usePersistedStore();
  const [detectionState, setDetectionState] = useState<DetectionState>("idle");
  const [detectedPath, setDetectedPath] = useState<string>("");

  const detectGamePath = useCallback(async () => {
    setDetectionState("detecting");
    try {
      const path = await invoke<string>("find_game_path");
      setDetectedPath(path);
      setGamePath(path);
      setDetectionState("success");
      logger.info("Game path auto-detected", { path });
    } catch (error) {
      logger.error("Failed to auto-detect game path", { error });
      setDetectionState("error");
    }
  }, [setGamePath]);

  const browseForGamePath = useCallback(async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: t("settings.browseGamePath"),
      });

      if (selected && typeof selected === "string") {
        try {
          const path = await invoke<string>("set_game_path", {
            path: selected,
          });
          setDetectedPath(path);
          setGamePath(path);
          setDetectionState("success");
          logger.info("Game path manually set", { path });
        } catch (error) {
          logger.error("Invalid game path selected", { error });
          setDetectionState("error");
        }
      }
    } catch (error) {
      logger.error("Failed to browse for game path", { error });
    }
  }, [t, setGamePath]);

  useEffect(() => {
    if (gamePath) {
      setDetectedPath(gamePath);
      setDetectionState("success");
      onComplete();
    } else {
      detectGamePath();
    }
  }, [gamePath, onComplete, detectGamePath]);

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='text-lg font-semibold'>
          {t("onboarding.gamePath.title")}
        </h3>
        <p className='text-sm text-muted-foreground mt-2'>
          {t("onboarding.gamePath.description")}
        </p>
      </div>

      <div className='space-y-4'>
        {detectionState === "detecting" && (
          <div className='flex items-center gap-3 p-4 border rounded-lg bg-muted/50'>
            <MagnifyingGlass className='h-5 w-5 animate-pulse' />
            <span className='text-sm'>
              {t("onboarding.gamePath.detecting")}
            </span>
          </div>
        )}

        {detectionState === "success" && (
          <div className='space-y-3'>
            <div className='flex items-start gap-3 p-4 border rounded-lg bg-green-500/10 border-green-500/20'>
              <CheckCircle className='h-5 w-5 text-green-500 flex-shrink-0 mt-0.5' />
              <div className='flex-1 min-w-0'>
                <p className='text-sm font-medium text-green-500'>
                  {t("onboarding.gamePath.success")}
                </p>
                <p className='text-xs text-muted-foreground mt-1 break-all'>
                  {detectedPath}
                </p>
              </div>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={browseForGamePath}
              className='w-full'>
              <FolderOpen className='h-4 w-4 mr-2' />
              {t("onboarding.gamePath.changePath")}
            </Button>
          </div>
        )}

        {detectionState === "error" && (
          <div className='space-y-3'>
            <div className='flex items-start gap-3 p-4 border rounded-lg bg-destructive/10 border-destructive/20'>
              <WarningCircle className='h-5 w-5 text-destructive flex-shrink-0 mt-0.5' />
              <div className='flex-1'>
                <p className='text-sm font-medium text-destructive'>
                  {t("onboarding.gamePath.error")}
                </p>
                <p className='text-xs text-muted-foreground mt-1'>
                  {t("onboarding.gamePath.errorDescription")}
                </p>
              </div>
            </div>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={detectGamePath}
                className='flex-1'>
                {t("onboarding.gamePath.retry")}
              </Button>
              <Button
                variant='default'
                size='sm'
                onClick={browseForGamePath}
                className='flex-1'>
                <FolderOpen className='h-4 w-4 mr-2' />
                {t("onboarding.gamePath.browse")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
