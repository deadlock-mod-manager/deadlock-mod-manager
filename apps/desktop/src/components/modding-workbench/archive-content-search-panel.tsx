import { Button } from "@deadlock-mods/ui/components/button";
import { useTranslation } from "react-i18next";
import {
  CONTENT_SEARCH_RESULT_LIMIT,
  type ArchiveContentTarget,
} from "@/lib/archive-content-search";
import type { AssetSelection } from "@/lib/modding-asset-selection";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import { ArchiveContentResults } from "./archive-content-results";
import type { useArchiveContentSearch } from "./use-archive-content-search";

export function ArchiveContentSearchPanel({
  search,
  submitted,
  selection,
  disabled,
  target,
  onSelect,
  onSelectAll,
  onPreview,
}: {
  search: ReturnType<typeof useArchiveContentSearch>;
  submitted: boolean;
  selection: AssetSelection;
  disabled: boolean;
  target: ArchiveContentTarget | null;
  onSelect: (node: ModdingArchiveEntry, checked: boolean) => void;
  onSelectAll: (nodes: ModdingArchiveEntry[], checked: boolean) => void;
  onPreview: (target: ArchiveContentTarget) => void;
}) {
  const { t } = useTranslation();
  const pages = search.data?.pages ?? [];
  const files = pages
    .flatMap((page) => page.files)
    .slice(0, CONTENT_SEARCH_RESULT_LIMIT);
  const diagnostics = [
    ...new Set(pages.flatMap((page) => page.diagnostics)),
  ].slice(0, 10);
  return (
    <>
      {search.error ? (
        <p role='alert' className='p-3 text-sm text-destructive'>
          {search.error.message}
        </p>
      ) : null}
      {!submitted ? (
        <p className='p-4 text-sm text-muted-foreground'>
          {t("workbenchContentSearch.startHint")}
        </p>
      ) : search.isPending && !search.error ? (
        <p role='status' className='p-4 text-sm text-muted-foreground'>
          {t(
            search.phase === "paused"
              ? "workbenchContentSearch.paused"
              : "workbenchContentSearch.searching",
          )}
        </p>
      ) : search.data ? (
        <ArchiveContentResults
          files={files}
          selection={selection}
          disabled={disabled}
          target={target}
          phase={search.phase}
          onSelect={onSelect}
          onSelectAll={onSelectAll}
          onPreview={onPreview}
        />
      ) : null}
      {submitted ? (
        <div className='shrink-0 space-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground'>
          <div className='flex items-center justify-between gap-3'>
            <div role='status' className='space-y-1'>
              <p>
                {t("workbenchContentSearch.scanned", {
                  count: pages.reduce(
                    (sum, page) => sum + page.scannedFiles,
                    0,
                  ),
                  skipped: pages.reduce(
                    (sum, page) => sum + page.skippedFiles,
                    0,
                  ),
                })}
              </p>
              <p>
                {t(
                  search.phase === "complete"
                    ? "workbenchContentSearch.complete"
                    : search.phase === "limit"
                      ? "workbenchContentSearch.resultLimit"
                      : search.phase === "error"
                        ? "workbenchContentSearch.interrupted"
                        : search.phase === "paused"
                          ? search.isFetching
                            ? "workbenchContentSearch.pausing"
                            : "workbenchContentSearch.paused"
                          : "workbenchContentSearch.searchingRemaining",
                )}
              </p>
            </div>
            {search.phase === "searching" || search.phase === "paused" ? (
              <Button
                size='sm'
                variant='outline'
                onClick={
                  search.phase === "paused" ? search.resume : search.pause
                }>
                {t(
                  search.phase === "paused"
                    ? "workbenchContentSearch.resume"
                    : "workbenchContentSearch.pause",
                )}
              </Button>
            ) : null}
          </div>
          {diagnostics.length ? (
            <details>
              <summary>{t("workbenchContentSearch.skippedDetails")}</summary>
              {diagnostics.map((diagnostic) => (
                <p key={diagnostic} className='break-words'>
                  {diagnostic}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
