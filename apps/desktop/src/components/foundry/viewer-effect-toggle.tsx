import { cn } from "@deadlock-mods/ui/lib/utils";
import { type Icon } from "@phosphor-icons/react";

export const EffectToggle = ({
  on,
  onChange,
  icon: ToggleIcon,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  icon: Icon;
  label: string;
}) => (
  <button
    type='button'
    aria-label={label}
    aria-pressed={on}
    title={label}
    onClick={() => onChange(!on)}
    className={cn(
      "flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      on
        ? "border-primary/40 bg-primary/10 text-primary"
        : "bg-background text-muted-foreground hover:text-foreground",
    )}>
    <ToggleIcon className='size-3.5' weight={on ? "fill" : "regular"} />
    <span className='hidden @[36rem]/transport:inline'>{label}</span>
  </button>
);
