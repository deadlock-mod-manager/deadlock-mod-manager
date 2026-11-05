import { Button } from "@deadlock-mods/ui/components/button";
import { CubeIcon, SparkleIcon } from "@phosphor-icons/react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  assetSelectionState,
  type AssetSelection,
} from "@/lib/modding-asset-selection";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import { AssetThumbnailRenderer } from "./asset-thumbnail-renderer";

const PAGE_SIZE = 24;
export const archiveAssetsKey = (
  archivePath: string,
  directory: string,
  search: string,
  regex: boolean,
) => ["workbench-archive-assets", archivePath, directory, search, regex];

interface Props {
  archivePath: string;
  directory: string;
  search: string;
  regex: boolean;
  selected: string;
  selection: AssetSelection;
  disabled: boolean;
  onPreview: (path: string) => void;
  onSelect: (entry: ModdingArchiveEntry, checked: boolean) => void;
}

export function ArchiveAssetGrid({
  archivePath,
  directory,
  search,
  regex,
  selected,
  selection,
  disabled,
  onPreview,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [page, setPage] = useState(0);
  const foreground =
    useIsFetching({
      predicate: (query) => query.meta?.foregroundPreview === true,
    }) > 0;
  const files = useQuery({
    queryKey: archiveAssetsKey(archivePath, directory, search, regex),
    queryFn: () =>
      invoke<ModdingArchiveEntry[]>("list_modding_archive_files", {
        archivePath,
        directory,
        search,
        regex,
        assetsOnly: true,
      }),
    staleTime: 60_000,
  });
  const thumbnailKey = ["workbench-archive-thumbnails", archivePath];
  const { data: thumbnails } = useQuery({
    queryKey: thumbnailKey,
    queryFn: () => new Map<string, string | null>(),
    initialData: () => new Map<string, string | null>(),
    staleTime: Infinity,
    gcTime: 60_000,
  });
  const entries = files.data ?? [];
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1),
  );
  const pageEntries = entries.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const pending = foreground
    ? undefined
    : pageEntries.find((entry) => !thumbnails.has(entry.path));
  return (
    <div className='flex min-h-0 flex-1 flex-col'>
      <div className='min-h-0 flex-1 overflow-auto p-3'>
        {files.error ? (
          <p role='alert' className='text-xs text-destructive'>
            {files.error.message}
          </p>
        ) : null}
        <div className='grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5'>
          {pageEntries.map((entry) => {
            const model = /\.vmdl(_c)?$/i.test(entry.path);
            const image = thumbnails.get(entry.path);
            return (
              <div
                key={entry.path}
                className={`min-w-0 overflow-hidden rounded-md border ${selected === entry.path ? "border-primary bg-primary/10" : "border-border/70 bg-background/65"}`}>
                <button
                  type='button'
                  disabled={disabled}
                  title={entry.path}
                  aria-pressed={selected === entry.path}
                  onClick={() => onPreview(entry.path)}
                  className='block w-full text-left hover:bg-muted/60'>
                  <span className='relative flex aspect-[4/3] items-center justify-center bg-muted/30'>
                    {image ? (
                      <img
                        src={image}
                        alt={t(
                          model
                            ? "workbenchAssets.modelPreview"
                            : "workbenchAssets.particlePreview",
                        )}
                        className='absolute inset-0 size-full object-cover'
                      />
                    ) : model ? (
                      <CubeIcon
                        aria-hidden
                        weight='duotone'
                        className='size-8 text-muted-foreground/50'
                      />
                    ) : (
                      <SparkleIcon
                        aria-hidden
                        weight='duotone'
                        className='size-8 text-muted-foreground/50'
                      />
                    )}
                  </span>
                  <span className='block truncate px-2 pt-2 text-xs font-medium'>
                    {entry.name}
                  </span>
                  <span className='block truncate px-2 pb-2 text-[10px] text-muted-foreground'>
                    {image === null
                      ? t("workbenchAssets.previewUnavailable")
                      : entry.path.split("/").slice(0, -1).join("/")}
                  </span>
                </button>
                <label className='flex cursor-pointer items-center gap-2 border-t px-2 py-1.5 text-[10px] text-muted-foreground'>
                  <input
                    type='checkbox'
                    checked={assetSelectionState(selection, entry) === true}
                    disabled={disabled}
                    onChange={(event) => onSelect(entry, event.target.checked)}
                  />
                  {t("workbenchArchives.selectAsset")}
                </label>
              </div>
            );
          })}
        </div>
        {!entries.length && !files.error ? (
          <p
            role='status'
            className='py-8 text-center text-sm text-muted-foreground'>
            {t(files.isPending ? "common.loading" : "workbenchAssets.empty")}
          </p>
        ) : null}
      </div>
      <div className='flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground'>
        <span>
          {t("workbenchAssets.assetCount", { count: entries.length })}
        </span>
        {entries.length > PAGE_SIZE ? (
          <div className='flex items-center gap-1'>
            <Button
              size='sm'
              variant='ghost'
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}>
              {t("workbenchAssets.previous")}
            </Button>
            <span>
              {t("workbenchAssets.page", {
                page: currentPage + 1,
                count: Math.ceil(entries.length / PAGE_SIZE),
              })}
            </span>
            <Button
              size='sm'
              variant='ghost'
              disabled={(currentPage + 1) * PAGE_SIZE >= entries.length}
              onClick={() => setPage(currentPage + 1)}>
              {t("workbenchAssets.next")}
            </Button>
          </div>
        ) : null}
      </div>
      {pending ? (
        <AssetThumbnailRenderer
          key={pending.path}
          archivePath={archivePath}
          hierarchy='game'
          path={pending.path}
          revision={0}
          onReady={(image) =>
            client.setQueryData<Map<string, string | null>>(
              thumbnailKey,
              (previous) => {
                const next = new Map(previous);
                next.set(pending.path, image);
                let bytes = [...next.values()].reduce(
                  (sum, value) => sum + (value?.length ?? 0),
                  0,
                );
                while (next.size > 128 || bytes > 8 * 1024 * 1024) {
                  const oldest = next.keys().next().value;
                  if (oldest === undefined) break;
                  bytes -= next.get(oldest)?.length ?? 0;
                  next.delete(oldest);
                }
                return next;
              },
            )
          }
        />
      ) : null}
    </div>
  );
}
