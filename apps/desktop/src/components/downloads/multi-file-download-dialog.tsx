import { Button } from "@deadlock-mods/ui/components/button";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Download, HardDrive } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { useMutation } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  REQUIRED_SECTION_ID,
  componentSelectionModel,
  fileSelectionModel,
  isSelectionValid,
  selectedFiles,
  toggleSelection,
  type SelectionRow,
} from "@/lib/download-selection";
import { formatSize } from "@/lib/utils";
import type { NativeSourceInstallation } from "@/types/generated/NativeSourceInstallation";
import type { ModDownloadItem } from "@/types/mods";

interface BaseProps {
  readonly files: ModDownloadItem[];
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly modName: string;
  readonly isDownloading?: boolean;
  readonly isExtracting?: boolean;
  readonly downloadPercentage?: number;
}

interface FileModeProps {
  readonly onDownload: (selectedFiles: ModDownloadItem[]) => void;
  readonly components?: never;
}

/**
 * A custom source that declares components, required sets and choice groups.
 * `files` are the release's artifacts, which the components point into.
 */
interface ComponentModeProps {
  readonly components: {
    readonly installation: NativeSourceInstallation;
    readonly selectedComponentIds?: string[];
    readonly onConfirm: (componentIds: string[]) => Promise<void>;
  };
  readonly onDownload?: never;
}

type MultiFileDownloadDialogProps = BaseProps &
  (FileModeProps | ComponentModeProps);

const latest = (dates: (Date | null | undefined)[]) =>
  dates.reduce<Date | null>(
    (newest, date) => (date && (!newest || date > newest) ? date : newest),
    null,
  );

export function MultiFileDownloadDialog({
  files,
  isOpen,
  onClose,
  modName,
  isDownloading = false,
  isExtracting = false,
  downloadPercentage = 0,
  ...mode
}: MultiFileDownloadDialogProps) {
  const { t } = useTranslation();
  const { components } = mode;
  const model = useMemo(
    () =>
      components
        ? componentSelectionModel(
            components.installation,
            files,
            components.selectedComponentIds,
          )
        : fileSelectionModel(files),
    [components, files],
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(model.initialIds),
  );
  const confirmComponents = useMutation({
    mutationFn: (ids: string[]) =>
      components ? components.onConfirm(ids) : Promise.resolve(),
    meta: { skipGlobalErrorHandler: true },
  });

  const isComponentMode = !!components;
  const isBusy = isDownloading || isExtracting || confirmComponents.isPending;
  const totalSize = selectedFiles(model, selected).reduce(
    (sum, file) => sum + (file.size || 0),
    0,
  );
  const allSelected =
    model.rows.length > 0 && selected.size === model.rows.length;
  // Components cut from one archive would each repeat its name and size.
  const showRowFiles =
    !isComponentMode ||
    new Set(model.rows.flatMap((row) => row.files.map((file) => file.url)))
      .size > 1;

  if (!isComponentMode && files.length <= 1) {
    return null;
  }

  const handleToggleAll = () =>
    setSelected(
      allSelected ? new Set() : new Set(model.rows.map((row) => row.id)),
    );

  // Files arrive in the author's order, which is also the order their VPKs
  // load in, so the list keeps it.
  const handleDownload = () => {
    if (mode.components) {
      confirmComponents.mutate([...selected]);
      return;
    }
    mode.onDownload(selectedFiles(model, selected));
  };

  const handleClose = (open: boolean) => {
    if (!open && !confirmComponents.isPending) {
      onClose();
    }
  };

  const renderRow = (row: SelectionRow, showRequiredBadge: boolean) => {
    const isSelected = selected.has(row.id);
    const isLocked = model.lockedIds.includes(row.id);
    const checkboxId = `download-option-${row.id}`;
    const size = row.files.reduce((sum, file) => sum + (file.size || 0), 0);
    const updatedAt = latest(row.files.map((file) => file.updatedAt));
    const createdAt = latest(row.files.map((file) => file.createdAt));
    // A component lists the archives it comes from; a file shows its own notes.
    const description = isComponentMode
      ? row.files.map((file) => file.name).join(", ")
      : row.files[0]?.description;
    const timestamp = updatedAt ?? createdAt;
    const timestampLabel = updatedAt
      ? t("downloads.updatedAgo", { when: formatDistanceToNow(updatedAt) })
      : createdAt
        ? t("downloads.createdAgo", { when: formatDistanceToNow(createdAt) })
        : null;
    const timestampTooltip = updatedAt
      ? t("downloads.updatedAt", {
          date: format(updatedAt, "dd-MM-yyyy HH:mm"),
        })
      : createdAt
        ? t("downloads.createdAt", {
            date: format(createdAt, "dd-MM-yyyy HH:mm"),
          })
        : null;

    return (
      <li key={row.id}>
        <label
          className={cn(
            "flex w-full cursor-pointer items-start gap-3 px-3 py-3 text-left transition-colors items-center",
            "hover:bg-muted/60 has-[:focus-visible]:bg-muted/60",
            isSelected && "bg-primary/5 hover:bg-primary/10",
            isLocked && "pointer-events-none",
            isBusy && "pointer-events-none opacity-60",
          )}
          htmlFor={checkboxId}>
          <span className='flex h-lh items-center'>
            <Checkbox
              checked={isSelected}
              disabled={isBusy || isLocked}
              id={checkboxId}
              onCheckedChange={(checked) =>
                setSelected((previous) =>
                  toggleSelection(model, previous, row.id, checked === true),
                )
              }
            />
          </span>
          <div className='min-w-0 flex-1'>
            <p
              className='truncate font-medium text-foreground text-sm'
              title={row.label}>
              {row.label}
              {isLocked && showRequiredBadge && (
                <span className='ml-2 font-normal text-muted-foreground text-xs'>
                  {t("modSources.required")}
                </span>
              )}
            </p>
            {showRowFiles && description && (
              <p className='mt-0.5 line-clamp-2 text-muted-foreground text-xs'>
                {description}
              </p>
            )}
            {showRowFiles && row.files.length > 0 && (
              <div className='mt-1 flex items-center gap-3 text-muted-foreground text-xs'>
                <span className='font-medium tabular-nums'>
                  {formatSize(size)}
                </span>
                {timestamp && timestampLabel && (
                  <>
                    {timestampTooltip ? (
                      <span onClick={(e) => e.stopPropagation()}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>{timestampLabel}</span>
                          </TooltipTrigger>
                          <TooltipContent>{timestampTooltip}</TooltipContent>
                        </Tooltip>
                      </span>
                    ) : (
                      <span>{timestampLabel}</span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </label>
      </li>
    );
  };

  return (
    <Dialog onOpenChange={handleClose} open={isOpen}>
      <DialogContent
        className='flex max-h-[80vh] max-w-2xl flex-col gap-4'
        onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <div className='mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10'>
            <Download className='h-5 w-5 text-primary' />
          </div>
          <DialogTitle>
            {isComponentMode
              ? t("modSources.selectComponents")
              : t("downloads.selectFilesToDownload")}
          </DialogTitle>
          <DialogDescription>
            {isComponentMode
              ? t("modSources.selectComponentsDescription", { modName })
              : t("notifications.modContainsFiles", {
                  modName,
                  fileCount: files.length,
                })}
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 flex-col overflow-y-auto rounded-md border bg-muted/40'>
          {model.sections.map((section) => {
            const count = section.rowIds.filter((id) =>
              selected.has(id),
            ).length;
            const isRequiredSection = section.id === REQUIRED_SECTION_ID;
            return (
              <section
                className='shrink-0 border-b last:border-b-0'
                key={section.id}>
                <div className='flex items-center justify-between gap-2 border-b px-3 py-2'>
                  {section.label === null && !isRequiredSection ? (
                    <div className='flex items-center gap-3'>
                      <Checkbox
                        aria-label={
                          allSelected
                            ? t("downloads.selectNone")
                            : t("downloads.selectAll")
                        }
                        checked={
                          allSelected
                            ? true
                            : selected.size === 0
                              ? false
                              : "indeterminate"
                        }
                        disabled={isBusy}
                        id='select-all-files'
                        onCheckedChange={handleToggleAll}
                      />
                      <label
                        className='cursor-pointer font-medium text-muted-foreground text-xs uppercase tracking-wide'
                        htmlFor='select-all-files'>
                        {allSelected
                          ? t("downloads.selectNone")
                          : t("downloads.selectAll")}
                      </label>
                    </div>
                  ) : (
                    <span className='font-medium text-muted-foreground text-xs uppercase tracking-wide'>
                      {isRequiredSection
                        ? t("modSources.required")
                        : section.label}
                      <span className='ml-2 normal-case tracking-normal'>
                        {isRequiredSection
                          ? t("modSources.selectComponentsRequiredHint")
                          : section.minSelections === section.maxSelections
                            ? t("modSources.componentGroupExact", {
                                count: section.maxSelections,
                              })
                            : t("modSources.componentGroup", {
                                min: section.minSelections,
                                max: section.maxSelections,
                              })}
                      </span>
                    </span>
                  )}
                  <span className='font-mono text-muted-foreground text-xs tabular-nums'>
                    {count}/{section.rowIds.length}
                  </span>
                </div>
                <ul className='divide-y divide-border/60' role='list'>
                  {section.rowIds.flatMap((id) => {
                    const row = model.rows.find(
                      (candidate) => candidate.id === id,
                    );
                    return row ? [renderRow(row, !isRequiredSection)] : [];
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        {confirmComponents.error && (
          <p role='alert' className='text-sm text-destructive'>
            {confirmComponents.error.message}
          </p>
        )}

        <DialogFooter className='flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
            <HardDrive className='h-3.5 w-3.5' />
            <span className='tabular-nums'>
              {t("downloads.total")}: {formatSize(totalSize)}
            </span>
          </div>
          <div className='flex gap-2 sm:gap-2'>
            <Button disabled={isBusy} onClick={onClose} variant='outline'>
              {t("common.cancel")}
            </Button>
            <Button
              className='min-w-32'
              disabled={!isSelectionValid(model, selected) || isBusy}
              icon={<Download className='h-4 w-4' />}
              isLoading={isBusy}
              onClick={handleDownload}>
              {isExtracting
                ? t("modStatus.extracting")
                : isDownloading
                  ? t("downloads.downloadingPercent", {
                      percent: Math.round(downloadPercentage),
                    })
                  : isComponentMode
                    ? t("modSources.confirmSelection")
                    : t("downloads.downloadSelected")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
