import { Badge } from "@deadlock-mods/ui/components/badge";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryEntry } from "@/types/foundry";
import { chunkEntries, chunkSizeStyle } from "./foundry-chunks";

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
  editedPaths?: ReadonlySet<string>;
  /** The model marked as the skin's primary one, badged in the list. */
  primaryPath?: string | null;
}

const ROW_HEIGHT_PX = 42;

const EntryRow = memo(function EntryRow({
  entry,
  isSelected,
  isPrimary,
  isEdited,
  onSelect,
}: {
  entry: FoundryEntry;
  isSelected: boolean;
  isPrimary: boolean;
  isEdited: boolean;
  onSelect: (entry: FoundryEntry) => void;
}) {
  const { t } = useTranslation();
  return (
    <li>
      <button
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
          isSelected
            ? "border-primary bg-primary/10"
            : "border-transparent hover:bg-muted",
        )}
        onClick={() => onSelect(entry)}
        type='button'>
        <span className='flex min-w-0 flex-1 items-center gap-2'>
          <span className='truncate' title={entry.path}>
            {entry.filename}
          </span>
          {isPrimary && (
            <Badge className='shrink-0 text-[10px]' variant='secondary'>
              {t("foundry.primary")}
            </Badge>
          )}
        </span>
        <div className='flex shrink-0 items-center gap-2'>
          {isEdited && (
            <Badge className='text-[10px]'>{t("foundry.edited")}</Badge>
          )}
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
});

const EntryChunk = memo(function EntryChunk({
  entries,
  selectedPath,
  primaryPath,
  editedPaths,
  onSelect,
}: {
  entries: FoundryEntry[];
  selectedPath: string | null;
  primaryPath: string | null;
  editedPaths?: ReadonlySet<string>;
  onSelect: (entry: FoundryEntry) => void;
}) {
  return (
    <ul
      className='space-y-1 [content-visibility:auto]'
      style={chunkSizeStyle(entries.length, ROW_HEIGHT_PX)}>
      {entries.map((entry) => (
        <EntryRow
          entry={entry}
          isEdited={editedPaths?.has(entry.path) ?? false}
          isPrimary={entry.path === primaryPath}
          isSelected={entry.path === selectedPath}
          key={entry.path}
          onSelect={onSelect}
        />
      ))}
    </ul>
  );
});

/**
 * A selectable list of VPK entries for a Foundry tab. Selecting an entry drives
 * the center preview.
 */
export const FoundryEntryList = ({
  entries,
  selectedPath,
  onSelect,
  emptyLabel,
  editedPaths,
  primaryPath = null,
}: FoundryEntryListProps) => {
  const chunks = useMemo(() => chunkEntries(entries), [entries]);

  if (entries.length === 0) {
    return (
      <p className='px-2 py-6 text-center text-muted-foreground text-sm'>
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className='space-y-1'>
      {chunks.map((chunk) => (
        <EntryChunk
          editedPaths={editedPaths}
          entries={chunk.entries}
          key={chunk.entries[0].path}
          onSelect={onSelect}
          primaryPath={primaryPath}
          selectedPath={
            selectedPath !== null && chunk.paths.has(selectedPath)
              ? selectedPath
              : null
          }
        />
      ))}
    </div>
  );
};

export { formatBytes };
