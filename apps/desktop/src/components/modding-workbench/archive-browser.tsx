import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@deadlock-mods/ui/components/resizable";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  FolderOpenIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  archiveQueryKey,
  archiveSelectionPayload,
  assetSelectionCount,
  selectArchiveAssets,
  type AssetSelectionRule,
} from "@/lib/modding-asset-selection";
import type { ModdingAddon } from "@/types/generated/ModdingAddon";
import type { ModdingArchiveEntry } from "@/types/generated/ModdingArchiveEntry";
import type { ModdingImportResult } from "@/types/generated/ModdingImportResult";
import { AssetImportFolder } from "./asset-import-folder";
import { AssetImportList } from "./asset-import-list";
import { AssetPreview } from "./asset-preview";
import { AssetSelectionSidebar } from "./asset-selection-sidebar";
import { ArchiveContentSearchPanel } from "./archive-content-search-panel";
import { ArchiveContentPreview } from "./archive-content-preview";
import {
  useArchiveContentSearch,
  type ArchiveContentQuery,
} from "./use-archive-content-search";
import {
  CONTENT_SEARCH_RESULT_LIMIT,
  type ArchiveContentTarget,
} from "@/lib/archive-content-search";

type ArchiveMode =
  | { kind: "import"; addon: ModdingAddon; onImported: () => void }
  | { kind: "browse"; archivePath: string; label: string };

import {
  emptyWorkspaceView,
  type WorkspaceView,
} from "@/lib/modding-workspace";

interface Props {
  initialView?: WorkspaceView;
  onViewChange?: (view: WorkspaceView) => void;
  mode: ArchiveMode;
}

const MAX_IMPORT_FILES = 8192;

export const ArchiveBrowser = ({
  mode,
  initialView = emptyWorkspaceView(),
  onViewChange,
}: Props) => {
  const archivePath =
    mode.kind === "import" ? mode.addon.archivePath : mode.archivePath;
  const label = mode.kind === "import" ? "pak01_dir.vpk" : mode.label;
  const { t } = useTranslation();
  const client = useQueryClient();
  const [history, setHistory] = useState({
    paths: [initialView.directory],
    index: 0,
  });
  const directory = history.paths[history.index] ?? "";
  const [pathText, setPathText] = useState(initialView.directory);
  const [search, setSearch] = useState(initialView.search);
  const [regex, setRegex] = useState(initialView.regex);
  const [searchMode, setSearchMode] = useState(initialView.searchMode);
  const [caseSensitive, setCaseSensitive] = useState(
    initialView.contentCaseSensitive,
  );
  const [pathFilter, setPathFilter] = useState(initialView.contentPathFilter);
  const [contentRequest, setContentRequest] =
    useState<ArchiveContentQuery | null>(null);
  const [contentTarget, setContentTarget] =
    useState<ArchiveContentTarget | null>(null);
  const [showContentMatch, setShowContentMatch] = useState(true);
  const content = useArchiveContentSearch(archivePath, contentRequest);
  const contentFiles =
    content.data?.pages
      .flatMap((page) => page.files)
      .slice(0, CONTENT_SEARCH_RESULT_LIMIT) ?? [];
  const preview = (path: string) => {
    setPreviewed(path);
    setContentTarget(null);
  };
  const submitContent = () => {
    if (!search.trim() || content.phase === "searching" || content.isFetching)
      return;
    setContentRequest({
      directory,
      query: search,
      regex,
      caseSensitive,
      pathFilter,
      id: crypto.randomUUID(),
    });
  };
  const [previewed, setPreviewed] = useState(initialView.path);
  const [selection, setSelection] = useState(
    new Map<string, AssetSelectionRule>(
      initialView.selection.map((rule) => [rule.path, rule]),
    ),
  );
  const [expanded, setExpanded] = useState(new Set([""]));
  const debouncedSearch = useDebouncedValue(search, 250);
  const rootListing = useQuery({
    queryKey: archiveQueryKey(archivePath, ""),
    queryFn: () =>
      invoke<ModdingArchiveEntry[]>("list_modding_archive_files", {
        archivePath,
        directory: "",
        search: "",
      }),
    staleTime: 60_000,
  });
  const listing = useQuery({
    queryKey: [
      ...archiveQueryKey(archivePath, directory, debouncedSearch),
      regex,
    ],
    queryFn: () =>
      invoke<ModdingArchiveEntry[]>("list_modding_archive_files", {
        archivePath,
        directory,
        search: debouncedSearch,
        regex,
      }),
    staleTime: 60_000,
    enabled: searchMode === "paths",
  });
  const importFiles = useMutation({
    mutationKey: [
      "workbench-import",
      mode.kind === "import" ? mode.addon.id : archivePath,
    ],
    mutationFn: () => {
      if (mode.kind !== "import") throw new Error("No addon selected");
      return invoke<ModdingImportResult>("import_modding_files", {
        addonId: mode.addon.id,
        selections: archiveSelectionPayload(selection),
      });
    },
    onSuccess: async () => {
      if (mode.kind !== "import") return;
      await client.invalidateQueries({
        queryKey: ["workbench-files", mode.addon.id],
      });
      mode.onImported();
    },
  });
  const exportFiles = useMutation({
    mutationKey: ["workbench-export"],
    mutationFn: async (decompile: boolean) => {
      const destination = await openDialog({
        directory: true,
        multiple: false,
      });
      if (!destination) return null;
      const result = await invoke<ModdingImportResult>(
        "export_modding_archive_files",
        {
          archivePath,
          destination,
          decompile,
          selections: archiveSelectionPayload(selection),
        },
      );
      return { ...result, destination };
    },
  });
  const select = (nodes: ModdingArchiveEntry[], checked: boolean) => {
    importFiles.reset();
    exportFiles.reset();
    setSelection((previous) => selectArchiveAssets(previous, nodes, checked));
  };
  const reveal = (path: string) => {
    setPathText(path);
    setSearch("");
    setContentRequest(null);
    setExpanded((previous) => {
      const next = new Set(previous);
      const parts = path.split("/");
      for (let length = 1; length <= parts.length; length++)
        next.add(parts.slice(0, length).join("/"));
      return next;
    });
  };
  const navigate = (path: string) => {
    if (path !== directory)
      setHistory((previous) => ({
        paths: [...previous.paths.slice(0, previous.index + 1), path],
        index: previous.index + 1,
      }));
    reveal(path);
  };
  const moveHistory = (index: number) => {
    const path = history.paths[index];
    if (path === undefined) return;
    setHistory((previous) => ({ ...previous, index }));
    reveal(path);
  };
  const count = useMemo(() => assetSelectionCount(selection), [selection]);
  const root: ModdingArchiveEntry = {
    path: "",
    name: label,
    directory: true,
    size: BigInt(0),
    fileCount:
      rootListing.data?.reduce((sum, entry) => sum + entry.fileCount, 0) ?? 0,
  };
  const busy = importFiles.isPending || exportFiles.isPending;
  useEffect(() => {
    onViewChange?.({
      ...initialView,
      directory,
      path: previewed,
      search,
      regex,
      searchMode,
      contentCaseSensitive: caseSensitive,
      contentPathFilter: pathFilter,
      selection: [...selection.values()],
    });
  }, [
    directory,
    previewed,
    search,
    regex,
    searchMode,
    caseSensitive,
    pathFilter,
    selection,
    initialView,
    onViewChange,
  ]);
  return (
    <div className='flex h-full min-h-0 flex-col'>
      {mode.kind === "browse" ? (
        <header className='border-b px-4 py-3'>
          <h2 className='truncate text-sm font-semibold'>{label}</h2>
          <p
            className='truncate font-mono text-[11px] text-muted-foreground'
            title={archivePath}>
            {archivePath}
          </p>
        </header>
      ) : null}
      <div className='flex shrink-0 flex-wrap items-center gap-1 border-b px-3 py-2'>
        <Button
          size='icon'
          variant='ghost'
          aria-label={t("workbenchExplorer.backFolder")}
          disabled={busy || history.index === 0}
          onClick={() => moveHistory(history.index - 1)}>
          <ArrowLeftIcon />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          aria-label={t("workbenchExplorer.forwardFolder")}
          disabled={busy || history.index === history.paths.length - 1}
          onClick={() => moveHistory(history.index + 1)}>
          <ArrowRightIcon />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          aria-label={t("workbenchExplorer.parentFolder")}
          disabled={busy || !directory}
          onClick={() => navigate(directory.split("/").slice(0, -1).join("/"))}>
          <ArrowUpIcon />
        </Button>
        <Input
          className='min-w-0 flex-1 font-mono text-xs'
          aria-label={t("workbenchExplorer.archiveFolderPath")}
          placeholder='/'
          value={pathText}
          disabled={busy}
          onChange={(event) => setPathText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter")
              navigate(
                pathText
                  .trim()
                  .replaceAll("\\", "/")
                  .replace(/^\/+|\/+$/g, ""),
              );
          }}
        />
        <select
          className='ml-2 h-9 rounded border bg-background px-2 text-xs'
          aria-label={t("workbenchContentSearch.mode")}
          value={searchMode}
          disabled={busy}
          onChange={(event) => {
            if (
              event.target.value === "paths" ||
              event.target.value === "contents"
            )
              setSearchMode(event.target.value);
            setContentRequest(null);
          }}>
          <option value='paths'>{t("workbenchContentSearch.paths")}</option>
          <option value='contents'>
            {t("workbenchContentSearch.contents")}
          </option>
        </select>
        <div className='relative ml-2 w-64 shrink-0'>
          <MagnifyingGlassIcon className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='pl-8 text-xs'
            aria-label={t(
              searchMode === "contents"
                ? "workbenchContentSearch.query"
                : "workbenchExplorer.searchAssets",
            )}
            placeholder={t(
              searchMode === "contents"
                ? "workbenchContentSearch.query"
                : "workbenchExplorer.searchAssets",
            )}
            aria-invalid={
              regex &&
              !!(searchMode === "contents" ? content.error : listing.error)
            }
            value={search}
            disabled={busy}
            onChange={(event) => {
              setSearch(event.target.value);
              setContentRequest(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchMode === "contents")
                submitContent();
            }}
          />
        </div>
        <Button
          size='sm'
          variant={regex ? "secondary" : "ghost"}
          aria-pressed={regex}
          aria-label={t("workbenchExplorer.regexSearch")}
          disabled={busy}
          onClick={() => {
            setRegex(!regex);
            setContentRequest(null);
          }}>
          <span className='font-mono'>.*</span>
        </Button>
        {searchMode === "contents" ? (
          <>
            <Button
              size='sm'
              variant={caseSensitive ? "secondary" : "ghost"}
              aria-pressed={caseSensitive}
              aria-label={t("workbenchContentSearch.matchCase")}
              disabled={busy}
              onClick={() => {
                setCaseSensitive(!caseSensitive);
                setContentRequest(null);
              }}>
              <span className='font-mono'>Aa</span>
            </Button>
            <Button
              size='sm'
              disabled={
                busy ||
                !search.trim() ||
                content.phase === "searching" ||
                content.isFetching
              }
              onClick={submitContent}>
              {t(
                content.phase === "searching"
                  ? "workbenchContentSearch.searching"
                  : "workbenchContentSearch.search",
              )}
            </Button>
          </>
        ) : null}
      </div>
      {searchMode === "contents" ? (
        <div className='flex shrink-0 flex-wrap items-center gap-3 border-b px-3 py-2 text-xs'>
          <Input
            className='h-8 w-64 text-xs'
            aria-label={t("workbenchContentSearch.pathFilter")}
            placeholder={t("workbenchContentSearch.pathFilter")}
            disabled={busy}
            value={pathFilter}
            onChange={(event) => {
              setPathFilter(event.target.value);
              setContentRequest(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitContent();
            }}
          />
          <p className='min-w-0 flex-1 text-[11px] text-muted-foreground'>
            {t("workbenchContentSearch.scope", {
              folder: directory ? `/${directory}` : "/",
            })}
          </p>
        </div>
      ) : null}
      <ResizablePanelGroup direction='horizontal' className='min-h-0 flex-1'>
        <ResizablePanel defaultSize={18} minSize={12} maxSize={30}>
          <aside
            className='h-full overflow-auto bg-muted/15 py-2'
            role='tree'
            aria-label={t("workbenchExplorer.archiveFolders")}>
            <AssetImportFolder
              node={root}
              archivePath={archivePath}
              directory={directory}
              depth={0}
              expanded={expanded}
              selection={selection}
              disabled={busy}
              onNavigate={navigate}
              onSelect={(node, checked) => select([node], checked)}
              onExpand={(path) =>
                setExpanded((previous) => {
                  const next = new Set(previous);
                  if (next.has(path)) next.delete(path);
                  else next.add(path);
                  return next;
                })
              }
            />
            {rootListing.isPending ? (
              <p role='status' className='p-3 text-xs text-muted-foreground'>
                {t("common.loading")}
              </p>
            ) : null}
          </aside>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={38} minSize={25}>
          <section
            className='flex h-full min-h-0 flex-col'
            aria-label={t("workbenchExplorer.archiveFiles")}
            aria-busy={
              (searchMode === "contents"
                ? content.phase === "searching"
                : listing.isFetching) || busy
            }>
            <div className='flex h-9 shrink-0 items-center justify-between gap-3 border-b px-3 text-xs text-muted-foreground'>
              <span className='truncate font-mono' title={directory}>
                /{directory}
              </span>
              <span className='shrink-0'>
                {t("workbenchExplorer.archiveItems", {
                  count:
                    searchMode === "contents"
                      ? contentFiles.length
                      : (listing.data?.length ?? 0),
                })}
              </span>
            </div>
            {searchMode === "contents" ? (
              <ArchiveContentSearchPanel
                search={content}
                submitted={contentRequest !== null}
                selection={selection}
                disabled={busy}
                target={contentTarget}
                onSelect={(node, checked) => select([node], checked)}
                onSelectAll={select}
                onPreview={(target) => {
                  setPreviewed(target.path);
                  setContentTarget(target);
                  setShowContentMatch(true);
                }}
              />
            ) : listing.error ? (
              <p role='alert' className='p-3 text-sm text-destructive'>
                {listing.error.message}
              </p>
            ) : listing.isPending ? (
              <p role='status' className='p-3 text-sm text-muted-foreground'>
                {t("common.loading")}
              </p>
            ) : (
              <AssetImportList
                key={`${directory}:${debouncedSearch}`}
                entries={listing.data ?? []}
                selection={selection}
                disabled={busy}
                searching={!!debouncedSearch}
                previewed={previewed}
                onPreview={preview}
                onNavigate={navigate}
                onSelect={(node, checked) => select([node], checked)}
                onSelectAll={select}
              />
            )}
            {searchMode === "paths" &&
            debouncedSearch &&
            listing.data?.length === 2000 ? (
              <p className='border-t px-3 py-2 text-xs text-muted-foreground'>
                {t("workbenchExplorer.searchLimit")}
              </p>
            ) : null}
          </section>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={27} minSize={18}>
          <div className='flex h-full min-h-0 flex-col'>
            {contentTarget ? (
              <div className='flex shrink-0 gap-1 border-b p-2'>
                <Button
                  size='sm'
                  variant={showContentMatch ? "secondary" : "ghost"}
                  onClick={() => setShowContentMatch(true)}>
                  {t("workbenchContentSearch.matchPreview")}
                </Button>
                <Button
                  size='sm'
                  variant={showContentMatch ? "ghost" : "secondary"}
                  onClick={() => setShowContentMatch(false)}>
                  {t("workbenchExplorer.preview")}
                </Button>
              </div>
            ) : null}
            <div className='min-h-0 flex-1'>
              {contentTarget && showContentMatch ? (
                <ArchiveContentPreview
                  archivePath={archivePath}
                  target={contentTarget}
                />
              ) : (
                <AssetPreview
                  key={previewed}
                  location={{ kind: "archive", archivePath }}
                  path={previewed}
                  revision={0}
                />
              )}
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={17} minSize={12}>
          <AssetSelectionSidebar
            archivePath={archivePath}
            selection={selection}
            count={count}
            disabled={busy}
            onPreview={preview}
            onRemove={(node) => select([node], false)}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      <div className='space-y-3 border-t px-5 py-3'>
        <div className='flex items-start gap-2 text-xs text-muted-foreground'>
          <FolderOpenIcon className='mt-0.5 size-4 shrink-0' />
          <p
            className='min-w-0 truncate'
            title={mode.kind === "import" ? mode.addon.contentPath : undefined}>
            {mode.kind === "import"
              ? `${t("workbenchExplorer.decompileDestination")} ${mode.addon.contentPath}`
              : t("workbenchArchives.exportHint")}
          </p>
        </div>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex items-center gap-2'>
            <p
              role='status'
              className='min-w-0 break-words text-sm text-muted-foreground'>
              {exportFiles.data
                ? t("workbenchArchives.exported", exportFiles.data)
                : importFiles.data
                  ? t("workbenchExplorer.imported", importFiles.data)
                  : t("workbenchExplorer.selected", { count })}
            </p>
            {selection.size ? (
              <Button
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() => {
                  setSelection(new Map());
                  importFiles.reset();
                  exportFiles.reset();
                }}>
                {t("workbenchExplorer.clearSelection")}
              </Button>
            ) : null}
          </div>
          <div className='flex gap-2'>
            {mode.kind === "import" ? (
              <Button
                disabled={!count || count > MAX_IMPORT_FILES || busy}
                onClick={() => importFiles.mutate()}>
                {t(
                  busy
                    ? "workbenchExplorer.importing"
                    : "workbenchExplorer.decompileSelected",
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant='outline'
                  disabled={!count || count > MAX_IMPORT_FILES || busy}
                  onClick={() => exportFiles.mutate(false)}>
                  {t("workbenchArchives.exportOriginals")}
                </Button>
                <Button
                  disabled={!count || count > MAX_IMPORT_FILES || busy}
                  onClick={() => exportFiles.mutate(true)}>
                  {t(
                    busy
                      ? "workbenchArchives.exporting"
                      : "workbenchArchives.exportEditable",
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
        {count > MAX_IMPORT_FILES ? (
          <p role='alert' className='text-xs text-destructive'>
            {t("workbenchExplorer.importLimit", { count: MAX_IMPORT_FILES })}
          </p>
        ) : null}
        {importFiles.error || exportFiles.error ? (
          <p role='alert' className='text-sm text-destructive'>
            {(importFiles.error ?? exportFiles.error)?.message}
          </p>
        ) : null}
      </div>
    </div>
  );
};
