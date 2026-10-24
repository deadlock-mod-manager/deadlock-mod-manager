import type { LucideIcon } from "@deadlock-mods/ui/icons";
import { cn } from "@/lib/utils";

export const MetaCard = ({
  icon: Icon,
  label,
  description,
  badge,
  selected,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  badge?: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    aria-checked={selected}
    aria-label={label}
    className={cn(
      "group relative flex items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
      selected
        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
        : "border-border hover:border-primary/40 hover:bg-accent/40",
    )}
    onClick={onClick}
    role='radio'
    type='button'>
    <Icon
      className={cn(
        "h-4 w-4 shrink-0",
        selected ? "text-primary" : "text-muted-foreground",
      )}
    />
    <div className='flex min-w-0 flex-col'>
      <span className='flex items-center gap-1.5'>
        <span className='font-semibold text-sm'>{label}</span>
        {badge ? (
          <span className='rounded-sm bg-primary/15 px-1.5 py-px font-medium text-[10px] text-primary uppercase tracking-wide'>
            {badge}
          </span>
        ) : null}
      </span>
      <span
        className={cn(
          "truncate text-xs",
          selected ? "text-primary/70" : "text-muted-foreground",
        )}>
        {description}
      </span>
    </div>
  </button>
);
