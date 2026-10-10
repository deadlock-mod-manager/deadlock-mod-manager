import type { ModDto } from "@deadlock-mods/shared";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A mod card with a checkbox for picking it into a partial download. The
 * checkbox shows on hover, and on every card once anything is picked.
 */
export const SelectableModCard = ({
  mod,
  selectable,
  selected,
  selecting,
  onToggle,
  children,
}: {
  mod: ModDto;
  selectable: boolean;
  selected: boolean;
  /** Whether any mod is picked, which keeps every checkbox visible. */
  selecting: boolean;
  onToggle: (remoteId: string) => void;
  children: ReactNode;
}) => (
  <div
    className={cn(
      "group/select relative rounded-lg",
      selected && "ring-2 ring-primary",
    )}>
    {children}
    {selectable && (
      <Checkbox
        aria-label={mod.name}
        checked={selected}
        className={cn(
          "absolute top-2.5 left-2.5 z-20 h-5 w-5 border-white/70 bg-black/50 backdrop-blur-sm transition-opacity",
          !selecting &&
            "opacity-0 group-hover/select:opacity-100 focus-visible:opacity-100",
        )}
        onCheckedChange={() => onToggle(mod.remoteId)}
      />
    )}
  </div>
);
