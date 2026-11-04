import { cn } from "@deadlock-mods/ui/lib/utils";

export const Swatch = ({
  color,
  className,
}: {
  color: string;
  className?: string;
}) => (
  <span
    className={cn(
      "inline-block h-3.5 w-3.5 shrink-0 rounded border border-white/15",
      className,
    )}
    style={{ backgroundColor: color }}
  />
);
