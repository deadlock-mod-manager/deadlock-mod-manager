import { LibrarySelectionBar } from "@/components/my-mods/library-selection-bar";
import { ModGroupTools } from "@/components/my-mods/mod-group-tools";
import { NukeReinstallDialog } from "@/components/my-mods/nuke-reinstall-dialog";
import { groupLibraryMods } from "@/lib/mods/library-groups";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@deadlock-mods/ui/components/empty";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@deadlock-mods/ui/components/tooltip";
import {
  ArrowUpDown,
  Bug,
  Copy,
  EllipsisVertical,
  FileOutput,
  FolderOpen,
  Layers,
  LayoutGrid,
  LayoutList,
  Power,
  PowerOff,
  RefreshCw,
  ScanSearch,
  SquareCheck,
  TriangleAlert,
  Wrench,
} from "@deadlock-mods/ui/icons";
import { Radioactive } from "@phosphor-icons/react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import SearchBar from "@/components/mod-browsing/search-bar";
import { SortSelect } from "@/components/mod-browsing/sort-select";
import { VpkScanAlert } from "@/components/mods/vpk-scan-alert";
import { AnalysisProgressToast } from "@/components/my-mods/analysis-progress-toast";
import { AnalysisResultsDialog } from "@/components/my-mods/analysis-results-dialog";
import { BatchUpdateDialog } from "@/components/my-mods/batch-update-dialog";
import { EnableAllRecapDialog } from "@/components/my-mods/enable-all-recap-dialog";
import { BatchUpdateButton } from "@/components/my-mods/batch-update-button";
import { ExportDialog } from "@/components/mod-interchange/export-dialog";
import { AddModsMenu } from "@/components/mod-interchange/add-mods-menu";
import { ConflictsPanel } from "@/components/my-mods/conflicts/conflicts-panel";
import { MyModsEmptyState } from "@/components/my-mods/empty-state";
import { ModOrderingDialog } from "@/components/my-mods/mod-ordering-dialog";
import { ModHealthBanner } from "@/components/mod-health/mod-health-banner";
import {
  useCheckModHealth,
  useIsCheckingModHealth,
  useModHealthReport,
} from "@/hooks/use-mod-health";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useAddonAnalysis } from "@/hooks/use-addon-analysis";
import { useDeleteMods } from "@/hooks/use-delete-mods";
import { useDisableAllMods } from "@/hooks/use-disable-all-mods";
import { useEnableAllMods } from "@/hooks/use-enable-all-mods";
import { useCheckUpdates } from "@/hooks/use-check-updates";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useStuckAttribute } from "@/hooks/use-stuck-attribute";
import { useProfileConflicts } from "@/hooks/use-profile-conflicts";
import { useSearch } from "@/hooks/use-search";
import { useVpkScan } from "@/hooks/use-vpk-scan";
import { openFindBrokenMod } from "@/lib/bisect/dialogs";
import { SortType } from "@/lib/constants";
import { ModCategory } from "@/lib/constants";
import { parseGameBananaReference } from "@/lib/mod-interchange";
import {
  filterLibraryModsByStatus,
  formatModList,
  LibrarySortType,
  ModFilter,
  sortLibraryMods,
} from "@/lib/mods/library-display";
import {
  matchesHeroFilter,
  resolveLocalModHero,
} from "@/lib/mods/hero-resolution";
import { usePersistedStore } from "@/lib/store";
import type {
  AudioQuickFilter,
  FilterMode,
  MapQuickFilter,
} from "@/lib/store/slices/ui";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { healthByModId } from "@/lib/mods/mod-health";
import { cn, isModOutdated } from "@/lib/utils";
import { useThemeBackdropSurfaceStyle } from "@/plugins/themes/components/theme-backdrop";
import { type LocalMod, ModStatus } from "@/types/mods";
import { ModsPagination } from "@/components/my-mods/library/mods-pagination";
import { ViewMode } from "@/components/my-mods/library/library-types";
import { ModsList } from "@/components/my-mods/library/mods-list";

const PAGE_SIZE = 20;

const CONFLICTS_TAB = "conflicts";

const MENU_HINT_MIN_MODS = 8;

const CONTEXT_MENU_HINT_MIN_MODS = 5;

// Below this, turning mods off one by one is about as quick as bisecting.
const FIND_BROKEN_MOD_HINT_MIN_MODS = 6;

const MODS_FOLDER_HINT_MIN_OPENS = 3;

type LibraryTab = ModFilter | typeof CONFLICTS_TAB;

const MODS_STORE_PAGINATION_SETTING_ID = "mods-store-pagination";

const MyMods = () => {
  const { t } = useTranslation();
  const LibraryBanner = useThemeOverride("libraryBanner");
  const isCustomMapsEnabled = useExperimentalFeature("custom-maps");
  const isConflictDetectionEnabled =
    useExperimentalFeature("conflict-detection");
  const mods = usePersistedStore((state) => state.localMods);
  const activeProfileId = usePersistedStore((state) => state.activeProfileId);
  const modGroups = usePersistedStore(
    (state) => state.profiles[activeProfileId]?.modGroups ?? EMPTY_MOD_GROUPS,
  );
  const isSwitching = usePersistedStore((state) => state.isSwitching);
  const [selection, setSelection] = useState<{
    profileId: string;
    ids: Set<string>;
  } | null>(null);
  useEffect(() => setSelection(null), [activeProfileId]);
  const selecting = selection?.profileId === activeProfileId;
  const selectedIds = new Set(
    mods
      .filter((mod) => selecting && selection.ids.has(mod.remoteId))
      .map((mod) => mod.remoteId),
  );
  const selectionAnchor = useRef<string | null>(null);
  const getOrderedMods = usePersistedStore((state) => state.getOrderedMods);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const modsStorePaginationEnabled = usePersistedStore(
    (state) => state.settings[MODS_STORE_PAGINATION_SETTING_ID]?.enabled,
  );
  const paginationEnabled =
    modsStorePaginationEnabled ?? platform() === "linux";
  const {
    unmatchedVpkCount,
    unmatchedVpks,
    isRefetching: isVpkScanRefetching,
    refetch: refetchVpkScan,
    activeProfileFolder,
  } = useVpkScan();
  const healthReport = useModHealthReport(activeProfileFolder);
  const checkModHealth = useCheckModHealth();
  const isCheckingModHealth = useIsCheckingModHealth();
  const healthById = useMemo(
    () => healthByModId(healthReport.data),
    [healthReport.data],
  );
  const {
    updatableMods,
    updatableCount,
    refetch: refetchUpdates,
    isFetching: isCheckingUpdates,
  } = useCheckUpdates({
    onSuccess: (data) => {
      const count = data.updates?.length ?? 0;
      if (count > 0) {
        toast.success(t("myMods.updateAvailableCount", { count }));
      } else {
        toast.success(t("myMods.allModsUpToDate"));
      }
    },
    onError: () => {
      toast.error(t("myMods.checkForUpdatesError"));
    },
  });
  const {
    progress: analysisProgress,
    showProgressToast,
    analysisResult,
    dialogOpen: analysisDialogOpen,
    setDialogOpen: setAnalysisDialogOpen,
    isPending: isAnalysisPending,
    startAnalysis,
    dismissProgressToast,
  } = useAddonAnalysis();
  const { disableAll, isPending: isDisablingAll } = useDisableAllMods();
  const bisectActive = usePersistedStore((state) => !!state.bisectSession);
  const {
    enableAll,
    isPending: isEnablingAll,
    recap: enableAllRecap,
    closeRecap: closeEnableAllRecap,
  } = useEnableAllMods();

  const { deleteMods, isPending: isDeletingMods } = useDeleteMods();

  const selectionBusy =
    isDisablingAll ||
    isEnablingAll ||
    isDeletingMods ||
    isSwitching ||
    bisectActive;

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const [activeTab, setActiveTab] = useState<LibraryTab>(ModFilter.All);
  const isConflictsTab = activeTab === CONFLICTS_TAB;
  const { groups: conflictGroups, statusByMod: conflictStatusByMod } =
    useProfileConflicts();
  const conflictCount = conflictGroups.length;
  const hiddenModelCount = conflictGroups.filter(
    (group) => group.severity === "critical",
  ).length;
  const showConflicts = useCallback(() => setActiveTab(CONFLICTS_TAB), []);
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false);
  const [batchUpdateIds, setBatchUpdateIds] =
    useState<ReadonlySet<string> | null>(null);
  const [showModOrdering, setShowModOrdering] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [showNukeDialog, setShowNukeDialog] = useState(false);
  const markFeatureUsed = usePersistedStore((state) => state.markFeatureUsed);
  const countFeatureHintEvent = usePersistedStore(
    (state) => state.countFeatureHintEvent,
  );
  const modsFolderOpens = usePersistedStore(
    (state) => state.featureHints.counters.modsFolderOpens ?? 0,
  );
  const openModOrdering = () => {
    setShowModOrdering(true);
    markFeatureUsed("load-order");
  };
  const [page, setPage] = useState(0);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedHeroes, setSelectedHeroes] = useState<string[]>([]);
  const [audioQuickFilter, setAudioQuickFilter] =
    useState<AudioQuickFilter>("off");
  const [mapQuickFilter, setMapQuickFilter] = useState<MapQuickFilter>("off");
  const effectiveMapQuickFilter: MapQuickFilter = isCustomMapsEnabled
    ? mapQuickFilter
    : "off";
  const [hideNSFW, setHideNSFW] = useState(false);
  const [nsfwOnly, setNSFWOnly] = useState(false);
  const globallyHideNSFW = usePersistedStore(
    (state) => state.nsfwSettings.hideNSFW,
  );
  const [hideOutdated, setHideOutdated] = useState(false);
  const [filterMode, setFilterMode] = useState<FilterMode>("include");
  const [sortType, setSortType] = useState<LibrarySortType>(
    LibrarySortType.InstallOrder,
  );
  const [librarySearchQuery, setLibrarySearchQuery] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const toolbarAnchorRef = useRef<HTMLDivElement>(null);
  useStuckAttribute(
    scrollContainerRef,
    toolbarAnchorRef,
    toolbarRef,
    mods.length > 0,
  );
  const toolbarSurfaceStyle = useThemeBackdropSurfaceStyle();

  const { results, query, setQuery } = useSearch({
    data: mods,
    keys: ["name", "description", "author"],
    queryState: {
      query: librarySearchQuery,
      setQuery: setLibrarySearchQuery,
      sortType: SortType.DEFAULT,
      setSortType: () => {},
    },
  });

  // A pasted GameBanana id or link matches that mod exactly, without the
  // fuzzy search's debounce.
  const idReference = parseGameBananaReference(librarySearchQuery);

  const displayMods = useMemo(() => {
    const baseMods = idReference
      ? mods.filter((mod) => mod.remoteId === idReference)
      : query.trim()
        ? results
        : mods;
    const predefinedCategorySet =
      selectedCategories.length > 0
        ? new Set<string>(Object.values(ModCategory))
        : null;

    const filteredMods = baseMods.filter((mod) => {
      if (selectedCategories.length > 0 && predefinedCategorySet) {
        const category = mod.category ?? "";
        let matchesCategory = selectedCategories.includes(category);
        if (
          !matchesCategory &&
          selectedCategories.includes(ModCategory.OTHER_MISC)
        ) {
          matchesCategory = !predefinedCategorySet.has(category);
        }
        if (filterMode === "include" ? !matchesCategory : matchesCategory)
          return false;
      }

      if (selectedHeroes.length > 0) {
        const resolvedHero = resolveLocalModHero(mod).hero;
        const matchesHero = matchesHeroFilter(resolvedHero, selectedHeroes);
        if (filterMode === "include" ? !matchesHero : matchesHero) return false;
      }

      if ((globallyHideNSFW || hideNSFW) && mod.isNSFW) return false;
      if (nsfwOnly && !mod.isNSFW) return false;

      if (audioQuickFilter === "only" && !mod.isAudio) return false;
      if (audioQuickFilter === "exclude" && mod.isAudio) return false;

      if (effectiveMapQuickFilter === "only" && !mod.isMap) return false;
      if (effectiveMapQuickFilter === "exclude" && mod.isMap) return false;

      if (hideOutdated && (mod.isObsolete || isModOutdated(mod))) return false;

      return true;
    });

    const statusFilteredMods = filterLibraryModsByStatus(
      filteredMods,
      isConflictsTab ? ModFilter.All : activeTab,
    );

    // Search results keep relevance order unless the user picked a sort.
    if (query.trim() && sortType === LibrarySortType.InstallOrder) {
      return statusFilteredMods;
    }

    return sortLibraryMods(statusFilteredMods, sortType);
  }, [
    activeTab,
    filterMode,
    sortType,
    audioQuickFilter,
    effectiveMapQuickFilter,
    globallyHideNSFW,
    hideNSFW,
    hideOutdated,
    idReference,
    nsfwOnly,
    query,
    results,
    selectedCategories,
    selectedHeroes,
    mods,
  ]);

  const visibleModIds = useMemo(
    () => new Set(displayMods.map((mod) => mod.remoteId)),
    [displayMods],
  );

  const totalPages = paginationEnabled
    ? Math.ceil(displayMods.length / PAGE_SIZE)
    : 1;

  const groupedDisplayMods = useMemo(() => {
    if (modGroups.length === 0) return displayMods;
    const { sections, ungrouped } = groupLibraryMods(displayMods, modGroups);
    return [...sections.flatMap((section) => section.mods), ...ungrouped];
  }, [displayMods, modGroups]);

  const visibleMods = useMemo(
    () =>
      paginationEnabled
        ? groupedDisplayMods.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        : groupedDisplayMods,
    [groupedDisplayMods, page, paginationEnabled],
  );

  // Kept in a ref so toggleSelection stays stable for the memoized cards.
  const selectionScope = useRef({ visibleMods, selecting });
  useEffect(() => {
    selectionScope.current = { visibleMods, selecting };
  }, [visibleMods, selecting]);
  const toggleSelection = useCallback(
    (id: string, extend = false) => {
      const scope = selectionScope.current;
      const anchorIndex = scope.visibleMods.findIndex(
        (mod) => mod.remoteId === selectionAnchor.current,
      );
      const targetIndex = scope.visibleMods.findIndex(
        (mod) => mod.remoteId === id,
      );
      const range =
        extend && scope.selecting && anchorIndex !== -1 && targetIndex !== -1
          ? scope.visibleMods
              .slice(
                Math.min(anchorIndex, targetIndex),
                Math.max(anchorIndex, targetIndex) + 1,
              )
              .map((mod) => mod.remoteId)
          : null;
      if (!range) selectionAnchor.current = id;
      setSelection((current) => {
        const ids = new Set(
          current?.profileId === activeProfileId ? current.ids : [],
        );
        if (range) for (const rangeId of range) ids.add(rangeId);
        else if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { profileId: activeProfileId, ids };
      });
    },
    [activeProfileId],
  );

  // Reset to first page whenever the filtered set changes, and clamp if totalPages shrinks
  useEffect(() => {
    setPage(0);
  }, [
    activeTab,
    filterMode,
    sortType,
    audioQuickFilter,
    effectiveMapQuickFilter,
    hideNSFW,
    hideOutdated,
    nsfwOnly,
    query,
    selectedCategories,
    selectedHeroes,
    totalPages,
  ]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // getOrderedMods reads the same localMods as `mods`, so `mods` is what invalidates it.
  const installedMods = useMemo(() => getOrderedMods(), [getOrderedMods, mods]);

  const {
    enabledModsCount,
    downloadedModsCount,
    disabledModsCount,
    enabledVpkFileCount,
  } = useMemo(() => {
    let enabled = 0;
    let downloaded = 0;
    let vpkFiles = 0;
    for (const mod of mods) {
      if (isInstalledModWithVpks(mod)) {
        enabled++;
        vpkFiles += mod.installedVpks?.length ?? 0;
      }
      if (mod.status === ModStatus.Downloaded) downloaded++;
    }
    return {
      enabledModsCount: enabled,
      downloadedModsCount: downloaded,
      disabledModsCount: mods.length - enabled,
      enabledVpkFileCount: vpkFiles,
    };
  }, [mods]);

  const copyModList = async (
    includeDisabled: boolean,
    listed: LocalMod[] = mods,
  ) => {
    try {
      await navigator.clipboard.writeText(
        formatModList(listed, includeDisabled, t("myMods.copyModListDisabled")),
      );
      toast.success(
        t("myMods.copyModListSuccess", {
          count: includeDisabled ? listed.length : enabledModsCount,
        }),
      );
    } catch {
      toast.error(t("myMods.copyModListFailed"));
    }
  };

  const selectedMods = mods.filter((mod) => selectedIds.has(mod.remoteId));
  const allMatchingSelected =
    displayMods.length > 0 &&
    displayMods.every((mod) => selectedIds.has(mod.remoteId));
  const modsListSelection = {
    active: selecting,
    ids: selectedIds,
    busy: selectionBusy,
    toggle: toggleSelection,
  };

  useEffect(() => {
    if (isConflictsTab || selectionBusy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.defaultPrevented ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select"))) ||
        document.querySelector(
          "[role='dialog'], [role='alertdialog'], [role='menu']",
        )
      )
        return;
      if (event.key === "Escape" && selecting) {
        setSelection(null);
      } else if (
        event.key.toLowerCase() === "a" &&
        (event.ctrlKey || event.metaKey) &&
        visibleModIds.size > 0
      ) {
        event.preventDefault();
        setSelection((current) => ({
          profileId: activeProfileId,
          ids: new Set([
            ...(current?.profileId === activeProfileId ? current.ids : []),
            ...visibleModIds,
          ]),
        }));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeProfileId,
    isConflictsTab,
    selecting,
    selectionBusy,
    visibleModIds,
  ]);

  return (
    <div className='relative flex min-h-0 w-full flex-1 flex-col px-4'>
      <div className='flex shrink-0 flex-col gap-3 pt-4 pb-2 xl:flex-row xl:items-start xl:gap-4'>
        <div className='flex min-w-0 flex-col xl:shrink-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-semibold tracking-tight text-balance'>
              {t("navigation.myMods")}
            </h1>
            <Tooltip>
              <HintAnchor
                align='start'
                eligible={modsFolderOpens >= MODS_FOLDER_HINT_MIN_OPENS}
                hintId='mods-folder-shortcut'>
                <TooltipTrigger asChild>
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={async () => {
                      countFeatureHintEvent("modsFolderOpens");
                      const activeProfile = getActiveProfile();
                      const profileFolder = activeProfile?.folderName ?? null;
                      await invoke("open_mods_folder", { profileFolder });
                    }}
                    icon={<FolderOpen className='h-4 w-4' />}
                  />
                </TooltipTrigger>
              </HintAnchor>
              <TooltipContent>{t("settings.openModsFolder")}</TooltipContent>
            </Tooltip>
            {mods.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    tabIndex={0}
                    className='border-border/80 bg-muted/40 inline-flex items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm tabular-nums shadow-sm'>
                    <span className='font-semibold text-foreground'>
                      {enabledVpkFileCount}
                    </span>
                    <span className='font-normal text-muted-foreground'>
                      {t("myMods.vpkFilesNoun")}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className='max-w-64'>
                  {t("myMods.vpkFilesTooltip")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className='text-muted-foreground'>{t("myMods.subtitle")}</p>
        </div>

        <div className='flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2 xl:justify-end'>
          {updatableCount > 0 && (
            <BatchUpdateButton
              variant='default'
              onClick={() => setShowBatchUpdateDialog(true)}>
              {t("myMods.updateAvailableCount", { count: updatableCount })}
            </BatchUpdateButton>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("myMods.checkForUpdates")}
                size='icon'
                variant='outline'
                disabled={isCheckingUpdates}
                onClick={() => refetchUpdates()}
                icon={
                  <RefreshCw
                    className={`h-4 w-4 ${isCheckingUpdates ? "animate-spin" : ""}`}
                  />
                }
              />
            </TooltipTrigger>
            <TooltipContent>{t("myMods.checkForUpdates")}</TooltipContent>
          </Tooltip>
          <AddModsMenu />
          <DropdownMenu
            onOpenChange={(open) => {
              setActionsMenuOpen(open);
              if (open) markFeatureUsed("my-mods-menu");
            }}
            open={actionsMenuOpen}>
            <HintAnchor
              align='end'
              eligible={
                isConflictDetectionEnabled &&
                conflictCount > 0 &&
                installedMods.length > 1
              }
              hintId='load-order'
              onShowMe={openModOrdering}>
              <HintAnchor
                align='end'
                eligible={mods.length >= MENU_HINT_MIN_MODS}
                hintId='my-mods-menu'
                onShowMe={() => setActionsMenuOpen(true)}>
                <HintAnchor
                  align='end'
                  eligible={installedMods.length > 0}
                  hintId='mod-repairs'
                  onShowMe={() => setActionsMenuOpen(true)}>
                  <HintAnchor
                    align='end'
                    eligible={
                      enabledModsCount >= FIND_BROKEN_MOD_HINT_MIN_MODS &&
                      !bisectActive
                    }
                    hintId='find-broken-mod'
                    onShowMe={() => setActionsMenuOpen(true)}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={t("myMods.moreActions")}
                        size='icon'
                        variant='outline'>
                        <EllipsisVertical className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                  </HintAnchor>
                </HintAnchor>
              </HintAnchor>
            </HintAnchor>
            <DropdownMenuContent align='end'>
              <DropdownMenuLabel>
                {t("myMods.menuSections.library")}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() =>
                  setSelection({ profileId: activeProfileId, ids: new Set() })
                }
                disabled={
                  selecting ||
                  selectionBusy ||
                  isConflictsTab ||
                  displayMods.length === 0
                }>
                <SquareCheck className='h-4 w-4' />
                {t("myMods.selection.start")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => enableAll()}
                disabled={downloadedModsCount === 0 || selectionBusy}>
                <Power className='h-4 w-4' />
                {t("myMods.enableAll")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => disableAll()}
                disabled={enabledModsCount === 0 || selectionBusy}>
                <PowerOff className='h-4 w-4' />
                {t("myMods.disableAll")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={openModOrdering}
                disabled={installedMods.length === 0}>
                <ArrowUpDown className='h-4 w-4' />
                {t("mods.manageOrder")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t("myMods.menuSections.troubleshoot")}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  markFeatureUsed("mod-repairs");
                  checkModHealth({
                    profileFolder: activeProfileFolder,
                    force: true,
                  });
                }}
                disabled={installedMods.length === 0 || isCheckingModHealth}>
                <Wrench className='h-4 w-4' />
                {isCheckingModHealth
                  ? t("modHealth.checkingForRepairs")
                  : t("modHealth.checkForRepairs")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  markFeatureUsed("find-broken-mod");
                  openFindBrokenMod();
                }}
                disabled={enabledModsCount === 0 || bisectActive}>
                <Bug className='h-4 w-4' />
                {t("bisect.entry")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={startAnalysis}
                disabled={isAnalysisPending}>
                <ScanSearch className='h-4 w-4' />
                {isAnalysisPending
                  ? t("addons.analyzing")
                  : t("addons.analyzeLocal")}
              </DropdownMenuItem>
              <DropdownMenuItem
                className='text-destructive focus:text-destructive'
                onClick={() => setShowNukeDialog(true)}
                disabled={mods.length === 0}>
                <Radioactive className='h-4 w-4' />
                {t("nuke.action")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>
                {t("myMods.menuSections.share")}
              </DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => setShowExportDialog(true)}
                disabled={mods.length === 0}>
                <FileOutput className='h-4 w-4' />
                {t("interchange.exportMenu")}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger disabled={mods.length === 0}>
                  <Copy className='h-4 w-4' />
                  {t("myMods.copyModList")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onSelect={() => copyModList(false)}
                    disabled={enabledModsCount === 0}>
                    {t("myMods.copyModListEnabled")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => copyModList(true)}>
                    {t("myMods.copyModListAll")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
          selecting ? "pb-24" : "pb-4",
        )}
        ref={scrollContainerRef}>
        {LibraryBanner ? <LibraryBanner /> : null}
        <ErrorBoundary>
          <Tabs
            className='flex w-full flex-col gap-4'
            value={activeTab}
            onValueChange={(value) => {
              switch (value) {
                case ModFilter.All:
                case ModFilter.Enabled:
                case ModFilter.Disabled:
                case CONFLICTS_TAB:
                  setActiveTab(value);
                  if (value === CONFLICTS_TAB) setSelection(null);
                  break;
              }
            }}>
            {mods.length === 0 && (
              <>
                <VpkScanAlert
                  unmatchedVpkCount={unmatchedVpkCount}
                  unmatchedVpks={unmatchedVpks}
                  isRefetching={isVpkScanRefetching}
                  refetch={refetchVpkScan}
                  activeProfileFolder={activeProfileFolder}
                />
                <MyModsEmptyState />
              </>
            )}
            {mods.length > 0 && (
              <div className='flex w-full flex-col gap-4'>
                <ModHealthBanner profileFolder={activeProfileFolder} />
                <div ref={toolbarAnchorRef} aria-hidden className='-mb-4' />
                <div
                  ref={toolbarRef}
                  style={toolbarSurfaceStyle}
                  className='sticky top-0 z-30 -my-3 flex w-full flex-col gap-3 border-b border-transparent px-px py-3 transition-colors duration-200 data-[stuck]:border-border/60 data-[stuck]:bg-background'>
                  <div className='min-w-0 overflow-visible [&_input]:border-border/70 [&_input]:bg-background/70 [&_input]:shadow-sm [&_input]:placeholder:text-muted-foreground/90 [&_input]:hover:border-border [&_input]:focus-visible:bg-background'>
                    <SearchBar
                      className='w-full'
                      filterMode={filterMode}
                      audioQuickFilter={audioQuickFilter}
                      mapQuickFilter={effectiveMapQuickFilter}
                      hideNSFW={hideNSFW}
                      hideOutdated={hideOutdated}
                      mods={mods}
                      nsfwOnly={globallyHideNSFW ? undefined : nsfwOnly}
                      onCategoriesChange={setSelectedCategories}
                      onFilterModeChange={setFilterMode}
                      onHeroesChange={setSelectedHeroes}
                      onAudioQuickFilterChange={setAudioQuickFilter}
                      onMapQuickFilterChange={setMapQuickFilter}
                      onHideNSFWChange={setHideNSFW}
                      onNSFWOnlyChange={setNSFWOnly}
                      onHideOutdatedChange={setHideOutdated}
                      query={query}
                      selectedCategories={selectedCategories}
                      selectedHeroes={selectedHeroes}
                      setQuery={setQuery}
                      showSortControl={false}
                      hideMapFilter={!isCustomMapsEnabled}
                      inputGroupClassName='min-w-0 w-full'
                      searchContainerClassName='w-full min-w-48 max-w-md flex-1'
                      searchInputClassName='w-full'
                    />
                  </div>
                  <div className='flex min-w-0 flex-wrap items-center gap-2'>
                    <TabsList className='h-auto min-h-9 max-w-full flex-wrap justify-start'>
                      <TabsTrigger value={ModFilter.All}>
                        {t("myMods.tabs.all")}
                        <span className='ml-2 text-muted-foreground text-xs'>
                          ({mods.length})
                        </span>
                      </TabsTrigger>
                      <TabsTrigger value={ModFilter.Enabled}>
                        {t("myMods.tabs.installed")}
                        <span className='ml-2 text-muted-foreground text-xs'>
                          ({enabledModsCount})
                        </span>
                      </TabsTrigger>
                      <TabsTrigger value={ModFilter.Disabled}>
                        {t("myMods.tabs.downloaded")}
                        <span className='ml-2 text-muted-foreground text-xs'>
                          ({disabledModsCount})
                        </span>
                      </TabsTrigger>
                      {isConflictDetectionEnabled && (
                        <TabsTrigger value={CONFLICTS_TAB}>
                          {hiddenModelCount > 0 ? (
                            <TriangleAlert className='mr-2 h-4 w-4 text-amber-400' />
                          ) : (
                            <Layers className='mr-2 h-4 w-4' />
                          )}
                          {t("myMods.tabs.conflicts")}
                          <span className='ml-2 text-muted-foreground text-xs'>
                            ({conflictCount})
                          </span>
                        </TabsTrigger>
                      )}
                    </TabsList>
                    <div className='ml-auto flex h-9 items-center gap-0.5 rounded-lg border border-border/50 bg-secondary/40 p-0.5'>
                      <SortSelect
                        onChange={setSortType}
                        options={Object.values(LibrarySortType)}
                        triggerClassName='h-8 border-0 bg-transparent px-2.5 text-muted-foreground shadow-none hover:text-foreground data-[state=open]:text-foreground'
                        value={sortType}
                      />
                      <span aria-hidden className='h-4 w-px bg-border' />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t("mods.gridView")}
                            aria-pressed={viewMode === ViewMode.GRID}
                            className='size-8'
                            onClick={() => setViewMode(ViewMode.GRID)}
                            size='icon'
                            variant={
                              viewMode === ViewMode.GRID ? "secondary" : "ghost"
                            }
                            icon={<LayoutGrid className='h-4 w-4' />}
                          />
                        </TooltipTrigger>
                        <TooltipContent>{t("mods.gridView")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t("mods.listView")}
                            aria-pressed={viewMode === ViewMode.LIST}
                            className='size-8'
                            onClick={() => setViewMode(ViewMode.LIST)}
                            size='icon'
                            variant={
                              viewMode === ViewMode.LIST ? "secondary" : "ghost"
                            }
                            icon={<LayoutList className='h-4 w-4' />}
                          />
                        </TooltipTrigger>
                        <TooltipContent>{t("mods.listView")}</TooltipContent>
                      </Tooltip>
                      {!isConflictsTab && (
                        <>
                          <span aria-hidden className='h-4 w-px bg-border' />
                          <ModGroupTools
                            key={`group-tools:${activeProfileId}`}
                            profileId={activeProfileId}
                            disabled={selectionBusy}
                            onCreated={() => handlePageChange(0)}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className='w-full'>
                  <VpkScanAlert
                    unmatchedVpkCount={unmatchedVpkCount}
                    unmatchedVpks={unmatchedVpks}
                    isRefetching={isVpkScanRefetching}
                    refetch={refetchVpkScan}
                    activeProfileFolder={activeProfileFolder}
                  />
                </div>

                {!isConflictsTab && totalPages > 1 && (
                  <ModsPagination
                    className='mb-4'
                    onPageChange={handlePageChange}
                    page={page}
                    totalPages={totalPages}
                  />
                )}

                {!isConflictsTab && displayMods.length === 0 && (
                  <Empty className='py-12'>
                    <EmptyHeader>
                      <EmptyMedia variant='default'>
                        <MagnifyingGlass className='h-16 w-16' />
                      </EmptyMedia>
                      <EmptyTitle>{t("mods.noModsFound")}</EmptyTitle>
                      <EmptyDescription>
                        {t("mods.noModsMatchFilters")}
                      </EmptyDescription>
                      <EmptyDescription className='text-xs'>
                        {t("mods.emptyClearFilters")}
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}

                {displayMods.length > 0 && (
                  <TabsContent className='mt-0' value={ModFilter.All}>
                    <ModsList
                      onSelectMod={toggleSelection}
                      selection={modsListSelection}
                      groupActions={{
                        busy: selectionBusy,
                        enable: enableAll,
                        disable: disableAll,
                      }}
                      mods={visibleMods}
                      allMods={displayMods}
                      revealMatches={query.trim().length > 0}
                      showEmptyGroups={page === 0 && !query.trim()}
                      conflictStatusByMod={conflictStatusByMod}
                      onShowConflicts={showConflicts}
                      viewMode={viewMode}
                      healthById={healthById}
                      contextMenuHint={
                        mods.length >= CONTEXT_MENU_HINT_MIN_MODS
                      }
                    />
                  </TabsContent>
                )}

                {displayMods.length > 0 && (
                  <TabsContent className='mt-0' value={ModFilter.Enabled}>
                    <ModsList
                      onSelectMod={toggleSelection}
                      selection={modsListSelection}
                      groupActions={{
                        busy: selectionBusy,
                        enable: enableAll,
                        disable: disableAll,
                      }}
                      mods={visibleMods}
                      allMods={displayMods}
                      revealMatches={query.trim().length > 0}
                      showEmptyGroups={page === 0 && !query.trim()}
                      conflictStatusByMod={conflictStatusByMod}
                      onShowConflicts={showConflicts}
                      viewMode={viewMode}
                      healthById={healthById}
                      contextMenuHint={
                        mods.length >= CONTEXT_MENU_HINT_MIN_MODS
                      }
                    />
                  </TabsContent>
                )}

                {displayMods.length > 0 && (
                  <TabsContent className='mt-0' value={ModFilter.Disabled}>
                    <ModsList
                      onSelectMod={toggleSelection}
                      selection={modsListSelection}
                      groupActions={{
                        busy: selectionBusy,
                        enable: enableAll,
                        disable: disableAll,
                      }}
                      mods={visibleMods}
                      allMods={displayMods}
                      revealMatches={query.trim().length > 0}
                      showEmptyGroups={page === 0 && !query.trim()}
                      conflictStatusByMod={conflictStatusByMod}
                      onShowConflicts={showConflicts}
                      viewMode={viewMode}
                      healthById={healthById}
                      contextMenuHint={
                        mods.length >= CONTEXT_MENU_HINT_MIN_MODS
                      }
                    />
                  </TabsContent>
                )}

                {isConflictDetectionEnabled && (
                  <TabsContent className='mt-0' value={CONFLICTS_TAB}>
                    <ConflictsPanel visibleModIds={visibleModIds} />
                  </TabsContent>
                )}

                {!isConflictsTab &&
                  displayMods.length > 0 &&
                  totalPages > 1 && (
                    <ModsPagination
                      className='mt-6 pb-4'
                      onPageChange={handlePageChange}
                      page={page}
                      totalPages={totalPages}
                    />
                  )}
              </div>
            )}
          </Tabs>
          <BatchUpdateDialog
            open={showBatchUpdateDialog}
            onOpenChange={(open) => {
              setShowBatchUpdateDialog(open);
              if (!open) setBatchUpdateIds(null);
            }}
            updates={
              batchUpdateIds
                ? updatableMods.filter((update) =>
                    batchUpdateIds.has(update.mod.remoteId),
                  )
                : updatableMods
            }
          />
          <ModOrderingDialog
            open={showModOrdering}
            onOpenChange={setShowModOrdering}
          />
          <ExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
          />
          <NukeReinstallDialog
            open={showNukeDialog}
            onOpenChange={setShowNukeDialog}
          />
          {analysisProgress && (
            <AnalysisProgressToast
              progress={analysisProgress}
              isVisible={showProgressToast}
              onDismiss={dismissProgressToast}
            />
          )}
          <AnalysisResultsDialog
            open={analysisDialogOpen}
            onOpenChange={setAnalysisDialogOpen}
            result={analysisResult}
          />
          <EnableAllRecapDialog
            recap={enableAllRecap}
            onClose={closeEnableAllRecap}
          />
        </ErrorBoundary>
      </div>

      {selecting && (
        <div className='pointer-events-none absolute inset-x-4 bottom-4 z-30 flex justify-center'>
          <LibrarySelectionBar
            count={selectedIds.size}
            selectedIds={[...selectedIds]}
            matchingCount={displayMods.length}
            allMatchingSelected={allMatchingSelected}
            enableCount={
              selectedMods.filter((mod) => mod.status === ModStatus.Downloaded)
                .length
            }
            disableCount={selectedMods.filter(isInstalledModWithVpks).length}
            updateCount={
              updatableMods.filter((update) =>
                selectedIds.has(update.mod.remoteId),
              ).length
            }
            busy={selectionBusy}
            working={isDisablingAll || isEnablingAll || isDeletingMods}
            onToggleAll={() =>
              setSelection({
                profileId: activeProfileId,
                ids: allMatchingSelected
                  ? new Set(
                      [...selectedIds].filter((id) => !visibleModIds.has(id)),
                    )
                  : new Set([...selectedIds, ...visibleModIds]),
              })
            }
            onExit={() => setSelection(null)}
            onEnable={() => enableAll(selectedIds)}
            onDisable={() => disableAll(selectedIds)}
            onUpdate={() => {
              setBatchUpdateIds(selectedIds);
              setShowBatchUpdateDialog(true);
            }}
            onCopy={() => copyModList(true, selectedMods)}
            onDelete={() => deleteMods(selectedIds)}
          />
        </div>
      )}
    </div>
  );
};

export default MyMods;
