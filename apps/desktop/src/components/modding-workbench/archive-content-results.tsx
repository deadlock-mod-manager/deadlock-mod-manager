import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import type { ModdingContentSearchFile } from "@/types/generated/ModdingContentSearchFile";
import {
  assetSelectionState,
  type AssetSelection,
} from "@/lib/modding-asset-selection";
import type {
  ArchiveContentTarget,
  archiveContentSearchPhase,
} from "@/lib/archive-content-search";
import { AssetImportCheckbox } from "./asset-import-checkbox";
import { ContentMatchText } from "./content-match-text";

export function ArchiveContentResults({
  files,
  selection,
  disabled,
  target,
  phase,
  onSelect,
  onSelectAll,
  onPreview,
}: {
  files: ModdingContentSearchFile[];
  selection: AssetSelection;
  disabled: boolean;
  target: ArchiveContentTarget | null;
  phase: ReturnType<typeof archiveContentSearchPhase>;
  onSelect: (entry: ModdingArchiveEntry, checked: boolean) => void;
  onSelectAll: (entries: ModdingArchiveEntry[], checked: boolean) => void;
  onPreview: (target: ArchiveContentTarget) => void;
}) {
  const { t } = useTranslation();
  const scroll = useRef<HTMLDivElement>(null);
  const rows = useVirtualizer({
    count: files.length,
    getScrollElement: () => scroll.current,
    estimateSize: (index) => 64 + (files[index]?.matches.length ?? 0) * 30,
    overscan: 5,
  });
  const states = files.map((file) =>
    assetSelectionState(selection, file.entry),
  );
  const all = states.length > 0 && states.every((state) => state === true);
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-3 text-xs'>
        <AssetImportCheckbox
          label={t("workbenchExplorer.selectListed")}
          checked={
            all
              ? true
              : states.some((state) => state !== false)
                ? "indeterminate"
                : false
          }
          disabled={disabled || !files.length}
          onCheckedChange={(checked) =>
            onSelectAll(
              files.map((file) => file.entry),
              checked,
            )
          }
        />
        <span>
          {t("workbenchContentSearch.matchingFiles", { count: files.length })}
        </span>
      </div>
      <div
        ref={scroll}
        className='min-h-0 flex-1 overflow-auto'
        aria-label={t("workbenchContentSearch.results")}>
        <div className='relative' style={{ height: rows.getTotalSize() }}>
          {rows.getVirtualItems().map((row) => {
            const file = files[row.index];
            if (!file) return null;
            return (
              <div
                key={file.entry.path}
                className={`absolute left-0 top-0 w-full border-b px-3 py-2 ${target?.path === file.entry.path ? "bg-accent/40" : ""}`}
                style={{
                  height: row.size,
                  transform: `translateY(${row.start}px)`,
                }}>
                <div className='flex items-center gap-2'>
                  <AssetImportCheckbox
                    label={t("workbenchExplorer.selectAsset", {
                      path: file.entry.path,
                    })}
                    checked={assetSelectionState(selection, file.entry)}
                    disabled={disabled}
                    onCheckedChange={(checked) => onSelect(file.entry, checked)}
                  />
                  <button
                    type='button'
                    className='min-w-0 flex-1 text-left text-xs'
                    title={file.entry.path}
                    disabled={disabled}
                    onClick={() => {
                      const match = file.matches[0];
                      if (match) onPreview({ path: file.entry.path, match });
                    }}>
                    <span className='block truncate font-medium'>
                      {file.entry.name}
                    </span>
                    <span className='block truncate text-[10px] text-muted-foreground'>
                      {file.entry.path}
                    </span>
                  </button>
                  <span
                    className='shrink-0 text-[10px] text-muted-foreground'
                    title={t("workbenchContentSearch.matchingLines", {
                      count: file.matchingLines,
                    })}>
                    {file.matchingLines}
                  </span>
                </div>
                {file.matches.map((match) => (
                  <button
                    key={match.line}
                    type='button'
                    disabled={disabled}
                    className='flex h-[30px] w-full items-center gap-2 overflow-hidden rounded px-1 text-left font-mono text-[11px] hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring'
                    aria-label={t("workbenchContentSearch.openMatch", {
                      path: file.entry.path,
                      line: match.line,
                    })}
                    title={match.snippet}
                    onClick={() => onPreview({ path: file.entry.path, match })}>
                    <span className='shrink-0 tabular-nums text-muted-foreground'>
                      {match.line}
                    </span>
                    <span className='truncate whitespace-pre'>
                      <ContentMatchText
                        text={match.snippet}
                        start={match.matchStart}
                        end={match.matchEnd}
                      />
                    </span>
                  </button>
                ))}
                {file.matchingLines > file.matches.length ? (
                  <p className='text-[10px] text-muted-foreground'>
                    {t("workbenchContentSearch.moreLines", {
                      count: file.matchingLines - file.matches.length,
                    })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
        {!files.length ? (
          <p className='p-4 text-sm text-muted-foreground'>
            {t(
              phase === "complete"
                ? "workbenchContentSearch.noMatches"
                : phase === "searching"
                  ? "workbenchContentSearch.searchingRemaining"
                  : "workbenchContentSearch.noMatchesYet",
            )}
          </p>
        ) : null}
      </div>
    </div>
  );
}
