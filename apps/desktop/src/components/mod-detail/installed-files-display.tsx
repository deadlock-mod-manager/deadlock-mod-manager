import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { Separator } from "@deadlock-mods/ui/components/separator";
import { Archive, Check, RotateCcw } from "@deadlock-mods/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn, formatSize } from "@/lib/utils";
import type { ModFileTree } from "@/types/mods";

interface InstalledFilesDisplayProps {
  fileTree: ModFileTree;
  modName: string;
  onApplySelection?: (selectedNames: string[]) => void;
  isSaving?: boolean;
}

const selectedNamesOf = (fileTree: ModFileTree) =>
  new Set(fileTree.files.filter((f) => f.is_selected).map((f) => f.name));

export const InstalledFilesDisplay = ({
  fileTree,
  modName,
  onApplySelection,
  isSaving = false,
}: InstalledFilesDisplayProps) => {
  const { t } = useTranslation();
  const canToggle = !!onApplySelection && fileTree.files.length > 1;
  const initialSelection = useMemo(() => selectedNamesOf(fileTree), [fileTree]);
  const [selection, setSelection] = useState(initialSelection);

  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  const filesByArchive = fileTree.files.reduce<
    Record<string, ModFileTree["files"]>
  >((acc, file) => {
    if (!canToggle && !file.is_selected) return acc;
    if (!acc[file.archive_name]) {
      acc[file.archive_name] = [];
    }
    acc[file.archive_name].push(file);
    return acc;
  }, {});

  const archiveNames = Object.keys(filesByArchive);

  const hasChanges =
    selection.size !== initialSelection.size ||
    [...selection].some((name) => !initialSelection.has(name));

  const toggleFile = (name: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <Card
      data-testid='installed-files'
      className='shadow-none [contain:layout_style_paint]'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {t("installedFiles.title")}
        </CardTitle>
        <CardDescription>
          {canToggle
            ? t("installedFiles.toggleDescription", { modName })
            : t("installedFiles.description", { modName })}
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className='space-y-4'>
          {archiveNames.map((archiveName) => {
            const archiveFiles = filesByArchive[archiveName];
            const selectedCount = archiveFiles.filter((f) =>
              selection.has(f.name),
            ).length;
            return (
              <div
                data-archive={archiveName}
                data-selected-count={selectedCount}
                className='space-y-2'
                key={archiveName}>
                <div className='flex items-center gap-2'>
                  <Archive className='h-4 w-4 text-muted-foreground' />
                  <span className='font-medium text-sm'>{archiveName}</span>
                  <Badge className='text-xs' variant='outline'>
                    {canToggle
                      ? t("installedFiles.enabledCount", {
                          selected: selectedCount,
                          total: archiveFiles.length,
                        })
                      : t("installedFiles.fileCount", {
                          count: archiveFiles.length,
                        })}
                  </Badge>
                </div>

                <div className='ml-6 space-y-1'>
                  {archiveFiles.map((file) => {
                    const isChecked = selection.has(file.name);
                    return (
                      <div
                        data-selected={isChecked}
                        className={cn(
                          "flex items-center justify-between rounded-md bg-muted/30 px-3 py-2",
                          canToggle && "cursor-pointer hover:bg-muted/50",
                          canToggle && !isChecked && "opacity-60",
                          isSaving && "pointer-events-none opacity-50",
                        )}
                        key={file.path}
                        onClick={() => canToggle && toggleFile(file.name)}>
                        <div className='flex items-center gap-3'>
                          {canToggle && (
                            <Checkbox
                              checked={isChecked}
                              disabled={isSaving}
                              onCheckedChange={() => toggleFile(file.name)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          )}
                          <div className='space-y-1'>
                            <div
                              data-file-name={file.name}
                              className='font-mono text-sm'>
                              {file.name}
                            </div>
                            {file.path !== file.name && (
                              <div className='text-muted-foreground text-xs'>
                                {file.path}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className='text-muted-foreground text-xs'>
                          {formatSize(file.size)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {archiveName !== archiveNames.at(-1) && (
                  <Separator className='my-4' />
                )}
              </div>
            );
          })}
        </div>

        {canToggle && (
          <div className='mt-4 flex items-center justify-between gap-2'>
            <span className='text-muted-foreground text-sm'>
              {selection.size === 0
                ? t("installedFiles.selectAtLeastOne")
                : t("modOptions.selectedCount", {
                    selected: selection.size,
                    total: fileTree.files.length,
                  })}
            </span>
            <div className='flex gap-2'>
              <Button
                disabled={!hasChanges || isSaving}
                icon={<RotateCcw className='h-4 w-4' />}
                onClick={() => setSelection(initialSelection)}
                variant='outline'>
                {t("installedFiles.reset")}
              </Button>
              <Button
                disabled={!hasChanges || isSaving || selection.size === 0}
                icon={<Check className='h-4 w-4' />}
                isLoading={isSaving}
                onClick={() => onApplySelection?.([...selection])}>
                {t("modOptions.apply")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
