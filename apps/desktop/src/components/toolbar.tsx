import { useLaunch } from '@/hooks/use-launch';
import { isGameRunning } from '@/lib/api';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Check, GameController, Play, Stop, X } from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery } from 'react-query';
import DevTools from './helpers/dev-tools';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export const Toolbar = () => {
  const { gamePath } = usePersistedStore();
  const { launch } = useLaunch();

  const { data: isRunning, refetch } = useQuery({
    queryKey: ['is-game-running'],
    queryFn: () => isGameRunning(),
    refetchInterval: 5000
  });

  return (
    <div className="flex flex-row items-center justify-end w-full gap-4 py-4 px-8 border-b">
      <div className="flex flex-row items-center gap-2 px-4 flex-grow justify-start">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn('flex flex-row items-center gap-2', {
                'text-green-500': gamePath,
                'text-red-500': !gamePath
              })}
            >
              <div className="text-sm font-medium">Game Detected</div>
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
        <Button size="lg" variant="ghost" disabled={!gamePath} onClick={() => launch(true)}>
          <Play />
          <span className="font-medium text-md">Launch Vanilla</span>
        </Button>
      )}
      <Button
        size="lg"
        disabled={!gamePath}
        onClick={() => (isRunning ? invoke('stop_game').then(() => refetch()) : launch())}
      >
        {isRunning ? <Stop /> : <GameController />}
        <span className="font-medium text-md">{isRunning ? 'Stop Game' : 'Launch Modded'}</span>
      </Button>
    </div>
  );
};
