import { useLaunch } from '@/hooks/use-launch';
import { usePersistedStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { Check, GameController, Play, X } from '@phosphor-icons/react';
import DevTools from './helpers/dev-tools';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
export const Toolbar = () => {
  const { gamePath } = usePersistedStore();
  const { launch } = useLaunch();
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
      <Button size="lg" variant="ghost" disabled={!gamePath} onClick={() => launch(true)}>
        <Play />
        <span className="font-medium text-md">Launch Vanilla</span>
      </Button>
      <Button size="lg" disabled={!gamePath} onClick={() => launch()}>
        <GameController />
        <span className="font-medium text-md">Launch Modded</span>
      </Button>
    </div>
  );
};
