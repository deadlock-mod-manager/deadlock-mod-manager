import { Button } from "@deadlock-mods/ui/components/button";
import { Input } from "@deadlock-mods/ui/components/input";
import { Switch } from "@deadlock-mods/ui/components/switch";
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
  ExportIcon,
  FileArchiveIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useEffect, useId, useMemo, useState } from "react";
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
import { ArchiveAssetGrid } from "./archive-asset-grid";
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
  | {
      kind: "import";
      addon: ModdingAddon;
      onImported: (hierarchy: "content" | "game") => void;
    }
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
  const [compiledOnly, setCompiledOnly] = useState(false);
  const [exportAddon, setExportAddon] = useState("");
  const [assetView, setAssetView] = useState(true);
  const [treeOpen, setTreeOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(
    mode.kind === "import" || initialView.selection.length > 0,
  );
  const addons = useQuery({
    queryKey: ["workbench-addons"],
    queryFn: () => invoke<ModdingAddon[]>("list_modding_addons"),
    enabled: mode.kind === "browse",
  });
  const [showTreeFiles, setShowTreeFiles] = useState(false);
  const treeFilesId = useId();
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
        compiledOnly,
        addonId: mode.addon.id,
        selections: archiveSelectionPayload(selection),
      });
    },
    onSuccess: async () => {
      if (mode.kind !== "import") return;
      await client.invalidateQueries({
        queryKey: ["workbench-files", mode.addon.id],
      });
      mode.onImported(compiledOnly ? "game" : "content");
    },
  });
  const exportFiles = useMutation({
    mutationKey: ["workbench-export"],
    mutationFn: async (decompile: boolean) => {
      const targetAddon = addons.data?.find(
        (addon) => addon.id === exportAddon,
      );
      const destination = targetAddon
        ? decompile
          ? targetAddon.contentPath
          : targetAddon.gamePath
        : await openDialog({ directory: true, multiple: false });
      if (!destination) return null;
      const result = await invoke<ModdingImportResult>(
        "export_modding_archive_files",
        {
          archivePath,
          destination: targetAddon ? null : destination,
          addonId: targetAddon?.id ?? null,
          decompile,
          selections: archiveSelectionPayload(selection),
        },
      );
      if (targetAddon) {
        await client.invalidateQueries({
          queryKey: ["workbench-files", targetAddon.id],
        });
        await client.invalidateQueries({
          queryKey: ["workbench-batch-files", targetAddon.id],
        });
      }
      return { ...result, destination };
    },
  });
  const select = (nodes: ModdingArchiveEntry[], checked: boolean) => {
    if (checked) setExportOpen(true);
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
      <div className='flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b bg-card/50 px-2 py-1'>
        {mode.kind === "browse" ? (
          <h2
            title={archivePath}
            className='mr-2 flex max-w-40 shrink-0 items-center gap-2 text-xs font-medium'>
            <FileArchiveIcon
              aria-hidden
              className='size-4 shrink-0 text-muted-foreground'
            />
            <span className='truncate'>{label}</span>
          </h2>
        ) : null}
        <Button
          size='icon'
          variant={treeOpen ? "secondary" : "ghost"}
          className='size-7'
          aria-label={t("workbenchExplorer.archiveTree")}
          title={t("workbenchExplorer.archiveTree")}
          aria-pressed={treeOpen}
          onClick={() => setTreeOpen(!treeOpen)}>
          <TreeStructureIcon />
        </Button>
        <div
          role='group'
          aria-label={t("workbenchAssets.view")}
          className='mr-1 flex gap-0.5'>
          <Button
            size='sm'
            className='h-7 px-2'
            variant={assetView ? "secondary" : "ghost"}
            aria-pressed={assetView}
            onClick={() => setAssetView(true)}>
            {t("workbenchAssets.assets")}
          </Button>
          <Button
            size='sm'
            className='h-7 px-2'
            variant={assetView ? "ghost" : "secondary"}
            aria-pressed={!assetView}
            onClick={() => setAssetView(false)}>
            {t("workbenchAssets.files")}
          </Button>
        </div>
        <Button
          size='icon'
          className='size-7'
          variant='ghost'
          aria-label={t("workbenchExplorer.backFolder")}
          disabled={busy || history.index === 0}
          onClick={() => moveHistory(history.index - 1)}>
          <ArrowLeftIcon />
        </Button>
        <Button
          size='icon'
          className='size-7'
          variant='ghost'
          aria-label={t("workbenchExplorer.forwardFolder")}
          disabled={busy || history.index === history.paths.length - 1}
          onClick={() => moveHistory(history.index + 1)}>
          <ArrowRightIcon />
        </Button>
        <Button
          size='icon'
          className='size-7'
          variant='ghost'
          aria-label={t("workbenchExplorer.parentFolder")}
          disabled={busy || !directory}
          onClick={() => navigate(directory.split("/").slice(0, -1).join("/"))}>
          <ArrowUpIcon />
        </Button>
        <Input
          className='h-7 w-28 min-w-0 font-mono text-[11px]'
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
          className='ml-1 h-7 max-w-28 rounded border bg-background px-1.5 text-[11px]'
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
        <div className='relative ml-1 min-w-32 flex-1'>
          <MagnifyingGlassIcon className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            className='h-7 pl-8 text-xs'
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
        <Button
          size='sm'
          variant={exportOpen ? "secondary" : "ghost"}
          className='h-7 px-2'
          aria-expanded={exportOpen}
          disabled={busy || mode.kind === "import"}
          onClick={() => setExportOpen(!exportOpen)}>
          <ExportIcon />
          {t("workbenchHome.export")}
          {count > 0 ? (
            <span className='font-mono text-[10px]'>{count}</span>
          ) : null}
        </Button>
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
      <ResizablePanelGroup
        deferResize
        direction='horizontal'
        className='min-h-0 flex-1'>
        {treeOpen ? (
          <>
            <ResizablePanel
              id='archive-tree'
              order={1}
              defaultSize={16}
              minSize={12}
              maxSize={28}>
              <aside className='flex h-full min-h-0 flex-col bg-muted/15'>
                <div className='flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2'>
                  <label
                    htmlFor={treeFilesId}
                    className='cursor-pointer text-xs'>
                    {t("workbenchExplorer.showTreeFiles")}
                  </label>
                  <Switch
                    id={treeFilesId}
                    checked={showTreeFiles}
                    onCheckedChange={setShowTreeFiles}
                    disabled={busy}
                  />
                </div>
                <div
                  className='min-h-0 flex-1 overflow-auto py-2'
                  role='tree'
                  aria-label={t("workbenchExplorer.archiveTree")}>
                  <AssetImportFolder
                    node={root}
                    showFiles={showTreeFiles}
                    previewed={previewed}
                    onPreview={(path) => {
                      const parent = path.slice(
                        0,
                        Math.max(0, path.lastIndexOf("/")),
                      );
                      if (parent !== directory) navigate(parent);
                      preview(path);
                    }}
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
                    <p
                      role='status'
                      className='p-3 text-xs text-muted-foreground'>
                      {t("common.loading")}
                    </p>
                  ) : null}
                </div>
              </aside>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        ) : null}
        <ResizablePanel
          id='archive-files'
          order={2}
          defaultSize={28}
          minSize={18}
          maxSize={45}>
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
            {assetView && searchMode === "paths" ? (
              <ArchiveAssetGrid
                archivePath={archivePath}
                directory={directory}
                search={debouncedSearch}
                regex={regex}
                selected={previewed}
                selection={selection}
                disabled={busy}
                onPreview={preview}
                onSelect={(entry, checked) => select([entry], checked)}
              />
            ) : searchMode === "contents" ? (
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
        <ResizablePanel
          id='archive-preview'
          order={3}
          defaultSize={72}
          minSize={35}>
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
        {exportOpen ? (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id='archive-selection'
              order={4}
              defaultSize={18}
              minSize={12}
              maxSize={30}>
              <AssetSelectionSidebar
                archivePath={archivePath}
                selection={selection}
                count={count}
                disabled={busy}
                onPreview={preview}
                onRemove={(node) => select([node], false)}
              />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
      {exportOpen ? (
        <div className='shrink-0 space-y-2 border-t bg-card px-3 py-2'>
          <div className='flex items-start gap-2 text-xs text-muted-foreground'>
            <FolderOpenIcon className='mt-0.5 size-4 shrink-0' />
            <p
              className='min-w-0 truncate'
              title={
                mode.kind === "import"
                  ? compiledOnly
                    ? mode.addon.gamePath
                    : mode.addon.contentPath
                  : undefined
              }>
              {mode.kind === "import"
                ? `${t(compiledOnly ? "workbenchExplorer.compiledDestination" : "workbenchExplorer.decompileDestination")} ${compiledOnly ? mode.addon.gamePath : mode.addon.contentPath}`
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
            <div className='flex flex-wrap items-center gap-3'>
              {mode.kind === "import" ? (
                <label className='flex max-w-sm cursor-pointer items-start gap-2 text-xs'>
                  <input
                    type='checkbox'
                    className='mt-0.5'
                    disabled={busy}
                    checked={compiledOnly}
                    onChange={(event) => setCompiledOnly(event.target.checked)}
                  />
                  <span>
                    <span className='block font-medium'>
                      {t("workbenchExplorer.compiledOnly")}
                    </span>
                    <span className='text-[11px] text-muted-foreground'>
                      {t("workbenchExplorer.compiledOnlyHint")}
                    </span>
                  </span>
                </label>
              ) : null}
              {mode.kind === "import" ? (
                <Button
                  disabled={!count || count > MAX_IMPORT_FILES || busy}
                  onClick={() => importFiles.mutate()}>
                  {t(
                    busy
                      ? "workbenchExplorer.importing"
                      : compiledOnly
                        ? "workbenchExplorer.importCompiled"
                        : "workbenchExplorer.decompileSelected",
                  )}
                </Button>
              ) : (
                <>
                  <select
                    aria-label={t("workbenchArchives.exportTarget")}
                    value={exportAddon}
                    disabled={busy}
                    onChange={(event) => {
                      setExportAddon(event.target.value);
                      exportFiles.reset();
                    }}
                    className='h-9 max-w-52 rounded border bg-background px-2 text-xs'>
                    <option value=''>
                      {t("workbenchArchives.exportFolder")}
                    </option>
                    {addons.data?.map((addon) => (
                      <option key={addon.id} value={addon.id}>
                        {addon.name}
                      </option>
                    ))}
                  </select>
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
      ) : null}
    </div>
  );
};
