import { Button } from "@deadlock-mods/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { Kbd } from "@deadlock-mods/ui/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  Copy,
  Download,
  Ellipsis,
  Loader2,
  Power,
  PowerOff,
  Trash2,
  X,
} from "@deadlock-mods/ui/icons";
import { useTranslation } from "react-i18next";

import { MoveToModGroup } from "@/components/my-mods/move-to-mod-group";

type LibrarySelectionBarProps = {
  count: number;
  selectedIds: readonly string[];
  matchingCount: number;
  allMatchingSelected: boolean;
  enableCount: number;
  disableCount: number;
  updateCount: number;
  busy: boolean;
  working: boolean;
  onToggleAll: () => void;
  onExit: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onUpdate: () => void;
  onCopy: () => void;
  onDelete: () => void;
};

export const LibrarySelectionBar = ({
  count,
  selectedIds,
  matchingCount,
  allMatchingSelected,
  enableCount,
  disableCount,
  updateCount,
  busy,
  working,
  onToggleAll,
  onExit,
  onEnable,
  onDisable,
  onUpdate,
  onCopy,
  onDelete,
}: LibrarySelectionBarProps) => {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t("myMods.selection.start")}
      role='region'
      className='pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-2xl'>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t("myMods.selection.done")}
            className='size-8 text-muted-foreground'
            disabled={busy}
            icon={<X className='size-4' />}
            onClick={onExit}
            size='icon'
            variant='ghost'
          />
        </TooltipTrigger>
        <TooltipContent className='flex items-center gap-2'>
          {t("myMods.selection.done")}
          <Kbd>Esc</Kbd>
        </TooltipContent>
      </Tooltip>
      <span
        aria-live='polite'
        className='whitespace-nowrap px-1.5 text-sm font-medium tabular-nums'>
        {t("myMods.selection.count", { count })}
      </span>
      <Button
        className='whitespace-nowrap'
        disabled={busy || matchingCount === 0}
        onClick={onToggleAll}
        size='sm'
        variant='ghost'>
        {allMatchingSelected
          ? t("myMods.selection.deselectAll")
          : t("myMods.selection.selectAll", { count: matchingCount })}
      </Button>
      {working ? (
        <span
          role='status'
          className='flex items-center gap-2 whitespace-nowrap px-3 text-sm text-muted-foreground'>
          <Loader2 aria-hidden className='size-4 animate-spin' />
          {t("myMods.selection.working")}
        </span>
      ) : (
        count > 0 && (
          <>
            <span aria-hidden className='mx-1 h-5 w-px shrink-0 bg-border' />
            {updateCount > 0 && (
              <Button
                className='whitespace-nowrap'
                disabled={busy}
                icon={<Download className='size-4' />}
                onClick={onUpdate}
                size='sm'
                variant='outline'>
                {t("myMods.selection.update", { count: updateCount })}
              </Button>
            )}
            {disableCount > 0 && (
              <Button
                className='whitespace-nowrap'
                disabled={busy}
                icon={<PowerOff className='size-4' />}
                onClick={onDisable}
                size='sm'
                variant='outline'>
                {t("myMods.selection.disableCount", { count: disableCount })}
              </Button>
            )}
            {enableCount > 0 && (
              <Button
                className='whitespace-nowrap'
                disabled={busy}
                icon={<Power className='size-4' />}
                onClick={onEnable}
                size='sm'>
                {t("myMods.selection.enableCount", { count: enableCount })}
              </Button>
            )}
            <MoveToModGroup modIds={selectedIds} disabled={busy} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("myMods.selection.more")}
                  className='size-8'
                  disabled={busy}
                  icon={<Ellipsis className='size-4' />}
                  size='icon'
                  variant='ghost'
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' side='top'>
                <DropdownMenuItem onSelect={onCopy}>
                  <Copy className='size-4' />
                  {t("myMods.selection.copy")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className='text-destructive focus:text-destructive'
                  onSelect={onDelete}>
                  <Trash2 className='size-4' />
                  {t("myMods.selection.delete", { count })}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )
      )}
    </div>
  );
};
