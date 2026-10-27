import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronRight,
  GripVertical,
} from "@deadlock-mods/ui/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
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
    <div className='flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary'>
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

interface SortableModRowProps {
  mod: LocalMod;
  position: number;
  total: number;
  moved: boolean;
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
  moved,
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
    transform,
    transition,
    isDragging,
  } = useSortable({ id: mod.remoteId, disabled: dragDisabled });
  const fileCount = files?.length ?? mod.installedVpks?.length ?? 0;
  const canExpand = !!files && files.length > 1;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group rounded-md border border-transparent transition-colors",
        isDragging
          ? "border-dashed border-border bg-muted/30 opacity-40"
          : "hover:bg-muted/40 focus-within:bg-muted/40",
        expanded && !isDragging && "border-border/60 bg-muted/20",
      )}>
      <div className='flex items-center gap-2 py-1.5 pr-1.5 pl-1'>
        <button
          type='button'
          aria-label={t("modOrdering.dragMod", { name: mod.name })}
          className={cn(
            "rounded p-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            dragDisabled
              ? "cursor-not-allowed opacity-40"
              : "cursor-grab touch-none hover:text-foreground active:cursor-grabbing",
          )}
          {...attributes}
          {...listeners}>
          <GripVertical className='h-4 w-4' />
        </button>
        <span
          className={cn(
            "w-7 shrink-0 text-right text-xs tabular-nums",
            moved ? "font-semibold text-primary" : "text-muted-foreground",
          )}>
          {position}
        </span>
        <ModThumbnail mod={mod} />
        <ModSummary mod={mod} />

        {canExpand ? (
          <button
            type='button'
            aria-expanded={expanded}
            onClick={onToggleExpanded}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              filesChanged ? "text-primary" : "text-muted-foreground",
            )}>
            {t("modOrdering.files", { count: fileCount })}
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className='shrink-0 px-2 text-muted-foreground text-xs'>
            {t("modOrdering.files", { count: fileCount })}
          </span>
        )}

        <div className='flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100'>
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
  <div className='flex cursor-grabbing items-center gap-2 rounded-md border border-primary/40 bg-popover py-1.5 pr-3 pl-1 shadow-xl'>
    <GripVertical className='m-1 h-4 w-4 text-foreground' />
    <span className='w-7 shrink-0 text-right font-semibold text-primary text-xs tabular-nums'>
      {position}
    </span>
    <ModThumbnail mod={mod} />
    <ModSummary mod={mod} />
  </div>
);
