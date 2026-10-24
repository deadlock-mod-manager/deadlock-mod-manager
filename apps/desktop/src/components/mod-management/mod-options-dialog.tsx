import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@deadlock-mods/ui/components/dialog";
import { Progress } from "@deadlock-mods/ui/components/progress";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Check, CloudDownload, Settings } from "@deadlock-mods/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { InstalledFilesDisplay } from "@/components/mod-detail/installed-files-display";
import {
  OptionRow,
  OptionSection,
} from "@/components/mod-management/option-list";
import type { ModOptionsProgress } from "@/hooks/use-mod-options";
import { cn } from "@/lib/utils";
import type { ModDownloadItem, ModFileTree } from "@/types/mods";

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

interface ModOptionsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving?: boolean;
  progress?: ModOptionsProgress | null;
  /** Set while the apply is at a step that can be stopped. */
  onCancelApply?: () => void;
  onApply: (
    selectedArchives: ModDownloadItem[],
    deselectedArchives: ModDownloadItem[],
    allCheckedArchiveNames: string[],
  ) => void;
  modName?: string;
  downloads?: ModDownloadItem[];
  onDiskArchiveNames?: Set<string>;
  activeArchiveNames?: Set<string>;
  fileTree?: ModFileTree;
  onApplyFiles: (selectedNames: string[]) => void;
  isSavingFiles?: boolean;
}

export const ModOptionsDialog = ({
  isOpen,
  onOpenChange,
  isSaving = false,
  progress = null,
  onCancelApply,
  onApply,
  modName = "Mod",
  downloads = [],
  onDiskArchiveNames = new Set<string>(),
  activeArchiveNames = new Set<string>(),
  fileTree,
  onApplyFiles,
  isSavingFiles = false,
}: ModOptionsDialogProps) => {
  const { t } = useTranslation();
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());
  const hasVariants = downloads.length > 1;
  const hasFiles = (fileTree?.files.length ?? 0) > 1;
  const isBusy = isSaving || isSavingFiles;

  useEffect(() => {
    if (isOpen) {
      setCheckedNames(new Set(activeArchiveNames));
    }
  }, [isOpen, activeArchiveNames]);

  useEffect(() => {
    if (!isOpen) {
      setCheckedNames(new Set());
    }
  }, [isOpen]);

  const toggleArchive = (name: string) => {
    setCheckedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const initialKey = useMemo(
    () => [...activeArchiveNames].sort().join("|"),
    [activeArchiveNames],
  );
  const currentKey = useMemo(
    () => [...checkedNames].sort().join("|"),
    [checkedNames],
  );

  const hasChanges = initialKey !== currentKey;
  const canApply = !isBusy && hasChanges && checkedNames.size > 0;

  const handleApply = () => {
    const newlySelected = downloads.filter(
      (d) => checkedNames.has(d.name) && !activeArchiveNames.has(d.name),
    );
    const newlyDeselected = downloads.filter(
      (d) => !checkedNames.has(d.name) && activeArchiveNames.has(d.name),
    );
    onApply(newlySelected, newlyDeselected, [...checkedNames]);
  };

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!isBusy) onOpenChange(open);
        else if (!open) onCancelApply?.();
      }}
      open={isOpen}>
      <DialogContent
        className='max-h-[80vh] max-w-2xl'
        onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Settings className='h-5 w-5' />
            {t("modOptions.title", { modName })}
          </DialogTitle>
          <DialogDescription>{t("modOptions.description")}</DialogDescription>
        </DialogHeader>

        {!hasVariants && !hasFiles ? (
          <div className='py-8 text-center text-muted-foreground text-sm'>
            {t("modOptions.noOptions")}
          </div>
        ) : (
          // Bleed into the dialog padding so the scrollbar hugs the edge and
          // row text lines up with the title.
          <div className='-mx-6 max-h-[60vh] space-y-4 overflow-y-auto px-3'>
            {hasVariants && (
              <OptionSection
                title={t("modOptions.variants")}
                summary={t("modOptions.selectedCount", {
                  selected: checkedNames.size,
                  total: downloads.length,
                })}
                canReset={hasChanges && !isBusy}
                canApply={canApply}
                isSaving={isSaving}
                onReset={() => setCheckedNames(new Set(activeArchiveNames))}
                onApply={handleApply}>
                <div>
                  {downloads.map((download) => {
                    const isChecked = checkedNames.has(download.name);
                    return (
                      <OptionRow
                        aside={formatFileSize(download.size)}
                        checked={isChecked}
                        data-download-archive={download.name}
                        disabled={isBusy}
                        key={`archive-${download.name}`}
                        meta={download.description}
                        onToggle={() => toggleArchive(download.name)}
                        title={
                          <>
                            <span className='truncate font-mono'>
                              {download.name}
                            </span>
                            {activeArchiveNames.has(download.name) && (
                              <Badge
                                className='shrink-0 gap-1 font-normal'
                                variant='secondary'>
                                <Check className='h-3 w-3' />
                                {t("modOptions.enabled")}
                              </Badge>
                            )}
                            {!onDiskArchiveNames.has(download.name) && (
                              <Badge
                                className='shrink-0 gap-1 font-normal text-muted-foreground'
                                variant='outline'>
                                <CloudDownload className='h-3 w-3' />
                                {t("modOptions.needsDownload")}
                              </Badge>
                            )}
                          </>
                        }
                      />
                    );
                  })}
                </div>
                {progress && (
                  <div className='px-3'>
                    <ApplyProgress
                      onCancel={onCancelApply}
                      progress={progress}
                    />
                  </div>
                )}
              </OptionSection>
            )}

            {hasVariants && hasFiles && <Separator />}

            {fileTree && hasFiles && (
              <InstalledFilesDisplay
                disabled={isSaving}
                fileTree={fileTree}
                isSaving={isSavingFiles}
                onApplySelection={onApplyFiles}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const ApplyProgress = ({
  progress,
  onCancel,
}: {
  progress: ModOptionsProgress;
  onCancel?: () => void;
}) => {
  const { t } = useTranslation();

  if (progress.phase === "applying") {
    return (
      <div className='space-y-2 rounded-md border p-3'>
        <p className='text-sm'>{t("modOptions.progress.applying")}</p>
        <Progress className='h-1.5 animate-pulse' value={100} />
      </div>
    );
  }

  const percent =
    progress.phase === "downloading"
      ? progress.total
        ? Math.min(100, (progress.downloaded / progress.total) * 100)
        : 0
      : 100;

  return (
    <div className='space-y-2 rounded-md border p-3'>
      <div className='flex items-baseline justify-between gap-3 text-sm'>
        <span className='min-w-0 truncate'>
          {t(`modOptions.progress.${progress.phase}`, {
            name: progress.archiveName,
          })}
        </span>
        {progress.count > 1 && (
          <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
            {t("modOptions.progress.position", {
              index: progress.index + 1,
              count: progress.count,
            })}
          </span>
        )}
      </div>
      <Progress
        className={cn(
          "h-1.5",
          progress.phase !== "downloading" && "animate-pulse",
        )}
        value={percent}
      />
      {progress.phase === "downloading" && (
        <div className='flex items-center justify-between gap-3'>
          <p className='text-xs text-muted-foreground tabular-nums'>
            {progress.total
              ? t("modOptions.progress.bytes", {
                  downloaded: formatFileSize(progress.downloaded),
                  total: formatFileSize(progress.total),
                })
              : formatFileSize(progress.downloaded)}
          </p>
          {onCancel && (
            <Button onClick={onCancel} size='sm' variant='ghost'>
              {t("common.cancel")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
