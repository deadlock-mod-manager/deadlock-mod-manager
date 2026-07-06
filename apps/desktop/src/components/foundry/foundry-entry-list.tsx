import { Badge } from "@deadlock-mods/ui/components/badge";
import { cn } from "@deadlock-mods/ui/lib/utils";
import type { FoundryEntry } from "@/types/foundry";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface FoundryEntryListProps {
  entries: FoundryEntry[];
  selectedPath: string | null;
  onSelect: (entry: FoundryEntry) => void;
  emptyLabel: string;
}

/**
 * A selectable list of VPK entries for a Foundry tab. Selecting an entry drives
 * the center preview.
 */
export const FoundryEntryList = ({
  entries,
  selectedPath,
  onSelect,
  emptyLabel,
}: FoundryEntryListProps) => {
  if (entries.length === 0) {
    return (
      <p className='px-2 py-6 text-center text-muted-foreground text-sm'>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className='space-y-1'>
      {entries.map((entry) => {
        const isSelected = entry.path === selectedPath;
        return (
          <li key={entry.path}>
            <button
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-transparent hover:bg-muted",
              )}
              onClick={() => onSelect(entry)}
              type='button'>
              <span className='min-w-0 flex-1 truncate' title={entry.path}>
                {entry.filename}
              </span>
              <div className='flex shrink-0 items-center gap-2'>
                <span className='text-muted-foreground text-xs'>
                  {formatBytes(entry.size)}
                </span>
                <Badge className='text-[10px]' variant='outline'>
                  {entry.ext}
                </Badge>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

export { formatBytes };
