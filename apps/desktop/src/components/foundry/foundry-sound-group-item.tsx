import { cn } from "@deadlock-mods/ui/lib/utils";
import type { FoundrySoundGroup } from "@/types/foundry";
import { KIND_ICONS } from "./foundry-sound-utils";

export const SoundGroupItem = ({
  group,
  activeId,
  editedPaths,
  onSelect,
}: {
  group: FoundrySoundGroup;
  activeId: string | null;
  editedPaths: ReadonlySet<string>;
  onSelect: (id: string) => void;
}) => {
  const Icon = KIND_ICONS[group.kind];
  const active = group.id === activeId;
  const edited = group.entries.some((entry) => editedPaths.has(entry.path));
  return (
    <button
      aria-current={active}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
        active ? "bg-secondary" : "hover:bg-muted",
      )}
      onClick={() => onSelect(group.id)}
      type='button'>
      <span
        className={cn(
          "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          active ? "bg-primary/15 text-primary" : "bg-muted text-foreground/80",
        )}>
        {group.slot !== null ? (
          <span className='font-mono font-semibold text-xs'>{group.slot}</span>
        ) : (
          <Icon className='h-[15px] w-[15px]' />
        )}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[13px]",
          active && "font-semibold",
        )}>
        {group.label}
      </span>
      {edited && (
        <span className='h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400' />
      )}
      <span className='shrink-0 font-mono text-[10px] text-muted-foreground/60'>
        {group.entries.length.toLocaleString()}
      </span>
    </button>
  );
};
