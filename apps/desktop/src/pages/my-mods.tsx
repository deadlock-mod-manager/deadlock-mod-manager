import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { LibrarySelectionBar } from "@/components/my-mods/library-selection-bar";
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@deadlock-mods/ui/components/dropdown-menu";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@deadlock-mods/ui/components/pagination";
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
  ChevronLeft,
  ChevronRight,
  Copy,
  EllipsisVertical,
  FileOutput,
  FolderOpen,
  Layers,
  LayoutGrid,
  LayoutList,
  Loader2,
  Power,
  PowerOff,
  RefreshCw,
  ScanSearch,
  TriangleAlert,
  Wrench,
} from "@deadlock-mods/ui/icons";
import { Trash, UploadSimple } from "@phosphor-icons/react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { HintAnchor } from "@/components/feature-hints/hint-anchor";
import ModButton from "@/components/mod-browsing/mod-button";
import NSFWBlur from "@/components/mod-browsing/nsfw-blur";
import AudioPlayerPreview from "@/components/mod-management/audio-player-preview";
import { ModContextMenu } from "@/components/mod-management/mod-context-menu";
import { ModOptionsButton } from "@/components/mod-management/mod-options-button";
import { ModOptionsDialog } from "@/components/mod-management/mod-options-dialog";
import { MissingFilesWarning } from "@/components/mod-management/missing-files-warning";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import SearchBar from "@/components/mod-browsing/search-bar";
import { SortSelect } from "@/components/mod-browsing/sort-select";
import { VpkScanAlert } from "@/components/mods/vpk-scan-alert";
import { AnalysisProgressToast } from "@/components/my-mods/analysis-progress-toast";
import { AnalysisResultsDialog } from "@/components/my-mods/analysis-results-dialog";
import { BatchUpdateDialog } from "@/components/my-mods/batch-update-dialog";
import { EnableAllRecapDialog } from "@/components/my-mods/enable-all-recap-dialog";
import { UpdateButton } from "@/components/my-mods/update-button";
import { ExportDialog } from "@/components/mod-interchange/export-dialog";
import { ImportSourceMenu } from "@/components/mod-interchange/import-source-menu";
import { ConflictsPanel } from "@/components/my-mods/conflicts/conflicts-panel";
import { ModConflictBadge } from "@/components/my-mods/conflicts/mod-conflict-badge";
import { MyModsEmptyState } from "@/components/my-mods/empty-state";
import { LibraryModAuthor } from "@/components/my-mods/library-mod-author";
import { ModOrderingDialog } from "@/components/my-mods/mod-ordering-dialog";
import { ModHealthBadge } from "@/components/mod-health/mod-health-badge";
import { ModHealthBanner } from "@/components/mod-health/mod-health-banner";
import {
  useCheckModHealth,
  useIsCheckingModHealth,
  useModHealthReport,
} from "@/hooks/use-mod-health";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useAddonAnalysis } from "@/hooks/use-addon-analysis";
import { useDisableAllMods } from "@/hooks/use-disable-all-mods";
import { useEnableAllMods } from "@/hooks/use-enable-all-mods";
import { ModUpdateBadge } from "@/components/mod-management/mod-update-badges";
import { useModHasUpdate, useCheckUpdates } from "@/hooks/use-check-updates";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useProfileConflicts } from "@/hooks/use-profile-conflicts";
import { useSearch } from "@/hooks/use-search";
import { useModOptions } from "@/hooks/use-mod-options";
import useUninstall from "@/hooks/use-uninstall";
import { useVpkScan } from "@/hooks/use-vpk-scan";
import { openFindBrokenMod } from "@/lib/bisect/dialogs";
import { useThemeOverride } from "@/components/providers/theme-overrides";
import { SortType } from "@/lib/constants";
import { ModCategory } from "@/lib/constants";
import { getErrorMessage } from "@/lib/errors";
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
import type { ModConflictStatus } from "@/lib/mods/conflicts";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { getUpdatePercent } from "@/lib/mods/batch-update-progress";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { healthByModId, showsDateOutdatedWarning } from "@/lib/mods/mod-health";
import { cn, isModOutdated } from "@/lib/utils";
import type { ModHealth } from "@/types/generated/ModHealth";
import { type LocalMod, ModStatus } from "@/types/mods";

const PAGE_SIZE = 20;
const CONFLICTS_TAB = "conflicts";
const MENU_HINT_MIN_MODS = 8;
const CONTEXT_MENU_HINT_MIN_MODS = 5;
// Below this, turning mods off one by one is about as quick as bisecting.
const FIND_BROKEN_MOD_HINT_MIN_MODS = 6;
const MODS_FOLDER_HINT_MIN_OPENS = 3;
type LibraryTab = ModFilter | typeof CONFLICTS_TAB;
const MODS_STORE_PAGINATION_SETTING_ID = "mods-store-pagination";

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
            className={cn(
              "gap-1 pl-2.5",
              page === 0 ? "pointer-events-none opacity-50" : "",
            )}
            size='default'
            onClick={(e) => {
              e.preventDefault();
              if (page > 0) onPageChange(page - 1);
            }}>
            <ChevronLeft className='h-4 w-4' />
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
          .map((item, idx, items) =>
            item === "ellipsis" ? (
              <PaginationItem
                key={`ellipsis-${items[idx - 1]}-${items[idx + 1]}`}>
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
            className={cn(
              "gap-1 pr-2.5",
              page === totalPages - 1 ? "pointer-events-none opacity-50" : "",
            )}
            size='default'
            onClick={(e) => {
              e.preventDefault();
              if (page < totalPages - 1) onPageChange(page + 1);
            }}>
            <span>{t("pagination.next")}</span>
            <ChevronRight className='h-4 w-4' />
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

type ModCardProps = {
  mod: LocalMod;
  conflictStatus: ModConflictStatus | undefined;
  onShowConflicts: () => void;
  health: ModHealth | undefined;
  contextMenuHint: boolean;
};

const GridModCard = ({
  mod,
  conflictStatus,
  onShowConflicts,
  health,
  contextMenuHint,
}: ModCardProps) => {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const hasUpdate = useModHasUpdate(mod);
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);
  const CardWrapper = useThemeOverride("cardWrapper");
  const modOptions = useModOptions(mod);

  const openModDetail = () =>
    navigate(`/mods/${mod.remoteId}`, {
      state: { collection: "library" },
    });

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${getErrorMessage(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const optionsDialog = modOptions.showButton ? (
    <ModOptionsDialog
      isOpen={modOptions.isOpen}
      onOpenChange={(open) => (open ? modOptions.open() : modOptions.close())}
      isSaving={modOptions.isSaving}
      progress={modOptions.progress}
      onApply={modOptions.apply}
      fileTree={modOptions.fileTree}
      onApplyFiles={modOptions.applyFileSelection}
      isSavingFiles={modOptions.isSavingFiles}
      modName={mod.name}
      downloads={modOptions.downloads}
      onDiskArchiveNames={modOptions.onDiskArchiveNames}
      activeArchiveNames={modOptions.activeArchiveNames}
    />
  ) : null;

  const cardContent = (
    <ModContextMenu hint={contextMenuHint} mod={mod}>
      <Card className='flex h-full flex-col shadow'>
        <div className='relative'>
          <div
            className={cn("cursor-pointer", isDisabled && "grayscale")}
            onClick={openModDetail}>
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
                  decoding='async'
                  height='192'
                  loading='lazy'
                  src={getModCoverImage(mod)}
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
          <div className='absolute bottom-2 left-2'>
            <ModUpdateBadge mod={mod} hasUpdate={hasUpdate} />
          </div>
          <div className='absolute top-2 right-2 flex flex-col gap-1'>
            {mod.isAudio && (
              <Badge variant='secondary'>{t("mods.audio")}</Badge>
            )}
            {mod.remoteUrl?.startsWith("local://") && (
              <Badge variant='outline' className='bg-background/95'>
                {t("mods.customBadge")}
              </Badge>
            )}
            {showsDateOutdatedWarning(isModOutdated(mod), health) && (
              <OutdatedModWarning variant='indicator' />
            )}
            <ModHealthBadge health={health} isOutdated={isModOutdated(mod)} />
            <MissingFilesWarning missingVpks={mod.missingVpks} />
            {conflictStatus && (
              <ModConflictBadge
                onClick={onShowConflicts}
                status={conflictStatus}
              />
            )}
          </div>
          {mod.status === ModStatus.Installing && (
            <div className='absolute inset-0 flex items-center justify-center rounded-t-xl bg-black/50'>
              <Loader2 className='h-8 w-8 animate-spin text-primary' />
            </div>
          )}
        </div>
        <CardHeader className='space-y-1 px-3 py-3 pb-0'>
          <CardTitle
            className='line-clamp-2 cursor-pointer leading-tight'
            onClick={openModDetail}
            title={mod.name}>
            {mod.name}
          </CardTitle>
          <CardDescription className='truncate' title={mod.author}>
            <LibraryModAuthor mod={mod} />
          </CardDescription>
        </CardHeader>
        <CardFooter className='mt-auto justify-between gap-3 px-3 py-3 pt-2'>
          <div className='flex min-w-0 items-center gap-1'>
            {modOptions.showButton ? (
              <ModOptionsButton
                activeCount={modOptions.activeVariantCount}
                onOpen={modOptions.open}
                className='shrink-0'
              />
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("mods.removeMod")}
                  icon={<Trash className='h-4 w-4' />}
                  isLoading={deleting}
                  onClick={deleteMod}
                  size='icon'
                  variant='destructiveGhost'
                />
              </TooltipTrigger>
              <TooltipContent>{t("mods.removeMod")}</TooltipContent>
            </Tooltip>
          </div>
          <ModButton remoteMod={mod} variant='iconOnly' />
        </CardFooter>
      </Card>
    </ModContextMenu>
  );

  return (
    <>
      {CardWrapper ? <CardWrapper>{cardContent}</CardWrapper> : cardContent}
      {optionsDialog}
    </>
  );
};

const ListModCard = ({
  mod,
  conflictStatus,
  onShowConflicts,
  health,
  contextMenuHint,
}: ModCardProps) => {
  const { t } = useTranslation();
  const isDisabled = mod.status !== ModStatus.Installed;
  const hasUpdate = useModHasUpdate(mod);
  const isInstalling = mod.status === ModStatus.Installing;
  const navigate = useNavigate();
  const { uninstall } = useUninstall();
  const [deleting, setDeleting] = useState(false);
  const modOptions = useModOptions(mod);

  const openModDetail = () =>
    navigate(`/mods/${mod.remoteId}`, {
      state: { collection: "library" },
    });

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const deleteMod = async () => {
    if (!mod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(mod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${getErrorMessage(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <ModContextMenu hint={contextMenuHint} mod={mod}>
        <Card className='shadow'>
          <div className='flex items-center pr-4'>
            <div
              className={cn(
                "relative h-24 w-24 min-w-24",
                isDisabled && "grayscale",
              )}
              onClick={openModDetail}>
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
                    decoding='async'
                    height='160'
                    loading='lazy'
                    src={getModCoverImage(mod)}
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
                    {t("mods.audio")}
                  </Badge>
                )}
                {mod.remoteUrl?.startsWith("local://") && (
                  <Badge variant='outline' className='text-xs bg-background/95'>
                    {t("mods.customBadge")}
                  </Badge>
                )}
                {showsDateOutdatedWarning(isModOutdated(mod), health) && (
                  <OutdatedModWarning className='text-xs' variant='indicator' />
                )}
                <ModHealthBadge
                  className='text-xs'
                  health={health}
                  isOutdated={isModOutdated(mod)}
                />
                <MissingFilesWarning
                  className='text-xs'
                  missingVpks={mod.missingVpks}
                />
                {conflictStatus && (
                  <ModConflictBadge
                    className='text-xs'
                    onClick={onShowConflicts}
                    status={conflictStatus}
                  />
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
                <ModUpdateBadge
                  mod={mod}
                  hasUpdate={hasUpdate}
                  className='mb-1 text-xs'
                />
                <h3
                  className='cursor-pointer font-semibold text-lg'
                  onClick={openModDetail}>
                  {mod.name}
                </h3>
                <p className='text-muted-foreground text-sm'>
                  <LibraryModAuthor mod={mod} />{" "}
                  {mod.isAudio && `• ${t("mods.audioMod")}`}
                </p>
              </div>
            </div>

            <div className='flex shrink-0 items-center gap-2'>
              <div className='flex items-center gap-2'>
                <ModButton remoteMod={mod} variant='iconOnly' />
                {modOptions.showButton && (
                  <ModOptionsButton
                    activeCount={modOptions.activeVariantCount}
                    onOpen={modOptions.open}
                  />
                )}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label={t("mods.removeMod")}
                    disabled={isInstalling || deleting}
                    icon={<Trash className='h-4 w-4' />}
                    isLoading={deleting}
                    onClick={deleteMod}
                    size='icon'
                    variant='destructive'
                  />
                </TooltipTrigger>
                <TooltipContent>{t("mods.removeMod")}</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </Card>
      </ModContextMenu>
      {modOptions.showButton && (
        <ModOptionsDialog
          isOpen={modOptions.isOpen}
          onOpenChange={(open) =>
            open ? modOptions.open() : modOptions.close()
          }
          isSaving={modOptions.isSaving}
          progress={modOptions.progress}
          onApply={modOptions.apply}
          fileTree={modOptions.fileTree}
          onApplyFiles={modOptions.applyFileSelection}
          isSavingFiles={modOptions.isSavingFiles}
          modName={mod.name}
          downloads={modOptions.downloads}
          onDiskArchiveNames={modOptions.onDiskArchiveNames}
          activeArchiveNames={modOptions.activeArchiveNames}
        />
      )}
    </>
  );
};

const ModsList = ({
  mods,
  viewMode,
  conflictStatusByMod,
  onShowConflicts,
  healthById,
  contextMenuHint,
  selection,
}: {
  selection?: {
    ids: ReadonlySet<string>;
    busy: boolean;
    toggle: (id: string) => void;
  };
  healthById: ReadonlyMap<string, ModHealth>;
  mods: LocalMod[];
  viewMode: ViewMode;
  conflictStatusByMod: ReadonlyMap<string, ModConflictStatus>;
  onShowConflicts: () => void;
  /** Points the right-click hint at the first card. */
  contextMenuHint: boolean;
}) => {
  const { t } = useTranslation();
  const ModCard = viewMode === ViewMode.GRID ? GridModCard : ListModCard;
  return (
    <div
      className={
        viewMode === ViewMode.GRID
          ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3"
          : "flex flex-col gap-3"
      }>
      {mods.map((mod, index) => (
        <div
          inert={selection?.busy}
          key={mod.remoteId}
          className={cn(
            "relative",
            selection && viewMode === ViewMode.LIST && "pl-9",
            selection?.ids.has(mod.remoteId) &&
              "rounded-xl ring-2 ring-primary",
          )}>
          {selection && (
            <Checkbox
              aria-label={t("myMods.selection.selectMod", { name: mod.name })}
              checked={selection.ids.has(mod.remoteId)}
              disabled={selection.busy}
              onCheckedChange={() => selection.toggle(mod.remoteId)}
              className={cn(
                "absolute left-2 z-10 size-5 bg-background",
                viewMode === ViewMode.GRID
                  ? "top-2"
                  : "top-1/2 -translate-y-1/2",
              )}
            />
          )}
          <ModCard
            conflictStatus={conflictStatusByMod.get(mod.remoteId)}
            contextMenuHint={!selection && contextMenuHint && index === 0}
            mod={mod}
            onShowConflicts={onShowConflicts}
            health={healthById.get(mod.remoteId)}
          />
        </div>
      ))}
    </div>
  );
};

const MyMods = () => {
  const { t } = useTranslation();
  const isCustomMapsEnabled = useExperimentalFeature("custom-maps");
  const isConflictDetectionEnabled =
    useExperimentalFeature("conflict-detection");
  const navigate = useNavigate();
  const mods = usePersistedStore((state) => state.localMods);
  const activeProfileId = usePersistedStore((state) => state.activeProfileId);
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
  const toggleSelection = (id: string) =>
    setSelection((current) => {
      const ids = new Set(
        current?.profileId === activeProfileId ? current.ids : [],
      );
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return { profileId: activeProfileId, ids };
    });
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

  const selectionBusy =
    isDisablingAll || isEnablingAll || isSwitching || bisectActive;

  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.GRID);
  const [activeTab, setActiveTab] = useState<LibraryTab>(ModFilter.All);
  const isConflictsTab = activeTab === CONFLICTS_TAB;
  const { groups: conflictGroups, statusByMod: conflictStatusByMod } =
    useProfileConflicts();
  const conflictCount = conflictGroups.length;
  const hiddenModelCount = conflictGroups.filter(
    (group) => group.severity === "critical",
  ).length;
  const showConflicts = () => setActiveTab(CONFLICTS_TAB);
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false);
  const updatePercent = usePersistedStore((state) =>
    getUpdatePercent(state.batchUpdateProgress),
  );
  const [showModOrdering, setShowModOrdering] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
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

  const displayMods = useMemo(() => {
    const baseMods = query.trim() ? results : mods;
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

  const visibleMods = useMemo(
    () =>
      paginationEnabled
        ? displayMods.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
        : displayMods,
    [displayMods, page, paginationEnabled],
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

  const copyModList = async (includeDisabled: boolean) => {
    try {
      await navigator.clipboard.writeText(
        formatModList(mods, includeDisabled, t("myMods.copyModListDisabled")),
      );
      toast.success(
        t("myMods.copyModListSuccess", {
          count: includeDisabled ? mods.length : enabledModsCount,
        }),
      );
    } catch {
      toast.error(t("myMods.copyModListFailed"));
    }
  };

  return (
    <div className='flex min-h-0 w-full flex-1 flex-col px-4'>
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
              <div className='border-border/80 bg-muted/40 inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm shadow-sm'>
                <div className='flex items-baseline gap-1.5 tabular-nums'>
                  <span className='inline-flex items-baseline gap-px font-semibold text-foreground'>
                    <span>{enabledModsCount}</span>
                    <span className='font-normal text-muted-foreground'>
                      /{mods.length}
                    </span>
                  </span>
                  <span className='font-normal text-muted-foreground'>
                    {t("myMods.libraryModsNoun", { count: mods.length })}
                  </span>
                </div>
                <span aria-hidden className='h-3.5 w-px shrink-0 bg-border' />
                <div className='flex items-baseline gap-1.5 tabular-nums'>
                  <span className='font-semibold text-foreground'>
                    {enabledVpkFileCount}
                  </span>
                  <span className='font-normal text-muted-foreground'>
                    {t("myMods.vpkFilesNoun")}
                  </span>
                </div>
              </div>
            )}
          </div>
          <p className='text-muted-foreground'>{t("myMods.subtitle")}</p>
        </div>

        <div className='flex min-w-0 flex-1 flex-wrap items-center justify-start gap-2 xl:justify-end'>
          {updatableCount > 0 && (
            <UpdateButton
              variant='default'
              onClick={() => setShowBatchUpdateDialog(true)}
              updatePercent={updatePercent}>
              {t("myMods.updateAvailableCount", { count: updatableCount })}
            </UpdateButton>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                disabled={isCheckingUpdates}
                onClick={() => refetchUpdates()}
                icon={
                  <RefreshCw
                    className={`h-4 w-4 ${isCheckingUpdates ? "animate-spin" : ""}`}
                  />
                }>
                {t("myMods.checkForUpdates")}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t("myMods.checkForUpdatesTooltip")}
            </TooltipContent>
          </Tooltip>
          <Button
            variant='outline'
            onClick={() => navigate("/add-mods")}
            icon={<UploadSimple className='h-4 w-4' />}>
            {t("navigation.addMods")}
          </Button>
          <ImportSourceMenu />
          {!selecting && (
            <Button
              variant='outline'
              disabled={selectionBusy || isConflictsTab}
              onClick={() =>
                setSelection({ profileId: activeProfileId, ids: new Set() })
              }>
              {t("myMods.selection.start")}
            </Button>
          )}
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
              <DropdownMenuItem
                onClick={startAnalysis}
                disabled={isAnalysisPending}>
                <ScanSearch className='h-4 w-4' />
                {isAnalysisPending
                  ? t("addons.analyzing")
                  : t("addons.analyzeLocal")}
              </DropdownMenuItem>
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
                onClick={openModOrdering}
                disabled={installedMods.length === 0}>
                <ArrowUpDown className='h-4 w-4' />
                {t("mods.manageOrder")}
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
                onClick={() => {
                  markFeatureUsed("find-broken-mod");
                  openFindBrokenMod();
                }}
                disabled={enabledModsCount === 0 || bisectActive}>
                <Bug className='h-4 w-4' />
                {t("bisect.entry")}
              </DropdownMenuItem>
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

      {selecting && (
        <LibrarySelectionBar
          count={selectedIds.size}
          busy={selectionBusy}
          working={isDisablingAll || isEnablingAll}
          canEnable={mods.some(
            (mod) =>
              selectedIds.has(mod.remoteId) &&
              mod.status === ModStatus.Downloaded,
          )}
          canDisable={mods.some(
            (mod) =>
              selectedIds.has(mod.remoteId) && isInstalledModWithVpks(mod),
          )}
          onSelectFiltered={() =>
            setSelection({
              profileId: activeProfileId,
              ids: new Set([
                ...selectedIds,
                ...displayMods.map((mod) => mod.remoteId),
              ]),
            })
          }
          onClear={() =>
            setSelection({ profileId: activeProfileId, ids: new Set() })
          }
          onDone={() => setSelection(null)}
          onEnable={() => enableAll(selectedIds)}
          onDisable={() => disableAll(selectedIds)}
        />
      )}

      <div
        className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden pt-8 pb-4'
        ref={scrollContainerRef}>
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
                <div className='flex w-full flex-col gap-3 px-px'>
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
                      showTimePeriodControl={false}
                      trailingActions={
                        <div className='flex h-9 items-center gap-0.5 rounded-lg border border-border/50 bg-secondary/40 p-0.5'>
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
                                  viewMode === ViewMode.GRID
                                    ? "secondary"
                                    : "ghost"
                                }
                                icon={<LayoutGrid className='h-4 w-4' />}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("mods.gridView")}
                            </TooltipContent>
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
                                  viewMode === ViewMode.LIST
                                    ? "secondary"
                                    : "ghost"
                                }
                                icon={<LayoutList className='h-4 w-4' />}
                              />
                            </TooltipTrigger>
                            <TooltipContent>
                              {t("mods.listView")}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      }
                      hideMapFilter={!isCustomMapsEnabled}
                      inputGroupClassName='min-w-0 w-full'
                      searchContainerClassName='w-full min-w-32 max-w-80'
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
                      selection={
                        selecting
                          ? {
                              ids: selectedIds,
                              busy: selectionBusy,
                              toggle: toggleSelection,
                            }
                          : undefined
                      }
                      mods={visibleMods}
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
                      selection={
                        selecting
                          ? {
                              ids: selectedIds,
                              busy: selectionBusy,
                              toggle: toggleSelection,
                            }
                          : undefined
                      }
                      mods={visibleMods}
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
                      selection={
                        selecting
                          ? {
                              ids: selectedIds,
                              busy: selectionBusy,
                              toggle: toggleSelection,
                            }
                          : undefined
                      }
                      mods={visibleMods}
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
            onOpenChange={setShowBatchUpdateDialog}
            updates={updatableMods}
          />
          <ModOrderingDialog
            open={showModOrdering}
            onOpenChange={setShowModOrdering}
          />
          <ExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
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
    </div>
  );
};

export default MyMods;
