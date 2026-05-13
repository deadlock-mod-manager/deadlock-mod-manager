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
  ArrowLeftRight,
  Check,
  CloudDownload,
  File,
  Package,
} from "@deadlock-mods/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
  fileTree: ModFileTree | null;
  notOnDisk?: Set<string>;
  isLoading?: boolean;
  isSaving?: boolean;
  onApply: (
    selectedVpkNames: string[],
    selectedArchives: ModDownloadItem[],
  ) => void;
  onCancel: () => void;
  modName?: string;
  uninstalledDownloads?: ModDownloadItem[];
}

export const ModOptionsDialog = ({
  isOpen,
  onOpenChange,
  fileTree,
  notOnDisk,
  isLoading = false,
  isSaving = false,
  onApply,
  onCancel,
  modName = "Mod",
  uninstalledDownloads = [],
}: ModOptionsDialogProps) => {
  const { t } = useTranslation();
  const [localFileTree, setLocalFileTree] = useState<ModFileTree | null>(null);
  const [selectedArchiveNames, setSelectedArchiveNames] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (fileTree && isOpen) {
      setLocalFileTree(fileTree);
    }
  }, [fileTree, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setLocalFileTree(null);
      setSelectedArchiveNames(new Set());
    }
  }, [isOpen]);

  const toggleVpk = (index: number, checked: boolean) => {
    setLocalFileTree((prev) => {
      if (!prev) return null;
      const newFiles = [...prev.files];
      newFiles[index] = { ...newFiles[index], is_selected: checked };
      return { ...prev, files: newFiles };
    });
  };

  const toggleArchive = (name: string) => {
    setSelectedArchiveNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const selectedVpkFiles = useMemo(
    () => localFileTree?.files.filter((f) => f.is_selected) ?? [],
    [localFileTree],
  );

  const initialSelectedKey = useMemo(
    () =>
      fileTree
        ? fileTree.files
            .filter((f) => f.is_selected)
            .map((f) => f.name)
            .sort()
            .join("|")
        : "",
    [fileTree],
  );
  const currentSelectedKey = useMemo(
    () =>
      selectedVpkFiles
        .map((f) => f.name)
        .sort()
        .join("|"),
    [selectedVpkFiles],
  );

  const vpkChanged = initialSelectedKey !== currentSelectedKey;
  const archivesSelected = selectedArchiveNames.size > 0;
  const hasChanges = vpkChanged || archivesSelected;
  const canApply =
    !isSaving &&
    !isLoading &&
    hasChanges &&
    (selectedVpkFiles.length > 0 || archivesSelected);

  const handleApply = () => {
    const vpkNames = selectedVpkFiles.map((f) => f.name);
    const archives = uninstalledDownloads.filter((d) =>
      selectedArchiveNames.has(d.name),
    );
    onApply(vpkNames, archives);
  };

  const vpkFiles = localFileTree?.files ?? [];
  const hasVpkItems = vpkFiles.length > 0;
  const hasArchiveItems = uninstalledDownloads.length > 0;
  const isEmpty = !hasVpkItems && !hasArchiveItems;

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent
        className='max-h-[80vh] max-w-2xl'
        onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ArrowLeftRight className='h-5 w-5' />
            {t("modOptions.title", { modName })}
          </DialogTitle>
          <DialogDescription>{t("modOptions.description")}</DialogDescription>
        </DialogHeader>

        {isLoading && !hasArchiveItems ? (
          <div className='py-8 text-center text-muted-foreground text-sm'>
            {t("common.loading")}
          </div>
        ) : isEmpty && !isLoading ? (
          <div className='py-8 text-center text-muted-foreground text-sm'>
            {t("modOptions.noOptions")}
          </div>
        ) : (
          <ScrollArea className='max-h-[55vh] overflow-y-auto pr-4'>
            <div className='space-y-1'>
              {vpkFiles.map((file, index) => (
                <div
                  className='flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left hover:bg-muted/50'
                  key={`vpk-${file.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVpk(index, !file.is_selected);
                  }}>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      checked={file.is_selected}
                      onCheckedChange={(checked) =>
                        toggleVpk(index, checked === true)
                      }
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className='flex items-center gap-2'>
                      <File className='h-4 w-4 text-muted-foreground' />
                      <span className='font-mono text-sm'>{file.name}</span>
                      {file.is_selected && (
                        <Badge variant='default' className='gap-1 text-xs py-0'>
                          <Check className='h-3 w-3' />
                          {t("modOptions.activeVariant")}
                        </Badge>
                      )}
                      {notOnDisk?.has(file.name) && (
                        <Badge
                          variant='outline'
                          className='gap-1 text-xs font-normal'>
                          <CloudDownload className='h-3 w-3' />
                          {t("modOptions.needsDownload")}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {uninstalledDownloads.map((download) => {
                const isChecked = selectedArchiveNames.has(download.name);

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
                          <Badge
                            variant='outline'
                            className='gap-1 text-xs font-normal'>
                            <CloudDownload className='h-3 w-3' />
                            {t("modOptions.needsDownload")}
                          </Badge>
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
            {selectedVpkFiles.length > 0 &&
              t("modOptions.selectedCount", {
                selected: selectedVpkFiles.length,
                total: vpkFiles.length,
              })}
          </div>
          <div className='space-x-2'>
            <Button
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
