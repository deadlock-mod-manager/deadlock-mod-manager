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
import { ScrollArea } from "@deadlock-mods/ui/components/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import { Download, HardDrive } from "@deadlock-mods/ui/icons";
import { cn } from "@deadlock-mods/ui/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatSize } from "@/lib/utils";
import type { ModDownloadItem } from "@/types/mods";

interface MultiFileDownloadDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onDownload: (selectedFiles: ModDownloadItem[]) => void;
  readonly files: ModDownloadItem[];
  readonly modName: string;
  readonly isDownloading?: boolean;
  readonly downloadPercentage?: number;
}

export function MultiFileDownloadDialog({
  isOpen,
  onClose,
  onDownload,
  files,
  modName,
  isDownloading = false,
  downloadPercentage = 0,
}: MultiFileDownloadDialogProps) {
  const { t } = useTranslation();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => b.size - a.size),
    [files],
  );

  const totalSize = useMemo(
    () =>
      sortedFiles.reduce(
        (sum, file) =>
          selectedFiles.has(file.name) ? sum + (file.size || 0) : sum,
        0,
      ),
    [sortedFiles, selectedFiles],
  );

  const allSelected = files.length > 0 && selectedFiles.size === files.length;
  const noneSelected = selectedFiles.size === 0;

  const handleFileToggle = (fileName: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(fileName)) {
        next.delete(fileName);
      } else {
        next.add(fileName);
      }
      return next;
    });
  };

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.map((f) => f.name)));
    }
  };

  const handleDownload = () => {
    const selected = sortedFiles.filter((file) => selectedFiles.has(file.name));
    onDownload(selected);
  };

  if (files.length <= 1) {
    return null;
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
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
          <DialogTitle>{t("downloads.selectFilesToDownload")}</DialogTitle>
          <DialogDescription>
            {t("notifications.modContainsFiles", {
              modName,
              fileCount: files.length,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className='flex min-h-0 flex-col overflow-hidden rounded-md border bg-muted/40'>
          <div className='flex items-center justify-between gap-2 border-b px-3 py-2'>
            <div className='flex items-center gap-3'>
              <Checkbox
                aria-label={
                  allSelected
                    ? t("downloads.selectNone")
                    : t("downloads.selectAll")
                }
                checked={
                  allSelected ? true : noneSelected ? false : "indeterminate"
                }
                disabled={isDownloading}
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
            <span className='font-mono text-muted-foreground text-xs tabular-nums'>
              {selectedFiles.size}/{files.length}
            </span>
          </div>

          <ScrollArea className='min-h-0 flex-1'>
            <ul className='divide-y divide-border/60' role='list'>
              {sortedFiles.map((file) => {
                const isSelected = selectedFiles.has(file.name);
                const timestamp = file.updatedAt ?? file.createdAt;
                const timestampLabel = file.updatedAt
                  ? t("downloads.updatedAgo", {
                      when: formatDistanceToNow(file.updatedAt),
                    })
                  : file.createdAt
                    ? t("downloads.createdAgo", {
                        when: formatDistanceToNow(file.createdAt),
                      })
                    : null;
                const timestampTooltip = file.updatedAt
                  ? t("downloads.updatedAt", {
                      date: format(file.updatedAt, "dd-MM-yyyy HH:mm"),
                    })
                  : file.createdAt
                    ? t("downloads.createdAt", {
                        date: format(file.createdAt, "dd-MM-yyyy HH:mm"),
                      })
                    : null;

                return (
                  <li key={file.name}>
                    <button
                      aria-pressed={isSelected}
                      className={cn(
                        "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                        "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                        isSelected && "bg-primary/5 hover:bg-primary/10",
                        isDownloading && "pointer-events-none opacity-60",
                      )}
                      disabled={isDownloading}
                      onClick={() => handleFileToggle(file.name)}
                      type='button'>
                      <span className='flex h-lh items-center'>
                        <Checkbox
                          checked={isSelected}
                          disabled={isDownloading}
                          tabIndex={-1}
                          onCheckedChange={() => handleFileToggle(file.name)}
                        />
                      </span>
                      <div className='min-w-0 flex-1'>
                        <p
                          className='truncate font-medium text-foreground text-sm'
                          title={file.name}>
                          {file.name}
                        </p>
                        {file.description && (
                          <p className='mt-0.5 line-clamp-2 text-muted-foreground text-xs'>
                            {file.description}
                          </p>
                        )}
                        <div className='mt-1 flex items-center gap-2 text-muted-foreground text-xs'>
                          <span className='font-medium tabular-nums'>
                            {formatSize(file.size)}
                          </span>
                          {timestamp && timestampLabel && (
                            <>
                              <span aria-hidden='true'>&middot;</span>
                              {timestampTooltip ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>{timestampLabel}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {timestampTooltip}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span>{timestampLabel}</span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </div>

        <DialogFooter className='flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
            <HardDrive className='h-3.5 w-3.5' />
            <span className='tabular-nums'>
              {t("downloads.total")}: {formatSize(totalSize)}
            </span>
          </div>
          <div className='flex gap-2 sm:gap-2'>
            <Button
              disabled={isDownloading}
              onClick={onClose}
              variant='outline'>
              {t("common.cancel")}
            </Button>
            <Button
              className='min-w-32'
              disabled={selectedFiles.size === 0 || isDownloading}
              icon={<Download className='h-4 w-4' />}
              isLoading={isDownloading}
              onClick={handleDownload}>
              {isDownloading
                ? t("downloads.downloadingPercent", {
                    percent: Math.round(downloadPercentage),
                  })
                : t("downloads.downloadSelected")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
