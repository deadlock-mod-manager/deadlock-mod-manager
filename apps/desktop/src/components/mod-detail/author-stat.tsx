import { ChevronRight } from "@deadlock-mods/ui/icons";
import type { ReactNode } from "react";

interface AuthorStatProps {
  icon: ReactNode;
  label: string;
  name: string;
  onSelect: () => void;
  profileLabel: string;
}

export const AuthorStat = ({
  icon,
  label,
  name,
  onSelect,
  profileLabel,
}: AuthorStatProps) => {
  return (
    <button
      aria-label={`${profileLabel}: ${name}`}
      className='group flex w-full items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
      onClick={onSelect}
      type='button'>
      <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground transition-colors group-hover:text-foreground'>
        {icon}
      </span>
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='text-muted-foreground text-xs uppercase tracking-wide'>
          {label}
        </span>
        <span className='truncate font-medium text-foreground text-sm'>
          {name}
        </span>
      </span>
      <span className='flex shrink-0 items-center gap-1 text-muted-foreground text-xs transition-colors group-hover:text-foreground'>
        {profileLabel}
        <ChevronRight className='h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5' />
      </span>
    </button>
  );
};
