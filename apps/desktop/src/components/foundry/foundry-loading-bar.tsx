import { cn } from "@deadlock-mods/ui/lib/utils";

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
