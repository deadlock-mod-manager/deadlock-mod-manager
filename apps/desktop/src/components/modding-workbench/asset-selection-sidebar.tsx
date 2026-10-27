import { Button } from "@deadlock-mods/ui/components/button";
import { XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { invoke } from "@tauri-apps/api/core";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  archiveSelectionPayload,
  type AssetSelection,
} from "@/lib/modding-asset-selection";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";

interface Props {
  archivePath: string;
  selection: AssetSelection;
  count: number;
  disabled: boolean;
  onPreview: (path: string) => void;
  onRemove: (node: ModdingArchiveEntry) => void;
}

export function AssetSelectionSidebar({
  archivePath,
  selection,
  count,
  disabled,
  onPreview,
  onRemove,
}: Props) {
  const { t } = useTranslation();
  const rules = useMemo(() => archiveSelectionPayload(selection), [selection]);
  const debouncedRules = useDebouncedValue(rules, 250);
  const files = useQuery({
    queryKey: ["workbench-archive-selection", archivePath, debouncedRules],
    queryFn: () =>
      invoke<ModdingArchiveEntry[]>("list_modding_archive_selection", {
        selections: debouncedRules,
        archivePath,
      }),
    enabled: count > 0 && count <= 8192,
    staleTime: 60_000,
    retry: false,
    meta: { skipGlobalErrorHandler: true },
  });
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: count > 0 && count <= 8192 ? (files.data?.length ?? 0) : 0,
    getScrollElement: () => scroll.current,
    estimateSize: () => 48,
    overscan: 5,
  });
  return (
    <aside
      className='flex h-full min-h-0 flex-col bg-muted/15'
      aria-label={t("workbenchExplorer.selectedFiles")}>
      <h3 className='border-b px-3 py-2 text-sm font-medium'>
        {t("workbenchExplorer.selectedFiles")}{" "}
        <span className='text-muted-foreground'>({count})</span>
      </h3>
      <div ref={scroll} className='min-h-0 flex-1 overflow-auto'>
        <div className='relative' style={{ height: rows.getTotalSize() }}>
          {rows.getVirtualItems().map((row) => {
            const file = files.data?.[row.index];
            if (!file) return null;
            return (
              <div
                key={file.path}
                className='absolute left-0 top-0 flex w-full items-center gap-1 border-b border-border/40 px-2 hover:bg-accent/40'
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}>
                <button
                  type='button'
                  className='min-w-0 flex-1 text-left text-xs'
                  title={file.path}
                  disabled={disabled}
                  onClick={() => onPreview(file.path)}>
                  <span className='block truncate'>{file.name}</span>
                  <span className='block truncate text-[10px] text-muted-foreground'>
                    {file.path}
                  </span>
                </button>
                <Button
                  size='icon'
                  variant='ghost'
                  className='size-7 shrink-0'
                  aria-label={t("workbenchExplorer.removeSelectedFile", {
                    path: file.path,
                  })}
                  disabled={disabled}
                  onClick={() => onRemove(file)}>
                  <XIcon />
                </Button>
              </div>
            );
          })}
        </div>
        {count === 0 ? (
          <p className='p-3 text-xs text-muted-foreground'>
            {t("workbenchExplorer.selectionHint")}
          </p>
        ) : count > 8192 ? (
          <p role='alert' className='p-3 text-xs text-destructive'>
            {t("workbenchExplorer.importLimit", { count: 8192 })}
          </p>
        ) : files.error ? (
          <p role='alert' className='p-3 text-xs text-destructive'>
            {files.error.message}
          </p>
        ) : files.isFetching ? (
          <p role='status' className='p-3 text-xs text-muted-foreground'>
            {t("common.loading")}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
