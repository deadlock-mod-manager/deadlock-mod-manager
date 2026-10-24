import { cn } from "@deadlock-mods/ui/lib/utils";
import { FoundryLoadingBar } from "./foundry-loading-bar";

/**
 * The empty stage a model is about to stand on: the viewer's floor light, a
 * status line, and an indeterminate bar. It sits where the model will land, so
 * the model can fade in over it.
 */
export const ModelLoadingStage = ({
  status,
  className,
}: {
  status: string;
  className?: string;
}) => (
  <div className={cn("absolute inset-0 overflow-hidden", className)}>
    <div
      aria-hidden
      className='absolute bottom-[18%] left-1/2 h-24 w-[70%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,oklch(0.78_0.08_85/0.16),transparent)]'
    />
    <div className='absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 p-6'>
      <p role='status' className='text-muted-foreground text-xs'>
        {status}
      </p>
      <FoundryLoadingBar className='max-w-xs' />
    </div>
  </div>
);
