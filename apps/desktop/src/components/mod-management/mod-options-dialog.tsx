import { Badge } from "@deadlock-mods/ui/components/badge";
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
  Check,
  CloudDownload,
  Package,
  Settings,
  X,
} from "@deadlock-mods/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ModDownloadItem } from "@/types/mods";

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
  onApply: (
    selectedArchives: ModDownloadItem[],
    deselectedArchives: ModDownloadItem[],
    allCheckedArchiveNames: string[],
  ) => void;
  onCancel: () => void;
  modName?: string;
  downloads?: ModDownloadItem[];
  onDiskArchiveNames?: Set<string>;
  activeArchiveNames?: Set<string>;
}

export const ModOptionsDialog = ({
  isOpen,
  onOpenChange,
  isSaving = false,
  onApply,
  onCancel,
  modName = "Mod",
  downloads = [],
  onDiskArchiveNames = new Set<string>(),
  activeArchiveNames = new Set<string>(),
}: ModOptionsDialogProps) => {
  const { t } = useTranslation();
  const [checkedNames, setCheckedNames] = useState<Set<string>>(new Set());

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
  const canApply = !isSaving && hasChanges && checkedNames.size > 0;

  const handleApply = () => {
    const newlySelected = downloads.filter(
      (d) => checkedNames.has(d.name) && !activeArchiveNames.has(d.name),
    );
    const newlyDeselected = downloads.filter(
      (d) => !checkedNames.has(d.name) && activeArchiveNames.has(d.name),
    );
    onApply(newlySelected, newlyDeselected, [...checkedNames]);
  };

  const checkedCount = checkedNames.size;

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
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

        {downloads.length === 0 ? (
          <div className='py-8 text-center text-muted-foreground text-sm'>
            {t("modOptions.noOptions")}
          </div>
        ) : (
          <ScrollArea className='max-h-[55vh] overflow-y-auto pr-4'>
            <div className='space-y-1'>
              {downloads.map((download) => {
                const isChecked = checkedNames.has(download.name);
                const isOnDisk = onDiskArchiveNames.has(download.name);
                const isEnabled = activeArchiveNames.has(download.name);

                return (
                  <div
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2.5 text-left hover:bg-muted/50",
                      isSaving && "pointer-events-none opacity-50",
                    )}
                    key={`archive-${download.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isSaving) toggleArchive(download.name);
                    }}>
                    <div className='flex items-center gap-3'>
                      <Checkbox
                        checked={isChecked}
                        disabled={isSaving}
                        onCheckedChange={() => toggleArchive(download.name)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className='flex flex-col gap-0.5'>
                        <div className='flex items-center gap-2'>
                          <Package className='h-4 w-4 text-muted-foreground' />
                          <span className='font-mono text-sm'>
                            {download.name}
                          </span>
                          {isEnabled && (
                            <Badge
                              variant='default'
                              className='gap-1 text-xs py-0'>
                              <Check className='h-3 w-3' />
                              {t("modOptions.enabled")}
                            </Badge>
                          )}
                          {!isOnDisk && (
                            <Badge
                              variant='outline'
                              className='gap-1 text-xs font-normal'>
                              <CloudDownload className='h-3 w-3' />
                              {t("modOptions.needsDownload")}
                            </Badge>
                          )}
                        </div>
                        <div className='flex items-center gap-3 pl-6 text-xs text-muted-foreground'>
                          <span>{formatFileSize(download.size)}</span>
                          {download.description && (
                            <span className='truncate max-w-[300px]'>
                              {download.description}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter className='flex items-center justify-between'>
          <div className='text-muted-foreground text-sm'>
            {t("modOptions.selectedCount", {
              selected: checkedCount,
              total: downloads.length,
            })}
          </div>
          <div className='space-x-2'>
            <Button
              icon={<X className='h-4 w-4' />}
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              variant='outline'
              disabled={isSaving}>
              {t("common.cancel")}
            </Button>
            <Button
              disabled={!canApply}
              icon={<Check className='h-4 w-4' />}
              isLoading={isSaving}
              onClick={(e) => {
                e.stopPropagation();
                handleApply();
              }}>
              {t("modOptions.apply")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
