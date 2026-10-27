import {
  FileIcon,
  FolderIcon,
  CaretDownIcon,
  CaretUpIcon,
} from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/components/foundry/foundry-entry-list";
import {
  assetSelectionState,
  type AssetSelection,
} from "@/lib/modding-asset-selection";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import { AssetImportCheckbox } from "./asset-import-checkbox";

interface Props {
  entries: ModdingArchiveEntry[];
  selection: AssetSelection;
  disabled: boolean;
  searching: boolean;
  previewed: string;
  onPreview: (path: string) => void;
  onNavigate: (path: string) => void;
  onSelect: (node: ModdingArchiveEntry, selected: boolean) => void;
  onSelectAll: (nodes: ModdingArchiveEntry[], selected: boolean) => void;
}

const columns =
  "grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5rem] items-center";
const fileType = (entry: ModdingArchiveEntry) =>
  entry.directory ? "" : (entry.name.split(".").pop() ?? "").toUpperCase();

export const AssetImportList = ({
  entries,
  selection,
  disabled,
  searching,
  previewed,
  onPreview,
  onNavigate,
  onSelect,
  onSelectAll,
}: Props) => {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<{
    field: "name" | "type" | "size";
    descending: boolean;
  }>({ field: "name", descending: false });
  const sorted = useMemo(
    () =>
      [...entries].sort((a, b) => {
        const order =
          sort.field === "size"
            ? Number(a.size) - Number(b.size)
            : sort.field === "type"
              ? fileType(a).localeCompare(fileType(b))
              : a.name.localeCompare(b.name);
        return (
          Number(b.directory) - Number(a.directory) ||
          (sort.descending ? -order : order)
        );
      }),
    [entries, sort],
  );
  const rows = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scroll.current,
    estimateSize: () => 36,
    overscan: 10,
  });
  const states = entries.map((entry) => assetSelectionState(selection, entry));
  const all = states.length > 0 && states.every((state) => state === true);
  const any = states.some((state) => state !== false);
  return (
    <div
      role='table'
      aria-label={t("workbenchExplorer.archiveFiles")}
      aria-rowcount={entries.length + 1}
      className='flex min-h-0 flex-1 flex-col'>
      <div
        role='row'
        className={`${columns} h-9 shrink-0 border-b bg-muted/30 text-xs text-muted-foreground`}>
        <div role='columnheader' className='flex justify-center'>
          <AssetImportCheckbox
            label={t("workbenchExplorer.selectListed")}
            checked={all ? true : any ? "indeterminate" : false}
            disabled={disabled || !entries.length}
            onCheckedChange={(checked) => onSelectAll(entries, checked)}
          />
        </div>
        {(["name", "type", "size"] as const).map((field) => (
          <div
            role='columnheader'
            key={field}
            aria-sort={
              sort.field === field
                ? sort.descending
                  ? "descending"
                  : "ascending"
                : "none"
            }>
            <button
              type='button'
              className={`flex w-full items-center gap-1 px-2 py-2 ${field === "size" ? "justify-end pr-4" : ""}`}
              onClick={() =>
                setSort((previous) => ({
                  field,
                  descending:
                    previous.field === field ? !previous.descending : false,
                }))
              }>
              {t(`workbenchExplorer.assetColumn_${field}`)}
              {sort.field === field ? (
                sort.descending ? (
                  <CaretDownIcon />
                ) : (
                  <CaretUpIcon />
                )
              ) : null}
            </button>
          </div>
        ))}
      </div>
      <div
        ref={scroll}
        className='min-h-0 flex-1 overflow-auto'
        role='rowgroup'>
        <div style={{ height: rows.getTotalSize(), position: "relative" }}>
          {rows.getVirtualItems().map((row) => {
            const file = sorted[row.index];
            if (!file) return null;
            return (
              <div
                role='row'
                aria-rowindex={row.index + 2}
                key={file.path}
                className={`${previewed === file.path ? "bg-accent/60" : ""} ${columns} absolute left-0 top-0 w-full border-b border-border/40 text-xs hover:bg-accent/50`}
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}>
                <div role='cell' className='flex justify-center'>
                  <AssetImportCheckbox
                    label={t(
                      file.directory
                        ? "workbenchExplorer.selectFolder"
                        : "workbenchExplorer.selectAsset",
                      { folder: file.path, path: file.path },
                    )}
                    checked={assetSelectionState(selection, file)}
                    disabled={disabled}
                    onCheckedChange={(checked) => onSelect(file, checked)}
                  />
                </div>
                <div role='cell' className='min-w-0'>
                  <button
                    type='button'
                    className='flex w-full min-w-0 items-center gap-2 px-2 text-left'
                    title={file.path}
                    disabled={disabled}
                    onDoubleClick={() => {
                      if (file.directory) onNavigate(file.path);
                    }}
                    onClick={() => {
                      if (!file.directory) onPreview(file.path);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && file.directory)
                        onNavigate(file.path);
                    }}>
                    {file.directory ? (
                      <FolderIcon className='size-4 shrink-0 text-muted-foreground' />
                    ) : (
                      <FileIcon className='size-4 shrink-0 text-muted-foreground' />
                    )}
                    <span className='min-w-0'>
                      <span className='block truncate'>{file.name}</span>
                      {searching ? (
                        <span className='block truncate text-[10px] text-muted-foreground'>
                          {file.path.slice(0, file.path.lastIndexOf("/"))}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
                <div
                  role='cell'
                  className='truncate px-2 text-muted-foreground'>
                  {file.directory
                    ? t("workbenchExplorer.folderType")
                    : fileType(file)}
                </div>
                <div
                  role='cell'
                  className='pr-4 text-right tabular-nums text-muted-foreground'>
                  {formatBytes(Number(file.size))}
                </div>
              </div>
            );
          })}
        </div>
        {!entries.length ? (
          <p className='p-4 text-sm text-muted-foreground'>
            {t("workbenchExplorer.noFiles")}
          </p>
        ) : null}
      </div>
    </div>
  );
};
