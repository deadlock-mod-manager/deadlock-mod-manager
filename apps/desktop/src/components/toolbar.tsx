import { GameController, Play, Stop } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from 'react-query';
import { useLaunch } from '@/hooks/use-launch';
import { isGameRunning } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import Profile from './profile';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export const Toolbar = () => {
  const { t } = useTranslation();
  const { gamePath } = usePersistedStore();
  const { launch } = useLaunch();
  const [vanillaAnimating, setVanillaAnimating] = useState(false);
  const [moddedAnimating, setModdedAnimating] = useState(false);

  const { data: isRunning, refetch } = useQuery({
    queryKey: ['is-game-running'],
    queryFn: () => isGameRunning(),
    refetchInterval: 5000,
  });

  return (
    <div className="flex w-full flex-row items-center justify-end gap-4 border-b px-8 py-4">
      <div className="flex flex-grow flex-row items-center justify-start gap-2 px-4">
        <Profile />
      </div>
      {!isRunning && (
        <Button
          className="relative overflow-hidden"
          disabled={!gamePath}
          onClick={() => {
            setVanillaAnimating(true);
            launch(true);
            setTimeout(() => setVanillaAnimating(false), 500);
          }}
          size="lg"
          variant="ghost"
        >
          <div
            className={cn(
              'absolute inset-0 bg-white/30',
              vanillaAnimating
                ? 'w-full transition-all duration-500 ease-in-out'
                : 'w-0'
            )}
          />
          <Play />
          <span className="relative z-10 font-medium text-md">
            {t('common.launchVanilla')}
          </span>
        </Button>
      )}
      <div className="flex flex-col items-center gap-2">
        <Button
          className="relative overflow-hidden"
          disabled={!gamePath}
          onClick={() => {
            if (isRunning) {
              invoke('stop_game').then(() => refetch());
            } else {
              setModdedAnimating(true);
              launch();
              setTimeout(() => setModdedAnimating(false), 500);
            }
          }}
          size="lg"
        >
          <div
            className={cn(
              'absolute inset-0 bg-amber-200',
              moddedAnimating
                ? 'w-full transition-all duration-500 ease-in-out'
                : 'w-0'
            )}
          />
          <div className="relative z-10">
            {isRunning ? <Stop /> : <GameController />}
          </div>
          <span className="relative z-10 font-medium text-md">
            {isRunning ? t('common.stopGame') : t('common.launchModded')}
          </span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn('font-medium text-xs', {
                hidden: gamePath,
                'text-destructive': !gamePath,
              })}
            >
              {t('common.gameDetected')}
            </div>
          </TooltipTrigger>
          {gamePath && (
            <TooltipContent>
              <p>{t('common.gameInstalledAt', { path: gamePath })}</p>
            </TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
};
