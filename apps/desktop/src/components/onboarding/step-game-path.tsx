import { Button } from "@deadlock-mods/ui/components/button";
import {
  CheckCircleIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
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
      logger.withMetadata({ path }).info("Game path auto-detected");
    } catch (error) {
      logger.withError(error).error("Failed to auto-detect game path");
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
          logger.withMetadata({ path }).info("Game path manually set");
        } catch (error) {
          logger.withError(error).error("Invalid game path selected");
          setDetectionState("error");
        }
      }
    } catch (error) {
      logger.withError(error).error("Failed to browse for game path");
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
    <div className='space-y-5'>
      <div>
        <h3 className='font-["Forevs_Demo"] text-lg tracking-wide'>
          {t("onboarding.gamePath.title")}
        </h3>
        <p className='mt-2 text-sm text-muted-foreground'>
          {t("onboarding.gamePath.description")}
        </p>
      </div>

      <div className='space-y-3'>
        {detectionState === "detecting" && (
          <div className='flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 p-4'>
            <MagnifyingGlassIcon className='size-5 animate-pulse text-primary' />
            <span className='text-sm'>
              {t("onboarding.gamePath.detecting")}
            </span>
          </div>
        )}

        {detectionState === "success" && (
          <div className='space-y-3'>
            <div className='rounded-lg border border-green-500/20 bg-green-500/8 p-4'>
              <div className='flex items-center gap-2'>
                <CheckCircleIcon
                  weight='duotone'
                  className='size-5 shrink-0 text-green-500'
                />
                <p className='text-sm font-medium text-green-500'>
                  {t("onboarding.gamePath.success")}
                </p>
              </div>
              <code className='mt-2 block rounded bg-black/20 px-3 py-2 pl-7 font-mono text-xs text-muted-foreground'>
                {detectedPath}
              </code>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={browseForGamePath}
              className='w-full'>
              <FolderOpenIcon className='size-3.5' />
              {t("onboarding.gamePath.changePath")}
            </Button>
          </div>
        )}

        {detectionState === "error" && (
          <div className='space-y-3'>
            <div className='rounded-lg border border-destructive/20 bg-destructive/8 p-4'>
              <div className='flex items-center gap-2'>
                <WarningCircleIcon
                  weight='duotone'
                  className='size-5 shrink-0 text-destructive'
                />
                <p className='text-sm font-medium text-destructive'>
                  {t("onboarding.gamePath.error")}
                </p>
              </div>
              <p className='mt-1 pl-7 text-xs text-muted-foreground'>
                {t("onboarding.gamePath.errorDescription")}
              </p>
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
                <FolderOpenIcon className='size-3.5' />
                {t("onboarding.gamePath.browse")}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
