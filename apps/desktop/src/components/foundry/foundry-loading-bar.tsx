import { cn } from "@deadlock-mods/ui/lib/utils";

/**
 * An indeterminate progress bar: a gold highlight sweeping across a track.
 *
 * Parsing a pak and decoding a model report no progress, so this deliberately
 * does not pretend to know how far along the work is — it only shows that work
 * is happening. A bar that sat still, or one that faked a percentage, would both
 * be worse.
 */
export const FoundryLoadingBar = ({ className }: { className?: string }) => (
  <div
    aria-busy='true'
    className={cn(
      "relative h-1 w-full overflow-hidden rounded-full bg-primary/15",
      className,
    )}
    role='progressbar'>
    <div className='foundry-sweep absolute inset-y-0 left-0 w-1/4 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent' />
  </div>
);
