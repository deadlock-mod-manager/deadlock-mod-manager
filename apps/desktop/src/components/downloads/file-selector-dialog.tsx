import { Archive, File, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatSize } from '@/lib/utils';
import type { ModFileTree } from '@/types/mods';

interface FileSelectorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  fileTree: ModFileTree | null;
  onConfirm: (selectedFileTree: ModFileTree) => void;
  onCancel: () => void;
  modName?: string;
}

export const FileSelectorDialog = ({
  isOpen,
  onOpenChange,
  fileTree,
  onConfirm,
  onCancel,
  modName = 'Unknown Mod',
}: FileSelectorDialogProps) => {
  const [localFileTree, setLocalFileTree] = useState<ModFileTree | null>(null);

  useEffect(() => {
    setLocalFileTree(fileTree);
  }, [fileTree]);

  if (!localFileTree) {
    return null;
  }

  const handleFileToggle = (
    fileIndex: number,
    checked: boolean,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setLocalFileTree((prev) => {
      if (!prev) {
        return null;
      }

      const newFileTree = { ...prev };
      const newFiles = [...newFileTree.files];
      newFiles[fileIndex] = { ...newFiles[fileIndex], is_selected: checked };

      return {
        ...newFileTree,
        files: newFiles,
      };
    });
  };

  const handleSelectAll = (checked: boolean, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLocalFileTree((prev) => {
      if (!prev) {
        return null;
      }

      const newFileTree = { ...prev };
      const newFiles = newFileTree.files.map((file) => ({
        ...file,
        is_selected: checked,
      }));

      return {
        ...newFileTree,
        files: newFiles,
      };
    });
  };

  const handleArchiveToggle = (
    archiveName: string,
    checked: boolean,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setLocalFileTree((prev) => {
      if (!prev) {
        return null;
      }

      const newFileTree = { ...prev };
      const newFiles = newFileTree.files.map((file) =>
        file.archive_name === archiveName
          ? { ...file, is_selected: checked }
          : file
      );

      return {
        ...newFileTree,
        files: newFiles,
      };
    });
  };

  const selectedFiles = localFileTree.files.filter((f) => f.is_selected);
  const selectedCount = selectedFiles.length;
  const totalSelectedSize = selectedFiles.reduce(
    (acc, file) => acc + file.size,
    0
  );

  const allSelected =
    localFileTree.files.length > 0 &&
    selectedCount === localFileTree.files.length;
  const someSelected =
    selectedCount > 0 && selectedCount < localFileTree.files.length;

  // Group files by archive name
  const filesByArchive = localFileTree.files.reduce(
    (acc, file) => {
      if (!acc[file.archive_name]) {
        acc[file.archive_name] = [];
      }
      acc[file.archive_name].push(file);
      return acc;
    },
    {} as Record<string, typeof localFileTree.files>
  );

  const archiveNames = Object.keys(filesByArchive);
  const hasMultipleArchives = archiveNames.length > 1;

  // Helper functions for archive selection state
  const getArchiveSelectedCount = (archiveName: string) => {
    return filesByArchive[archiveName].filter((f) => f.is_selected).length;
  };

  const isArchiveFullySelected = (archiveName: string) => {
    const files = filesByArchive[archiveName];
    return files.length > 0 && files.every((f) => f.is_selected);
  };

  const isArchivePartiallySelected = (archiveName: string) => {
    const files = filesByArchive[archiveName];
    const selected = files.filter((f) => f.is_selected);
    return selected.length > 0 && selected.length < files.length;
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent
        className="max-h-[80vh] max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Select Files to Install: {modName}
          </DialogTitle>
          <DialogDescription>
            Choose which VPK files you want to install from this mod.
            {selectedCount} of {localFileTree.total_files} files selected
            {selectedCount > 0 && ` (${formatSize(totalSelectedSize)})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b pb-2">
            <Checkbox
              checked={allSelected}
              className={
                someSelected ? 'data-[state=checked]:bg-yellow-500' : ''
              }
              onCheckedChange={(checked) => handleSelectAll(checked === true)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="font-medium text-sm">
              Select All ({localFileTree.total_files} files)
            </span>
          </div>

          <ScrollArea className="max-h-[50vh] overflow-y-auto pr-4">
            <div className="space-y-4">
              {hasMultipleArchives ? (
                // Group view - show files grouped by archive
                archiveNames.map((archiveName) => (
                  <div className="space-y-2" key={archiveName}>
                    <div className="flex items-center gap-2 border-b pb-2">
                      <Checkbox
                        checked={isArchiveFullySelected(archiveName)}
                        className={
                          isArchivePartiallySelected(archiveName)
                            ? 'data-[state=checked]:bg-yellow-500'
                            : ''
                        }
                        onCheckedChange={(checked) =>
                          handleArchiveToggle(archiveName, checked === true)
                        }
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Archive className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{archiveName}</span>
                      <Badge className="text-xs" variant="outline">
                        {getArchiveSelectedCount(archiveName)}/
                        {filesByArchive[archiveName].length}
                      </Badge>
                    </div>

                    <div className="ml-6 space-y-1">
                      {filesByArchive[archiveName].map((file) => {
                        const globalIndex = localFileTree.files.indexOf(file);
                        return (
                          <div
                            className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                            key={file.path}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFileToggle(
                                globalIndex,
                                !file.is_selected,
                                e
                              );
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={file.is_selected}
                                onCheckedChange={(checked) =>
                                  handleFileToggle(
                                    globalIndex,
                                    checked === true
                                  )
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex items-center gap-2">
                                <File className="h-4 w-4 text-muted-foreground" />
                                <div className="space-y-1">
                                  <div className="font-mono text-sm">
                                    {file.name}
                                  </div>
                                  {file.path !== file.name && (
                                    <div className="text-muted-foreground text-xs">
                                      {file.path}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <span className="text-muted-foreground text-xs">
                              {formatSize(file.size)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                // Single archive view - flat list
                <div className="space-y-2">
                  {localFileTree.files.map((file, index) => (
                    <div
                      className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/50"
                      key={file.path}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFileToggle(index, !file.is_selected, e);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={file.is_selected}
                          onCheckedChange={(checked) =>
                            handleFileToggle(index, checked === true)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex items-center gap-2">
                          <File className="h-4 w-4 text-muted-foreground" />
                          <div className="space-y-1">
                            <div className="font-mono text-sm">{file.name}</div>
                            {file.path !== file.name && (
                              <div className="text-muted-foreground text-xs">
                                {file.path}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="text-muted-foreground text-xs">
                        {formatSize(file.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="flex items-center justify-between">
          <div className="text-muted-foreground text-sm">
            {selectedCount === 0
              ? 'No files selected'
              : `${selectedCount} file${
                  selectedCount === 1 ? '' : 's'
                } selected (${formatSize(totalSelectedSize)})`}
          </div>
          <div className="space-x-2">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onCancel();
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={selectedCount === 0}
              onClick={(e) => {
                e.stopPropagation();
                onConfirm(localFileTree);
              }}
            >
              Install Selected
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
