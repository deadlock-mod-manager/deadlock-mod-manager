import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface CapacityBarProps {
  current: number;
  max: number;
  className?: string;
}

const toneFor = (ratio: number): string => {
  if (ratio >= 1) return "bg-rose-500";
  if (ratio >= 0.75) return "bg-amber-400";
  if (ratio >= 0.4) return "bg-emerald-400";
  return "bg-emerald-500/80";
};

const CapacityBar = ({ current, max, className }: CapacityBarProps) => {
  const safeMax = Math.max(0, max);
  const safeCurrent = Math.max(0, Math.min(current, safeMax));
  const ratio = safeMax > 0 ? safeCurrent / safeMax : 0;
  const pct = `${Math.round(ratio * 100)}%`;

  return (
    <div
      aria-hidden
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-muted/60 shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]",
        className,
      )}>
      <div
        className={cn(
          "h-full rounded-full shadow-[0_0_6px_rgb(0_0_0/0.25)] transition-all duration-500 ease-out",
          toneFor(ratio),
        )}
        style={{ width: pct } as CSSProperties}
      />
    </div>
  );
};

export default CapacityBar;
