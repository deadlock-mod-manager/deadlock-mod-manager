import { Card } from "@deadlock-mods/ui/components/card";
import { Skeleton } from "@deadlock-mods/ui/components/skeleton";
import { TrendingDown, TrendingUp } from "@deadlock-mods/ui/icons";
import { cn } from "@/lib/utils";

interface StatTileProps {
  label: string;
  value: string;
  /** Signed change against a named baseline; omitted when there is nothing to compare. */
  delta?: {
    text: string;
    /** Whether the change is an improvement - not whether it points up. */
    isGood: boolean;
    caption: string;
  };
  hint?: string;
}

export const StatTile = ({ label, value, delta, hint }: StatTileProps) => (
  <Card className='flex flex-col gap-1 p-4 shadow-none'>
    <span className='text-muted-foreground text-xs'>{label}</span>
    <span className='font-semibold text-2xl leading-none'>{value}</span>
    {delta ? (
      <span
        className={cn(
          "flex items-center gap-1 text-xs",
          delta.isGood ? "text-emerald-500" : "text-destructive",
        )}>
        {delta.isGood ? (
          <TrendingUp className='h-3 w-3 shrink-0' />
        ) : (
          <TrendingDown className='h-3 w-3 shrink-0' />
        )}
        <span className='font-medium'>{delta.text}</span>
        <span className='truncate text-muted-foreground'>{delta.caption}</span>
      </span>
    ) : (
      hint && (
        <span className='truncate text-muted-foreground text-xs'>{hint}</span>
      )
    )}
  </Card>
);

export const StatTileSkeleton = () => (
  <Card className='flex flex-col gap-2 p-4 shadow-none'>
    <Skeleton className='h-3 w-20' />
    <Skeleton className='h-6 w-16' />
    <Skeleton className='h-3 w-24' />
  </Card>
);
