import { cn } from "@deadlock-mods/ui/lib/utils";
import {
  CircleHalfIcon,
  CubeIcon,
  FileIcon,
  ImageIcon,
  MusicNotesIcon,
  StarIcon,
} from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { FoundryCategory, FoundryEntry } from "@/types/foundry";
import { chunkEntries, chunkSizeStyle } from "./foundry-chunks";

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const CATEGORY_ICONS = {
  model: CubeIcon,
  material: CircleHalfIcon,
  texture: ImageIcon,
  card: ImageIcon,
  sound: MusicNotesIcon,
  other: FileIcon,
} satisfies Record<FoundryCategory, React.ElementType>;

interface FoundryEntryListProps {
  entries: FoundryEntry[];
  selectedPath: string | null;
  onSelect: (entry: FoundryEntry) => void;
  editedPaths?: ReadonlySet<string>;
  /** The model marked as the skin's primary one, badged in the list. */
  primaryPath?: string | null;
}

const ROW_HEIGHT_PX = 30;

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
  const Icon = CATEGORY_ICONS[entry.category];
  return (
    <li>
      <button
        aria-current={isSelected}
        className={cn(
          "flex h-[29px] w-full items-center gap-[9px] rounded-md border px-2 text-left transition-colors",
          isSelected
            ? "border-primary/25 bg-primary/[0.07]"
            : "border-transparent hover:bg-muted",
        )}
        onClick={() => onSelect(entry)}
        title={entry.path}
        type='button'>
        <Icon
          className={cn(
            "h-[15px] w-[15px] shrink-0",
            isSelected ? "text-primary" : "text-muted-foreground",
          )}
        />
        <span
          className={cn(
            "min-w-0 truncate font-mono text-xs",
            isSelected && "font-semibold",
          )}>
          {entry.filename}
        </span>
        {isPrimary && (
          <span className='flex shrink-0 items-center gap-[3px] rounded bg-secondary px-[5px] py-px font-semibold text-[9px] text-secondary-foreground'>
            <StarIcon className='h-[9px] w-[9px]' weight='bold' />
            {t("foundry.primary")}
          </span>
        )}
        <span className='flex-1' />
        {isEdited && (
          <span
            aria-label={t("foundry.edited")}
            className='h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400'
          />
        )}
        <span className='shrink-0 font-mono text-[10px] text-muted-foreground/70'>
          {formatBytes(entry.size)}
        </span>
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
      className='space-y-px [content-visibility:auto]'
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
 * A selectable list of VPK entries. Selecting an entry drives the center
 * preview.
 */
export const FoundryEntryList = ({
  entries,
  selectedPath,
  onSelect,
  editedPaths,
  primaryPath = null,
}: FoundryEntryListProps) => {
  const chunks = useMemo(() => chunkEntries(entries), [entries]);

  return (
    <div className='space-y-px'>
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
