import { StopIcon } from "@phosphor-icons/react";
import { PlayCircleIcon } from "@phosphor-icons/react/dist/ssr";
import { invoke } from "@tauri-apps/api/core";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScrollBackButtonContext } from "@/contexts/scroll-back-button-context";
import { useLaunch } from "@/hooks/use-launch";
import { isGameRunning } from "@/lib/api";
import { usePersistedStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { ProfileShareDialog } from "../profiles/profile-share-dialog";
import { Separator } from "../ui/separator";
import Profile from "./profile";

export const Toolbar = () => {
  const { t } = useTranslation();
  const { gamePath } = usePersistedStore();
  const { launch } = useLaunch();
  const [vanillaAnimating, setVanillaAnimating] = useState(false);
  const [moddedAnimating, setModdedAnimating] = useState(false);
  const { showBackButton, onBackClick } = useScrollBackButtonContext();

  const { data: isRunning, refetch } = useQuery({
    queryKey: ["is-game-running"],
    queryFn: () => isGameRunning(),
    refetchInterval: 5000,
  });

  return (
    <div className='flex w-full flex-row items-center justify-end gap-4 border-t border-b pl-6 pr-6 py-4'>
      <div className='flex flex-grow flex-row items-center justify-start gap-2 px-4'>
        <div
          className={cn(
            "overflow-hidden transition-all duration-300 ease-in-out flex items-center gap-2",
            showBackButton ? "w-fit opacity-100 mr-2" : "w-0 opacity-0",
          )}>
          <Button
            className='flex items-center gap-2 whitespace-nowrap'
            onClick={onBackClick}
            size='sm'
            variant='ghost'>
            <ArrowLeft className='h-4 w-4' />
            {t("common.back", "Back")}
          </Button>
          <Separator orientation='vertical' className='h-8' />
        </div>
        <Profile />
        <ProfileShareDialog />
      </div>
      {!isRunning && (
        <Button
          className='relative overflow-hidden'
          disabled={!gamePath}
          onClick={() => {
            setVanillaAnimating(true);
            launch(true);
            setTimeout(() => setVanillaAnimating(false), 500);
          }}
          variant='outline'>
          <div
            className={cn(
              "absolute inset-0 bg-white/30",
              vanillaAnimating
                ? "w-full transition-all duration-500 ease-in-out"
                : "w-0",
            )}
          />
          <PlayCircleIcon />
          <span className='relative z-10 font-medium text-md'>
            {t("common.launchVanilla")}
          </span>
        </Button>
      )}
      <div className='flex flex-col items-center gap-2'>
        <Button
          className='relative overflow-hidden'
          disabled={!gamePath}
          onClick={() => {
            if (isRunning) {
              invoke("stop_game").then(() => refetch());
            } else {
              setModdedAnimating(true);
              launch();
              setTimeout(() => setModdedAnimating(false), 500);
            }
          }}>
          <div
            className={cn(
              "absolute inset-0 bg-amber-200",
              moddedAnimating
                ? "w-full transition-all duration-500 ease-in-out"
                : "w-0",
            )}
          />
          <div className='relative z-10'>
            {isRunning ? <StopIcon /> : <PlayCircleIcon />}
          </div>
          <span className='relative z-10 font-medium text-md'>
            {isRunning ? t("common.stopGame") : t("common.launchModded")}
          </span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn("font-medium text-xs", {
                hidden: gamePath,
                "text-destructive": !gamePath,
              })}>
              {t("common.gameNotDetected")}
            </div>
          </TooltipTrigger>
          {gamePath && (
            <TooltipContent>
              <p>{t("common.gameInstalledAt", { path: gamePath })}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
};
