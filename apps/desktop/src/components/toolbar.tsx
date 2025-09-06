import { Check, GameController, Play, Stop, X } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { useQuery } from 'react-query';
import { useLaunch } from '@/hooks/use-launch';
import { isGameRunning } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import DevTools from './helpers/dev-tools';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export const Toolbar = () => {
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
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn('flex flex-row items-center gap-2', {
                'text-green-500': gamePath,
                'text-red-500': !gamePath,
              })}
            >
              <div className="font-medium text-sm">Game Detected</div>
              <div className="">{gamePath ? <Check /> : <X />}</div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Game installed at {gamePath}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <DevTools />

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
            Launch Vanilla
          </span>
        </Button>
      )}
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
          {isRunning ? 'Stop Game' : 'Launch Modded'}
        </span>
      </Button>
    </div>
  );
};
