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
import { Download, HardDrive } from "@deadlock-mods/ui/icons";
import { format } from "date-fns";
import { useState } from "react";
import { formatSize } from "@/lib/utils";
import type { ModDownloadItem } from "@/types/mods";

interface MultiFileDownloadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onDownload: (selectedFiles: ModDownloadItem[]) => void;
  files: ModDownloadItem[];
  modName: string;
  isDownloading?: boolean;
}

export function MultiFileDownloadDialog({
  isOpen,
  onClose,
  onDownload,
  files,
  modName,
  isDownloading = false,
}: MultiFileDownloadDialogProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

  const handleFileToggle = (fileName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileName)) {
      newSelected.delete(fileName);
    } else {
      newSelected.add(fileName);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedFiles(new Set(files.map((f) => f.name)));
  };

  const handleSelectNone = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedFiles(new Set());
  };

  const handleDownload = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const selected = files.filter((file) => selectedFiles.has(file.name));
    onDownload(selected);
  };

  const selectedFilesArray = files.filter((file) =>
    selectedFiles.has(file.name),
  );
  const totalSize = selectedFilesArray.reduce(
    (sum, file) => sum + (file.size || 0),
    0,
  );

  if (files.length <= 1) {
    return null; // Don't show dialog for single file
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog onOpenChange={handleClose} open={isOpen}>
      <DialogContent
        className='flex max-h-[80vh] max-w-2xl flex-col'
        onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Download className='h-5 w-5' />
            Select Files to Download
          </DialogTitle>
          <DialogDescription>
            {modName} contains {files.length} downloadable files. Select which
            ones you want to download.
          </DialogDescription>
        </DialogHeader>

        <div className='flex items-center justify-between py-2'>
          <div className='flex gap-2'>
            <Button onClick={handleSelectAll} size='sm' variant='outline'>
              Select All
            </Button>
            <Button onClick={handleSelectNone} size='sm' variant='outline'>
              Select None
            </Button>
          </div>
          <div className='flex items-center gap-2 text-muted-foreground text-sm'>
            <HardDrive className='h-4 w-4' />
            Total: {formatSize(totalSize)}
          </div>
        </div>

        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto'>
          {files
            .sort((a, b) => b.size - a.size) // Sort by size, largest first
            .map((file) => (
              <div
                className='flex items-center space-x-3 rounded-lg border p-4 transition-colors hover:bg-muted/50'
                key={file.name}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isDownloading) {
                    handleFileToggle(file.name, e);
                  }
                }}>
                <Checkbox
                  checked={selectedFiles.has(file.name)}
                  disabled={isDownloading}
                  id={file.name}
                  onCheckedChange={() => handleFileToggle(file.name)}
                />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <span
                      className='truncate font-medium text-foreground'
                      title={file.name}>
                      {file.name}
                    </span>
                  </div>
                  <div className='flex flex-col gap-1'>
                    <div className='flex items-center justify-between'>
                      <div className='text-muted-foreground text-sm'>
                        <span className='font-medium'>
                          {formatSize(file.size)}
                        </span>
                      </div>
                      {(file.updatedAt || file.createdAt) && (
                        <div className='text-muted-foreground text-xs'>
                          {file.updatedAt
                            ? `Updated at ${format(file.updatedAt, "dd-MM-yyyy HH:mm")}`
                            : `Created ${format(file.createdAt!, "dd-MM-yyyy HH:mm")}`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>

        <DialogFooter className='flex-col space-y-2'>
          <div className='text-muted-foreground text-sm'>
            {selectedFiles.size} of {files.length} files selected
          </div>
          <div className='flex w-full justify-end gap-2'>
            <Button
              disabled={isDownloading}
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              variant='outline'>
              Cancel
            </Button>
            <Button
              className='min-w-24'
              disabled={selectedFiles.size === 0 || isDownloading}
              onClick={handleDownload}>
              {isDownloading ? (
                <>
                  <div className='mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white' />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className='mr-2 h-4 w-4' />
                  Download Selected
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
