import { Button } from "@deadlock-mods/ui/components/button";
import { Separator } from "@deadlock-mods/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { ArrowLeft } from "@deadlock-mods/ui/icons";
import { StopIcon } from "@phosphor-icons/react";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useScrollBackButtonContext } from "@/contexts/scroll-back-button-context";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { useLaunch } from "@/hooks/use-launch";
import { isGameRunning } from "@/lib/api";
import { STALE_TIME_POLL } from "@/lib/query-constants";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ProfileShareDialog } from "../profiles/profile-share-dialog";
import UserMenu from "../user/user-menu";
import Profile from "./profile";

export const Toolbar = () => {
  const { t } = useTranslation();
  const { gamePath, getEnabledModsCount } = usePersistedStore();
  const { launch } = useLaunch();
  const [vanillaAnimating, setVanillaAnimating] = useState(false);
  const [moddedAnimating, setModdedAnimating] = useState(false);
  const { showBackButton, onBackClick } = useScrollBackButtonContext();
  const { isEnabled: isProfileSharingEnabled } =
    useFeatureFlag("profile-sharing");

  const enabledModsCount = getEnabledModsCount();

  const { data: isRunning, refetch } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    staleTime: STALE_TIME_POLL,
    refetchInterval: 5000,
    enabled: !!gamePath,
  });

  return (
    <div className='flex min-w-0 flex-1 items-stretch' data-tauri-drag-region>
      <div className='flex min-w-0 shrink-0 items-center gap-2 px-4 py-2'>
        <div className='min-w-0 max-w-48'>
          <Profile />
        </div>
        {isProfileSharingEnabled && (
          <div className='shrink-0'>
            <ProfileShareDialog />
          </div>
        )}
      </div>

      <div
        className='flex flex-1 items-center justify-end gap-2 px-4 py-2'
        data-tauri-drag-region>
        <div
          className={cn(
            "flex items-center gap-2 overflow-hidden transition-all duration-300 ease-in-out",
            showBackButton ? "mr-2 w-fit opacity-100" : "w-0 opacity-0",
          )}>
          <Button
            className='flex items-center gap-2 whitespace-nowrap'
            onClick={onBackClick}
            size='sm'
            variant='ghost'>
            <ArrowLeft className='h-4 w-4' />
            {t("common.back", "Back")}
          </Button>
          <Separator className='h-6' orientation='vertical' />
        </div>

        {!isRunning && (
          <Button
            className='relative h-8 gap-1.5 overflow-hidden px-3 text-xs'
            disabled={!gamePath}
            onClick={() => {
              setVanillaAnimating(true);
              launch(true);
              setTimeout(() => setVanillaAnimating(false), 500);
            }}
            variant='outline'>
            <div
              className={cn(
                "absolute inset-0 bg-foreground/10",
                vanillaAnimating
                  ? "w-full transition-all duration-500 ease-in-out"
                  : "w-0",
              )}
            />
            <PlayCircleIcon className='relative z-10 size-3.5' />
            <span className='relative z-10'>{t("common.launchVanilla")}</span>
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className='relative h-8 gap-1.5 overflow-hidden px-3 text-xs'
              disabled={!gamePath}
              onClick={() => {
                if (isRunning) {
                  invoke("stop_game").finally(() => refetch());
                } else {
                  setModdedAnimating(true);
                  launch();
                  setTimeout(() => setModdedAnimating(false), 500);
                }
              }}>
              <div
                className={cn(
                  "absolute inset-0 bg-amber-200/40",
                  moddedAnimating
                    ? "w-full transition-all duration-500 ease-in-out"
                    : "w-0",
                )}
              />
              <span className='relative z-10 inline-flex items-center'>
                {isRunning ? (
                  <StopIcon className='size-3.5' />
                ) : (
                  <PlayCircleIcon className='size-3.5' />
                )}
              </span>
              <span className='relative z-10'>
                {isRunning ? t("common.stopGame") : t("common.launchModded")}
              </span>
              {!isRunning && enabledModsCount > 0 && (
                <span className='relative z-10 inline-flex items-center gap-1 tabular-nums'>
                  <span aria-hidden='true' className='opacity-60'>
                    ·
                  </span>
                  {t("common.launchModdedCount", {
                    count: enabledModsCount,
                    defaultValue: "{{count}} mods",
                  })}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          {!gamePath && (
            <TooltipContent>
              <p className='text-destructive'>{t("common.gameNotDetected")}</p>
            </TooltipContent>
          )}
          {gamePath && (
            <TooltipContent>
              <p>{t("common.gameInstalledAt", { path: gamePath })}</p>
            </TooltipContent>
          )}
        </Tooltip>

        <Separator className='mx-1 h-6' orientation='vertical' />

        <UserMenu />
      </div>
    </div>
  );
};
