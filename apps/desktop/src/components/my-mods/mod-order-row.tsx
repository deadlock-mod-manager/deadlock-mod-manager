import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronRight,
} from "@deadlock-mods/ui/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ModFileOrder,
  type OrderedVpkFile,
} from "@/components/my-mods/mod-file-order";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { sortFilesInAuthorOrder } from "@/lib/mods/vpk-load-order";
import { cn } from "@/lib/utils";
import type { LocalMod } from "@/types/mods";

const authorOrderFor = (mod: LocalMod, files: OrderedVpkFile[]) => {
  const names = new Set(files.map((file) => file.name));
  const treeFiles = (mod.installedFileTree?.files ?? []).filter((file) =>
    names.has(file.name),
  );
  if (treeFiles.length !== files.length) return undefined;
  return sortFilesInAuthorOrder(
    treeFiles,
    (mod.downloads ?? []).map((download) => download.name),
  ).map((file) => file.name);
};

const ModThumbnail = ({ mod }: { mod: LocalMod }) => {
  const coverImage = getModCoverImage(mod);
  return (
    <div className='flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary'>
      {coverImage ? (
        <img
          src={coverImage}
          alt=''
          className='h-full w-full object-cover'
          draggable={false}
        />
      ) : (
        <span className='font-medium text-muted-foreground text-xs'>
          {mod.name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
};

const ModSummary = ({ mod }: { mod: LocalMod }) => (
  <div className='min-w-0 flex-1'>
    <div className='flex min-w-0 items-center gap-2'>
      <p
        data-testid='ordered-mod-name'
        className='truncate font-medium text-sm'>
        {mod.name}
      </p>
      {mod.isAudio && <Badge variant='secondary'>Audio</Badge>}
      {mod.remoteUrl?.startsWith("local://") && (
        <Badge variant='outline'>Custom</Badge>
      )}
    </div>
    {mod.author && (
      <p className='truncate text-muted-foreground text-xs'>{mod.author}</p>
    )}
  </div>
);

interface IconActionProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}

const IconAction = ({
  label,
  disabled,
  onClick,
  children,
}: IconActionProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        aria-label={label}
        className='h-7 w-7 text-muted-foreground hover:text-foreground'
        disabled={disabled}
        onClick={onClick}
        size='icon'
        variant='ghost'>
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

// Positive when the mod moved up since the dialog opened.
const ShiftIndicator = ({ shift }: { shift: number }) => {
  const { t } = useTranslation();
  if (shift === 0) return null;
  const Arrow = shift > 0 ? ArrowUp : ArrowDown;
  return (
    <span
      className='flex shrink-0 items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 font-medium text-[11px] text-primary tabular-nums'
      title={t(shift > 0 ? "modOrdering.movedUp" : "modOrdering.movedDown", {
        count: Math.abs(shift),
      })}>
      <Arrow className='h-3 w-3' />
      {Math.abs(shift)}
    </span>
  );
};

interface SortableModRowProps {
  mod: LocalMod;
  position: number;
  total: number;
  shift: number;
  justDropped: boolean;
  dragDisabled: boolean;
  files?: OrderedVpkFile[];
  filesChanged: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onMove: (to: "top" | "bottom") => void;
  onFilesChange: (files: OrderedVpkFile[]) => void;
}

export const SortableModRow = ({
  mod,
  position,
  total,
  shift,
  justDropped,
  dragDisabled,
  files,
  filesChanged,
  expanded,
  onToggleExpanded,
  onMove,
  onFilesChange,
}: SortableModRowProps) => {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mod.remoteId, disabled: dragDisabled });
  const canExpand = !!files && files.length > 1;
  // Space and Enter on these buttons must not pick up the row.
  const keepKeys = {
    onKeyDown: (event: KeyboardEvent) => event.stopPropagation(),
  };

  return (
    <li
      ref={setNodeRef}
      data-mod-row={mod.remoteId}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-lg transition-colors duration-700 ease-out",
        isDragging
          ? "bg-foreground/5 opacity-30"
          : justDropped
            ? "bg-primary/15 duration-0"
            : expanded
              ? "bg-foreground/[0.04]"
              : "hover:bg-foreground/[0.04]",
      )}>
      <div
        className={cn(
          "flex items-center gap-3 px-2 py-2",
          !dragDisabled && "cursor-grab touch-none active:cursor-grabbing",
        )}
        {...listeners}>
        <button
          ref={setActivatorNodeRef}
          type='button'
          aria-label={t("modOrdering.dragMod", { name: mod.name })}
          className={cn(
            "w-8 shrink-0 rounded text-center font-semibold text-base tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            shift === 0 ? "text-muted-foreground" : "text-primary",
          )}
          {...attributes}>
          {position}
        </button>
        <ModThumbnail mod={mod} />
        <ModSummary mod={mod} />
        <ShiftIndicator shift={shift} />

        {canExpand && (
          <button
            type='button'
            aria-expanded={expanded}
            onClick={onToggleExpanded}
            {...keepKeys}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              filesChanged ? "text-primary" : "text-muted-foreground",
            )}>
            {t("modOrdering.files", { count: files.length })}
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200 ease-out",
                expanded && "rotate-90",
              )}
            />
          </button>
        )}

        <div
          className='flex shrink-0 cursor-default items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'
          {...keepKeys}>
          <IconAction
            label={t("modOrdering.moveToTop")}
            disabled={position === 1}
            onClick={() => onMove("top")}>
            <ArrowUpToLine className='h-3.5 w-3.5' />
          </IconAction>
          <IconAction
            label={t("modOrdering.moveToBottom")}
            disabled={position === total}
            onClick={() => onMove("bottom")}>
            <ArrowDownToLine className='h-3.5 w-3.5' />
          </IconAction>
        </div>
      </div>

      {expanded && files && (
        <ModFileOrder
          modName={mod.name}
          files={files}
          authorOrder={authorOrderFor(mod, files)}
          onChange={onFilesChange}
        />
      )}
    </li>
  );
};

export const DragPreview = ({
  mod,
  position,
}: {
  mod: LocalMod;
  position: number;
}) => (
  <div className='flex scale-[1.02] cursor-grabbing items-center gap-3 rounded-lg bg-popover px-2 py-2 shadow-2xl ring-1 ring-primary/30'>
    <span className='w-8 shrink-0 text-center font-semibold text-base text-primary tabular-nums'>
      {position}
    </span>
    <ModThumbnail mod={mod} />
    <ModSummary mod={mod} />
  </div>
);
