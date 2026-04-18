import { XIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

interface FilterChipProps {
  label: string;
  value: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
  accent?: "default" | "primary";
}

const FilterChip = ({
  label,
  value,
  onRemove,
  removeLabel,
  accent = "default",
}: FilterChipProps) => {
  return (
    <span
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-1 text-xs transition-colors",
        accent === "primary"
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border/60 bg-background/60 text-foreground/90 hover:bg-background",
      )}>
      <span
        className={cn(
          "text-[11px] font-medium",
          accent === "primary" ? "text-primary/80" : "text-muted-foreground",
        )}>
        {label}
      </span>
      <span className='inline-flex items-center gap-1 font-medium'>
        {value}
      </span>
      <button
        aria-label={removeLabel}
        className={cn(
          "ml-0.5 inline-flex size-4 items-center justify-center rounded-full transition-colors",
          "text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        )}
        onClick={onRemove}
        type='button'>
        <XIcon className='size-3' weight='bold' />
      </button>
    </span>
  );
};

export default FilterChip;
