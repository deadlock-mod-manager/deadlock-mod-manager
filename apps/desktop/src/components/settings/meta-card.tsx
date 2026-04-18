import type { LucideIcon } from "@deadlock-mods/ui/icons";
import { cn } from "@/lib/utils";

export const MetaCard = ({
  icon: Icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    aria-checked={selected}
    aria-label={label}
    className={cn(
      "group relative flex items-start gap-3 rounded-lg border p-4 text-left transition-all",
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
        "mt-0.5 h-4 w-4 shrink-0",
        selected ? "text-primary" : "text-muted-foreground",
      )}
    />
    <div className='flex flex-col gap-1'>
      <span className='font-semibold text-sm'>{label}</span>
      <span
        className={cn(
          "text-xs",
          selected ? "text-primary/70" : "text-muted-foreground",
        )}>
        {description}
      </span>
    </div>
  </button>
);
