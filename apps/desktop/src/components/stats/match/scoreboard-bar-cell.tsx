import { Crown } from "@deadlock-mods/ui/icons";
import { tint } from "@/components/stats/chart-fx";
import { formatCompact } from "@/lib/stats/format";

export const BarCell = ({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) => (
  <div className='flex flex-col gap-1.5'>
    <span className='flex items-center gap-1.5 font-mono font-semibold text-[12.5px] tabular-nums'>
      {formatCompact(value)}
      {value === max && value > 0 && (
        <Crown aria-hidden className='h-3 w-3 text-primary' />
      )}
    </span>
    <div className='h-1 w-full max-w-[120px] overflow-hidden rounded-full bg-foreground/5'>
      <div
        className='h-full rounded-full'
        style={{
          width: `${max > 0 ? (value / max) * 100 : 0}%`,
          backgroundColor: value === max ? color : tint(color, 60),
        }}
      />
    </div>
  </div>
);
