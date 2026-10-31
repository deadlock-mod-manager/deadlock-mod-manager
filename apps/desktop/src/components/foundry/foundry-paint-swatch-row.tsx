import { cn } from "@deadlock-mods/ui/lib/utils";

export const SwatchRow = ({
  label,
  colors = [],
  current,
  loading,
  onPick,
}: {
  label: string;
  colors?: readonly string[];
  current?: string;
  loading?: boolean;
  onPick?: (color: string) => void;
}) => (
  <div className='space-y-1.5'>
    <p className='text-[11px] text-muted-foreground'>{label}</p>
    <div className='flex flex-wrap gap-1.5'>
      {loading
        ? ["a", "b", "c", "d", "e", "f"].map((slot) => (
            <span
              className='h-6 w-6 animate-pulse rounded-[5px] bg-muted'
              key={slot}
            />
          ))
        : colors.map((color) => (
            <button
              aria-label={color}
              className={cn(
                "h-6 w-6 rounded-[5px] border border-white/10 transition-transform hover:scale-110",
                color === current &&
                  "ring-2 ring-primary ring-offset-1 ring-offset-card",
              )}
              key={color}
              onClick={() => onPick?.(color)}
              style={{ backgroundColor: color }}
              title={color}
              type='button'
            />
          ))}
    </div>
  </div>
);
