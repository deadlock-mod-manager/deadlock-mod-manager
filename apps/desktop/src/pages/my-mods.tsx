import { Badge } from "@deadlock-mods/ui/components/badge";
import { Button } from "@deadlock-mods/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@deadlock-mods/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@deadlock-mods/ui/components/pagination";
import { SearchInput } from "@deadlock-mods/ui/components/search-input";
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
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  EllipsisVertical,
  FolderOpen,
  LayoutGrid,
  LayoutList,
  Loader2,
  RefreshCw,
  ScanSearch,
} from "@deadlock-mods/ui/icons";
import { Trash, UploadSimple } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import ModButton from "@/components/mod-browsing/mod-button";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { ModContextMenu } from "@/components/mod-management/mod-context-menu";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { VpkScanAlert } from "@/components/mods/vpk-scan-alert";
import { AnalysisProgressToast } from "@/components/my-mods/analysis-progress-toast";
import { AnalysisResultsDialog } from "@/components/my-mods/analysis-results-dialog";
import { BatchUpdateDialog } from "@/components/my-mods/batch-update-dialog";
import { MyModsEmptyState } from "@/components/my-mods/empty-state";
import { ModOrderingDialog } from "@/components/my-mods/mod-ordering-dialog";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useAddonAnalysis } from "@/hooks/use-addon-analysis";
import { useCheckUpdates } from "@/hooks/use-check-updates";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useSearch } from "@/hooks/use-search";
import useUninstall from "@/hooks/use-uninstall";
import { useVpkScan } from "@/hooks/use-vpk-scan";
import { usePersistedStore } from "@/lib/store";
import { cn, isModOutdated } from "@/lib/utils";
import { type LocalMod, ModStatus } from "@/types/mods";

const PAGE_SIZE = 20;

function ModsPagination({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Pagination className={className}>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            aria-label={t("pagination.previous")}
            aria-disabled={page === 0}
            className={cn("gap-1 pl-2.5", page === 0 ? "pointer-events-none opacity-50" : "")}
            size="default"
            onClick={(e) => {
              e.preventDefault();
              if (page > 0) onPageChange(page - 1);
            }}>
            <ChevronLeft className="h-4 w-4" />
            <span>{t("pagination.previous")}</span>
          </PaginationLink>
        </PaginationItem>
      {Array.from({ length: totalPages }, (_, i) => i)
        .filter((i) => {
          if (totalPages <= 7) return true;
          if (i === 0 || i === totalPages - 1) return true;
          return Math.abs(i - page) <= 2;
        })
        .reduce<(number | "ellipsis")[]>((acc, i, idx, arr) => {
          if (idx > 0 && arr[idx - 1] < i - 1) acc.push("ellipsis");
          acc.push(i);
          return acc;
        }, [])
        .map((item, idx) =>
          item === "ellipsis" ? (
            <PaginationItem key={`ellipsis-${idx}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                isActive={item === page}
                onClick={(e) => {
                  e.preventDefault();
                  onPageChange(item);
                }}>
                {item + 1}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationLink
            aria-label={t("pagination.next")}
            aria-disabled={page === totalPages - 1}
            className={cn("gap-1 pr-2.5", page === totalPages - 1 ? "pointer-events-none opacity-50" : "")}
            size="default"
            onClick={(e) => {
              e.preventDefault();
              if (page < totalPages - 1) onPageChange(page + 1);
            }}>
            <span>{t("pagination.next")}</span>
            <ChevronRight className="h-4 w-4" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

enum ViewMode {
  GRID = "grid",
  LIST = "list",
}

enum ModFilter {
  ALL = "all",
  ENABLED = "enabled",
  DISABLED = "disabled",
}

const GridModCard = ({ mod }: { mod: LocalMod }) => {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${error}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModContextMenu mod={mod}>
      <Card className='shadow'>
        <div className={cn("relative", isDisabled && "grayscale")}>
          <div
            className='cursor-pointer'
            onClick={() =>
              mod.id?.includes("local")
                ? toast.info(
                    "Local mod cannot be previewed (this is temporary)",
                  )
                : navigate(`/mods/${mod.remoteId}`)
            }>
            {mod.isAudio ? (
              <AudioPlayerPreview
                audioUrl={mod.audioUrl || ""}
                onPlayClick={(e) => e.stopPropagation()}
                variant='default'
              />
            ) : mod.images && mod.images.length > 0 ? (
              <NSFWBlur
                blurStrength={nsfwSettings.blurStrength}
                className='h-48 w-full overflow-hidden rounded-t-xl'
                disableBlur={nsfwSettings.disableBlur}
                isNSFW={shouldBlur}
                onToggleVisibility={handleNSFWToggle}>
                <img
                  alt={mod.name}
                  className='h-48 w-full object-cover'
                  height='192'
                  src={mod.images[0]}
                  width='320'
                />
              </NSFWBlur>
            ) : (
              <div className='flex h-48 w-full items-center justify-center rounded-t-xl bg-secondary'>
                <div className='text-center text-foreground/60'>
                  <div className='mx-auto mb-2 h-12 w-12' />
                  <p className='text-sm'>No preview available</p>
                </div>
              </div>
            )}
          </div>
          <div className='absolute top-2 right-2 flex flex-col gap-1'>
            {mod.isAudio && <Badge variant='secondary'>Audio</Badge>}
            {mod.remoteUrl?.startsWith("local://") && (
              <Badge
                variant='outline'
                className='bg-background/80 backdrop-blur-sm'>
                Custom
              </Badge>
            )}
            {isModOutdated(mod) && <OutdatedModWarning variant='indicator' />}
          </div>
          {mod.status === ModStatus.Installing && (
            <div className='absolute inset-0 flex items-center justify-center rounded-t-xl bg-black/50'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
            </div>
          )}
        </div>
        <CardHeader className='px-3 py-3 pb-0'>
          <div className='flex items-start'>
            <div className='flex flex-col'>
              <CardTitle
                className='w-48 cursor-pointer overflow-clip text-ellipsis text-nowrap'
                onClick={() => navigate(`/mods/${mod.remoteId}`)}
                title={mod.name}>
                {mod.name}
              </CardTitle>
              <CardDescription
                className='w-48 overflow-clip text-ellipsis text-nowrap'
                title={mod.author}>
                {t("mods.by")} {mod.author}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardFooter className='flex justify-between px-3 py-3 pt-2'>
          <ModButton remoteMod={mod} variant='iconOnly' />{" "}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                isLoading={deleting}
                onClick={deleteMod}
                size='icon'
                variant='destructive'>
                <Trash className='h-4 w-4' />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("mods.removeMod")}</TooltipContent>
          </Tooltip>
        </CardFooter>
      </Card>
    </ModContextMenu>
  );
};

const ListModCard = ({ mod }: { mod: LocalMod }) => {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const isInstalling = mod.status === ModStatus.Installing;
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${error}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ModContextMenu mod={mod}>
      <Card className='shadow'>
        <div className='flex items-center pr-4'>
          <div
            className={cn(
              "relative h-24 w-24 min-w-24",
              isDisabled && "grayscale",
            )}
            onClick={() => navigate(`/mods/${mod.remoteId}`)}>
            {mod.isAudio ? (
              <AudioPlayerPreview
                audioUrl={mod.audioUrl || ""}
                onPlayClick={(e) => e.stopPropagation()}
                variant='compact'
              />
            ) : mod.images && mod.images.length > 0 ? (
              <NSFWBlur
                blurStrength={nsfwSettings.blurStrength}
                className='h-full w-full cursor-pointer overflow-hidden rounded-l-xl'
                disableBlur={nsfwSettings.disableBlur}
                isNSFW={shouldBlur}
                onToggleVisibility={handleNSFWToggle}>
                <img
                  alt={mod.name}
                  className='h-full w-full object-cover'
                  height='160'
                  src={mod.images[0]}
                  width='160'
                />
              </NSFWBlur>
            ) : (
              <div className='flex h-full w-full cursor-pointer items-center justify-center rounded-l-xl bg-secondary'>
                <div className='text-center text-foreground/60'>
                  <div className='mx-auto h-6 w-6' />
                </div>
              </div>
            )}
            <div className='absolute top-1 right-1 flex flex-col gap-1'>
              {mod.isAudio && (
                <Badge className='text-xs' variant='secondary'>
                  Audio
                </Badge>
              )}
              {mod.remoteUrl?.startsWith("local://") && (
                <Badge
                  variant='outline'
                  className='text-xs bg-background/80 backdrop-blur-sm'>
                  Custom
                </Badge>
              )}
              {isModOutdated(mod) && (
                <OutdatedModWarning className='text-xs' variant='indicator' />
              )}
            </div>
            {mod.status === ModStatus.Installing && (
              <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            )}
          </div>
          <div className='flex w-full flex-col justify-between p-3'>
            <div>
              <h3
                className='cursor-pointer font-semibold text-lg'
                onClick={() => navigate(`/mods/${mod.remoteId}`)}>
                {mod.name}
              </h3>
              <p className='text-muted-foreground text-sm'>
                {t("mods.by")} {mod.author}{" "}
                {mod.isAudio && `• ${t("mods.audioMod")}`}
              </p>
            </div>
          </div>

          <div className='flex flex-col items-center gap-2'>
            <ModButton remoteMod={mod} variant='iconOnly' />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  disabled={isInstalling || deleting}
                  isLoading={deleting}
                  onClick={deleteMod}
                  size='icon'
                  variant='destructive'>
                  <Trash className='h-4 w-4' />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("mods.removeMod")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </Card>
    </ModContextMenu>
  );
};

const SimpleSearchBar = ({
  query,
  setQuery,
}: {
  query: string;
  setQuery: (query: string) => void;
}) => {
  const { t } = useTranslation();

  return (
    <SearchInput
      className='w-full max-w-sm'
      onChange={(e) => setQuery(e.target.value)}
      placeholder={t("mods.searchPlaceholder")}
      value={query}
    />
  );
};

const ModsList = ({
  mods,
  viewMode,
}: {
  mods: LocalMod[];
  viewMode: ViewMode;
}) => {
  if (viewMode === ViewMode.GRID) {
    return (
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
        {mods.map((mod) => (
          <div
            key={mod.remoteId ?? mod.id}
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 220px",
            }}>
            <GridModCard mod={mod} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      {mods.map((mod) => (
        <div
          key={mod.remoteId ?? mod.id}
          style={{
            contentVisibility: "auto",
            containIntrinsicSize: "auto 80px",
          }}>
          <ListModCard mod={mod} />
        </div>
      ))}
    </div>
  );
};

const MyMods = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mods = usePersistedStore((state) => state.localMods);
  const getOrderedMods = usePersistedStore((state) => state.getOrderedMods);
  const getActiveProfile = usePersistedStore((state) => state.getActiveProfile);
  const {
    unmatchedVpkCount,
    unmatchedVpks,
    isRefetching: isVpkScanRefetching,
    refetch: refetchVpkScan,
  } = useVpkScan();
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
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const [activeTab, setActiveTab] = useState<ModFilter>(ModFilter.ALL);
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false);
  const [showModOrdering, setShowModOrdering] = useState(false);
  const [page, setPage] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);

  const { results, query, setQuery } = useSearch({
    data: mods,
    keys: ["name", "description", "author"],
  });

  const filterModsByStatus = (modsToFilter: LocalMod[]) => {
    switch (activeTab) {
      case ModFilter.ENABLED:
        return modsToFilter.filter(
          (mod) =>
            mod.status === ModStatus.Installed &&
            mod.installedVpks &&
            mod.installedVpks.length > 0,
        );
      case ModFilter.DISABLED:
        return modsToFilter.filter(
          (mod) =>
            mod.status !== ModStatus.Installed ||
            !mod.installedVpks ||
            mod.installedVpks.length === 0,
        );
      default:
        return modsToFilter;
    }
  };

  const sortedMods = [...mods].sort((a, b) => {
    const aIsInstalled =
      a.status === ModStatus.Installed &&
      a.installedVpks &&
      a.installedVpks.length > 0;
    const bIsInstalled =
      b.status === ModStatus.Installed &&
      b.installedVpks &&
      b.installedVpks.length > 0;

    if (aIsInstalled && !bIsInstalled) return -1;
    if (!aIsInstalled && bIsInstalled) return 1;

    if (aIsInstalled && bIsInstalled) {
      const aOrder = a.installOrder ?? 999;
      const bOrder = b.installOrder ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }

    const dateA = a.downloadedAt ? new Date(a.downloadedAt).getTime() : 0;
    const dateB = b.downloadedAt ? new Date(b.downloadedAt).getTime() : 0;
    return dateB - dateA;
  });

  const displayMods = filterModsByStatus(query.trim() ? results : sortedMods);

  const totalPages = Math.ceil(displayMods.length / PAGE_SIZE);

  const paginatedMods = useMemo(
    () => displayMods.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [displayMods, page],
  );

  // Reset to first page whenever the filtered set changes, and clamp if totalPages shrinks
  useEffect(() => {
    setPage((p) => Math.max(0, Math.min(p, Math.max(0, totalPages - 1))));
    scrollPositionRef.current = 0;
  }, [activeTab, query, totalPages]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    scrollPositionRef.current = 0;
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const installedMods = getOrderedMods();

  const enabledModsCount = mods.filter(
    (mod) =>
      mod.status === ModStatus.Installed &&
      mod.installedVpks &&
      mod.installedVpks.length > 0,
  ).length;
  const disabledModsCount = mods.filter(
    (mod) =>
      mod.status !== ModStatus.Installed ||
      !mod.installedVpks ||
      mod.installedVpks.length === 0,
  ).length;

  useLayoutEffect(() => {
    if (scrollContainerRef.current && scrollPositionRef.current > 0) {
      scrollContainerRef.current.scrollTop = scrollPositionRef.current;
    }
  });

  return (
    <div
      ref={scrollContainerRef}
      className='w-full gap-4 overflow-y-auto px-4 will-change-transform'
      onScroll={(e) => {
        scrollPositionRef.current = e.currentTarget.scrollTop;
      }}>
      <ErrorBoundary>
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as ModFilter)}>
          <div className='mb-8 flex flex-row '>
            <div className='flex flex-col flex-grow'>
              <div className='flex items-baseline gap-3'>
                <h1 className='text-2xl font-bold tracking-tight'>
                  {t("navigation.myMods")}
                </h1>
                {mods.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          "text-sm font-medium cursor-help",
                          enabledModsCount >= 99
                            ? "text-destructive"
                            : enabledModsCount >= 85
                              ? "text-orange-600"
                              : "text-muted-foreground",
                        )}>
                        ({enabledModsCount}/99)
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("myMods.modLimitTooltip")}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={async () => {
                        const activeProfile = getActiveProfile();
                        const profileFolder = activeProfile?.folderName ?? null;
                        await invoke("open_mods_folder", { profileFolder });
                      }}
                      icon={<FolderOpen className='h-4 w-4' />}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("settings.openModsFolder")}
                  </TooltipContent>
                </Tooltip>
              </div>
              <p className='text-muted-foreground'>{t("myMods.subtitle")}</p>
            </div>

            <div className='flex gap-2 items-center'>
              {updatableCount > 0 && (
                <Button
                  variant='default'
                  onClick={() => setShowBatchUpdateDialog(true)}
                  icon={<RefreshCw className='h-4 w-4' />}>
                  {t("myMods.updateAvailableCount", { count: updatableCount })}
                </Button>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='outline'
                    size='icon'
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
              <Button
                size='lg'
                variant='outline'
                onClick={() => navigate("/add-mods")}
                icon={<UploadSimple className='h-4 w-4' />}>
                {t("navigation.addMods")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size='icon' variant='outline'>
                    <EllipsisVertical className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end'>
                  <DropdownMenuItem
                    onClick={startAnalysis}
                    disabled={isAnalysisPending}>
                    <ScanSearch className='h-4 w-4' />
                    {isAnalysisPending
                      ? t("addons.analyzing")
                      : t("addons.analyzeLocal")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setShowModOrdering(true)}
                    disabled={installedMods.length === 0}>
                    <ArrowUpDown className='h-4 w-4' />
                    {t("mods.manageOrder")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          <VpkScanAlert
            unmatchedVpkCount={unmatchedVpkCount}
            unmatchedVpks={unmatchedVpks}
            isRefetching={isVpkScanRefetching}
            refetch={refetchVpkScan}
          />
          {mods.length === 0 && <MyModsEmptyState />}
          {mods.length > 0 && (
            <div className='flex flex-col gap-4'>
              <div className='flex items-center justify-between'>
                <SimpleSearchBar query={query} setQuery={setQuery} />
                <div className='flex items-center gap-2'>
                  <TabsList>
                    <TabsTrigger value={ModFilter.ALL}>
                      {t("myMods.tabs.all")}
                      <span className='ml-2 text-muted-foreground text-xs'>
                        ({mods.length})
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value={ModFilter.ENABLED}>
                      <Check className='mr-2 h-4 w-4' />
                      {t("myMods.tabs.installed")}
                      <span className='ml-2 text-muted-foreground text-xs'>
                        ({enabledModsCount})
                      </span>
                    </TabsTrigger>
                    <TabsTrigger value={ModFilter.DISABLED}>
                      <Download className='mr-2 h-4 w-4' />
                      {t("myMods.tabs.downloaded")}
                      <span className='ml-2 text-muted-foreground text-xs'>
                        ({disabledModsCount})
                      </span>
                    </TabsTrigger>
                  </TabsList>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setViewMode(ViewMode.GRID)}
                        size='icon'
                        variant={
                          viewMode === ViewMode.GRID ? "default" : "outline"
                        }
                        icon={<LayoutGrid className='h-4 w-4' />}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{t("mods.gridView")}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => setViewMode(ViewMode.LIST)}
                        size='icon'
                        variant={
                          viewMode === ViewMode.LIST ? "default" : "outline"
                        }
                        icon={<LayoutList className='h-4 w-4' />}
                      />
                    </TooltipTrigger>
                    <TooltipContent>{t("mods.listView")}</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {totalPages > 1 && (
                <ModsPagination
                  className='mb-4'
                  onPageChange={handlePageChange}
                  page={page}
                  totalPages={totalPages}
                />
              )}

              <TabsContent value={ModFilter.ALL}>
                <ModsList mods={paginatedMods} viewMode={viewMode} />
              </TabsContent>

              <TabsContent value={ModFilter.ENABLED}>
                <ModsList mods={paginatedMods} viewMode={viewMode} />
              </TabsContent>

              <TabsContent value={ModFilter.DISABLED}>
                <ModsList mods={paginatedMods} viewMode={viewMode} />
              </TabsContent>

              {totalPages > 1 && (
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
          onOpenChange={setShowBatchUpdateDialog}
          updates={updatableMods}
        />
        <ModOrderingDialog
          open={showModOrdering}
          onOpenChange={setShowModOrdering}
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
      </ErrorBoundary>
    </div>
  );
};

export default MyMods;
