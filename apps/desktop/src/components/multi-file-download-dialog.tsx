import { Check, Download, FileText, HardDrive } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatSize } from '@/lib/utils';
import type { ModDownloadItem } from '@/types/mods';

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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(
    () => new Set(files.length > 0 ? [files[0].name] : []) // Select primary file by default
  );

  const handleFileToggle = (fileName: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(fileName)) {
      newSelected.delete(fileName);
    } else {
      newSelected.add(fileName);
    }
    setSelectedFiles(newSelected);
  };

  const handleSelectAll = () => {
    setSelectedFiles(new Set(files.map((f) => f.name)));
  };

  const handleSelectNone = () => {
    setSelectedFiles(new Set());
  };

  const handleDownload = () => {
    const selected = files.filter((file) => selectedFiles.has(file.name));
    onDownload(selected);
  };

  const selectedFilesArray = files.filter((file) =>
    selectedFiles.has(file.name)
  );
  const totalSize = selectedFilesArray.reduce(
    (sum, file) => sum + file.size,
    0
  );

  if (files.length <= 1) {
    return null; // Don't show dialog for single file
  }

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="flex max-h-[80vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Select Files to Download
          </DialogTitle>
          <DialogDescription>
            {modName} contains {files.length} downloadable files. Select which
            ones you want to download.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between py-2">
          <div className="flex gap-2">
            <Button onClick={handleSelectAll} size="sm" variant="outline">
              Select All
            </Button>
            <Button onClick={handleSelectNone} size="sm" variant="outline">
              Select None
            </Button>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <HardDrive className="h-4 w-4" />
            Total: {formatSize(totalSize)}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {files
            .sort((a, b) => b.size - a.size) // Sort by size, largest first
            .map((file, index) => (
              <div
                className="flex items-center space-x-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                key={file.name}
              >
                <Checkbox
                  checked={selectedFiles.has(file.name)}
                  disabled={isDownloading}
                  id={file.name}
                  onCheckedChange={() => handleFileToggle(file.name)}
                />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate font-medium" title={file.name}>
                      {file.name}
                    </span>
                    {index === 0 && (
                      <Badge className="text-xs" variant="secondary">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {formatSize(file.size)}
                  </div>
                </div>
                {selectedFiles.has(file.name) && (
                  <Check className="h-4 w-4 flex-shrink-0 text-green-600" />
                )}
              </div>
            ))}
        </div>

        <DialogFooter className="flex-col space-y-2">
          <div className="text-muted-foreground text-sm">
            {selectedFiles.size} of {files.length} files selected
          </div>
          <div className="flex w-full justify-end gap-2">
            <Button
              disabled={isDownloading}
              onClick={onClose}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="min-w-24"
              disabled={selectedFiles.size === 0 || isDownloading}
              onClick={handleDownload}
            >
              {isDownloading ? (
                <>
                  <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
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
