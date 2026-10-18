import { Archive } from "@deadlock-mods/ui/icons";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  OptionRow,
  OptionSection,
} from "@/components/mod-management/option-list";
import { cn, formatSize } from "@/lib/utils";
import type { ModFile, ModFileTree } from "@/types/mods";

interface InstalledFilesDisplayProps {
  fileTree: ModFileTree;
  onApplySelection: (selectedNames: string[]) => void;
  isSaving?: boolean;
  disabled?: boolean;
}

const selectedNamesOf = (fileTree: ModFileTree) =>
  new Set(fileTree.files.filter((f) => f.is_selected).map((f) => f.name));

const pathInArchive = (file: ModFile) => {
  const prefix = `${file.archive_name}/`;
  return file.path.startsWith(prefix)
    ? file.path.slice(prefix.length)
    : file.path;
};

export const InstalledFilesDisplay = ({
  fileTree,
  onApplySelection,
  isSaving = false,
  disabled = false,
}: InstalledFilesDisplayProps) => {
  const { t } = useTranslation();
  const isBusy = isSaving || disabled;
  const initialSelection = useMemo(() => selectedNamesOf(fileTree), [fileTree]);
  const [selection, setSelection] = useState(initialSelection);

  useEffect(() => {
    setSelection(initialSelection);
  }, [initialSelection]);

  const filesByArchive = fileTree.files.reduce<
    Record<string, ModFileTree["files"]>
  >((acc, file) => {
    if (!acc[file.archive_name]) {
      acc[file.archive_name] = [];
    }
    acc[file.archive_name].push(file);
    return acc;
  }, {});

  const archiveNames = Object.keys(filesByArchive);
  // Headers only help when an archive holds several files; one file per
  // archive reads better as a flat list that names the archive per row.
  const showArchiveHeaders =
    archiveNames.length > 1 &&
    archiveNames.some((name) => filesByArchive[name].length > 1);

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

  const metaFor = (file: ModFile) => {
    if (archiveNames.length > 1 && !showArchiveHeaders) {
      return file.archive_name;
    }
    const innerPath = pathInArchive(file);
    return innerPath !== file.name ? innerPath : undefined;
  };

  return (
    <OptionSection
      data-testid='installed-files'
      title={t("installedFiles.title")}
      summary={t("modOptions.selectedCount", {
        selected: selection.size,
        total: fileTree.files.length,
      })}
      hint={selection.size === 0 && t("installedFiles.selectAtLeastOne")}
      canReset={hasChanges && !isBusy}
      canApply={hasChanges && !isBusy && selection.size > 0}
      isSaving={isSaving}
      onReset={() => setSelection(initialSelection)}
      onApply={() => onApplySelection([...selection])}>
      <div className={cn(showArchiveHeaders && "space-y-3")}>
        {archiveNames.map((archiveName) => {
          const archiveFiles = filesByArchive[archiveName];
          const selectedCount = archiveFiles.filter((f) =>
            selection.has(f.name),
          ).length;
          return (
            <div
              data-archive={archiveName}
              data-selected-count={selectedCount}
              key={archiveName}>
              {showArchiveHeaders && (
                <div className='flex items-center gap-2 px-3 pb-1 text-muted-foreground text-xs'>
                  <Archive className='h-3.5 w-3.5 shrink-0' />
                  <span className='truncate font-medium'>{archiveName}</span>
                  <span className='ml-auto shrink-0 tabular-nums'>
                    {t("installedFiles.enabledCount", {
                      selected: selectedCount,
                      total: archiveFiles.length,
                    })}
                  </span>
                </div>
              )}
              {archiveFiles.map((file) => {
                const isChecked = selection.has(file.name);
                return (
                  <OptionRow
                    aside={formatSize(file.size)}
                    checked={isChecked}
                    data-selected={isChecked}
                    disabled={isBusy}
                    key={file.path}
                    meta={metaFor(file)}
                    onToggle={() => toggleFile(file.name)}
                    title={
                      <span
                        data-file-name={file.name}
                        className='truncate font-mono'>
                        {file.name}
                      </span>
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </OptionSection>
  );
};
