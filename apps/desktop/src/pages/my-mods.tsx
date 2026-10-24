import { Checkbox } from "@deadlock-mods/ui/components/checkbox";
import { LibrarySelectionBar } from "@/components/my-mods/library-selection-bar";
import { ModGroupTools } from "@/components/my-mods/mod-group-tools";
import { NukeReinstallDialog } from "@/components/my-mods/nuke-reinstall-dialog";
import type { ModGroupActions } from "@/components/my-mods/mod-group-enablement";
import { LibraryModGroups } from "@/components/my-mods/library-mod-groups";
import { DraggableLibraryMod } from "@/components/my-mods/draggable-library-mod";
import { groupLibraryMods } from "@/lib/mods/library-groups";
import { EMPTY_MOD_GROUPS } from "@/lib/store/slices/mod-groups";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
  SquareCheck,
  TriangleAlert,
  Wrench,
} from "@deadlock-mods/ui/icons";
import { Radioactive, Trash } from "@phosphor-icons/react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BatchUpdateButton } from "@/components/my-mods/batch-update-button";
import { ExportDialog } from "@/components/mod-interchange/export-dialog";
import { AddModsMenu } from "@/components/mod-interchange/add-mods-menu";
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
import { useDeleteMods } from "@/hooks/use-delete-mods";
import { useDisableAllMods } from "@/hooks/use-disable-all-mods";
import { useEnableAllMods } from "@/hooks/use-enable-all-mods";
import { ModUpdateBadge } from "@/components/mod-management/mod-update-badges";
import { useModHasUpdate, useCheckUpdates } from "@/hooks/use-check-updates";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useStuckAttribute } from "@/hooks/use-stuck-attribute";
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
import type { ModConflictStatus } from "@/lib/mods/conflicts";
import { isInstalledModWithVpks } from "@/lib/mods/installed-helpers";
import { getModCoverImage } from "@/lib/mods/mod-images";
import { healthByModId, showsDateOutdatedWarning } from "@/lib/mods/mod-health";
import { cn, isModOutdated } from "@/lib/utils";
import { useThemeBackdropSurfaceStyle } from "@/plugins/themes/components/theme-backdrop";
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
  onSelect: ((id: string) => void) | undefined;
};

const GridModCard = memo(function GridModCard({
  mod,
  conflictStatus,
  onShowConflicts,
  health,
  contextMenuHint,
  onSelect,
}: ModCardProps) {
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
    <ModContextMenu
      hint={contextMenuHint}
      mod={mod}
      onSelect={onSelect ? () => onSelect(mod.remoteId) : undefined}>
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
});

const ListModCard = memo(function ListModCard({
  mod,
  conflictStatus,
  onShowConflicts,
  health,
  contextMenuHint,
  onSelect,
}: ModCardProps) {
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
      <ModContextMenu
        hint={contextMenuHint}
        mod={mod}
        onSelect={onSelect ? () => onSelect(mod.remoteId) : undefined}>
        <Card className='group/row flex items-center gap-4 overflow-hidden pr-3 shadow transition-colors hover:bg-muted/40'>
          <div
            className={cn(
              "relative h-16 w-28 shrink-0 transition-[filter] duration-300 ease-out",
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
                className='h-full w-full cursor-pointer overflow-hidden'
                disableBlur={nsfwSettings.disableBlur}
                isNSFW={shouldBlur}
                onToggleVisibility={handleNSFWToggle}>
                <img
                  alt={mod.name}
                  className='h-full w-full object-cover transition-transform duration-300 ease-out group-hover/row:scale-105'
                  decoding='async'
                  height='160'
                  loading='lazy'
                  src={getModCoverImage(mod)}
                  width='160'
                />
              </NSFWBlur>
            ) : (
              <div className='h-full w-full cursor-pointer bg-secondary' />
            )}
            {mod.status === ModStatus.Installing && (
              <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
                <Loader2 className='h-5 w-5 animate-spin text-primary' />
              </div>
            )}
          </div>

          <div className='min-w-0 flex-1 py-2'>
            <h3
              className={cn(
                "cursor-pointer truncate font-semibold transition-colors",
                isDisabled && "text-muted-foreground",
              )}
              onClick={openModDetail}
              title={mod.name}>
              {mod.name}
            </h3>
            <p className='truncate text-muted-foreground text-sm'>
              <LibraryModAuthor mod={mod} />{" "}
              {mod.isAudio && `• ${t("mods.audioMod")}`}
            </p>
          </div>

          <div className='flex min-w-0 flex-wrap items-center justify-end gap-1 empty:hidden'>
            <ModUpdateBadge
              mod={mod}
              hasUpdate={hasUpdate}
              className='text-xs'
            />
            <ModHealthBadge
              className='text-xs'
              health={health}
              isOutdated={isModOutdated(mod)}
            />
            {showsDateOutdatedWarning(isModOutdated(mod), health) && (
              <OutdatedModWarning className='text-xs' variant='indicator' />
            )}
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
            {mod.remoteUrl?.startsWith("local://") && (
              <Badge variant='outline' className='text-xs'>
                {t("mods.customBadge")}
              </Badge>
            )}
          </div>

          <div className='flex shrink-0 items-center gap-1'>
            {modOptions.showButton && (
              <ModOptionsButton
                activeCount={modOptions.activeVariantCount}
                onOpen={modOptions.open}
              />
            )}
            <ModButton remoteMod={mod} variant='iconOnly' />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("mods.removeMod")}
                  disabled={isInstalling || deleting}
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
});

const ModsList = ({
  mods,
  allMods,
  revealMatches,
  showEmptyGroups,
  viewMode,
  conflictStatusByMod,
  onShowConflicts,
  healthById,
  contextMenuHint,
  selection,
  groupActions,
  onSelectMod,
}: {
  onSelectMod: (id: string) => void;
  groupActions: ModGroupActions;
  selection: {
    active: boolean;
    ids: ReadonlySet<string>;
    busy: boolean;
    /** `extend` selects the range from the last toggled mod. */
    toggle: (id: string, extend: boolean) => void;
  };
  healthById: ReadonlyMap<string, ModHealth>;
  mods: LocalMod[];
  allMods: LocalMod[];
  revealMatches: boolean;
  showEmptyGroups: boolean;
  viewMode: ViewMode;
  conflictStatusByMod: ReadonlyMap<string, ModConflictStatus>;
  onShowConflicts: () => void;
  /** Points the right-click hint at the first card. */
  contextMenuHint: boolean;
}) => {
  const { t } = useTranslation();
  const ModCard = viewMode === ViewMode.GRID ? GridModCard : ListModCard;
  const profileId = usePersistedStore((state) => state.activeProfileId);
  return (
    <LibraryModGroups
      key={profileId}
      mods={mods}
      allMods={allMods}
      revealMatches={revealMatches}
      showEmptyGroups={showEmptyGroups}
      selectedIds={selection.ids}
      actions={groupActions}
      renderMods={(members, draggable) => (
        <div
          className={
            viewMode === ViewMode.GRID
              ? "grid grid-cols-[repeat(auto-fill,minmax(min(100%,14rem),1fr))] gap-3"
              : "flex flex-col gap-2"
          }>
          {members.map((mod, index) => {
            const selected = selection.ids.has(mod.remoteId);
            return (
              <DraggableLibraryMod
                id={mod.remoteId}
                disabled={!draggable || selection.busy}
                key={mod.remoteId}>
                <div
                  inert={selection.busy}
                  key={mod.remoteId}
                  onClickCapture={
                    selection.active
                      ? undefined
                      : (event) => {
                          if (
                            !(event.ctrlKey || event.metaKey || event.shiftKey)
                          )
                            return;
                          event.preventDefault();
                          event.stopPropagation();
                          selection.toggle(mod.remoteId, false);
                        }
                  }
                  className={cn(
                    "group/select relative h-full rounded-xl transition-opacity",
                    selection.active && "select-none",
                    selected && "outline-2 outline-primary -outline-offset-2",
                    selection.active &&
                      selection.ids.size > 0 &&
                      !selected &&
                      "opacity-60 hover:opacity-100",
                  )}>
                  <Checkbox
                    aria-label={t("myMods.selection.selectMod", {
                      name: mod.name,
                    })}
                    checked={selected}
                    disabled={selection.busy}
                    onClick={(event) => {
                      event.preventDefault();
                      selection.toggle(mod.remoteId, event.shiftKey);
                    }}
                    className={cn(
                      "absolute top-2 left-2 z-20 size-5 rounded-full border-2 border-white/80 bg-black/50 shadow-md transition-opacity data-[state=checked]:border-primary [&_svg]:size-3.5",
                      !selection.active &&
                        "opacity-0 group-hover/select:opacity-100 focus-visible:opacity-100",
                    )}
                  />
                  {selection.active && (
                    <button
                      aria-hidden
                      data-library-selection-surface
                      className='absolute inset-0 z-10 cursor-pointer rounded-xl'
                      onClick={(event) =>
                        selection.toggle(mod.remoteId, event.shiftKey)
                      }
                      tabIndex={-1}
                      type='button'
                    />
                  )}
                  <ModCard
                    conflictStatus={conflictStatusByMod.get(mod.remoteId)}
                    contextMenuHint={
                      !selection.active && contextMenuHint && index === 0
                    }
                    mod={mod}
                    onSelect={selection.active ? undefined : onSelectMod}
                    onShowConflicts={onShowConflicts}
                    health={healthById.get(mod.remoteId)}
                  />
                </div>
              </DraggableLibraryMod>
            );
          })}
        </div>
      )}
    />
  );
};

const MyMods = () => {
  const { t } = useTranslation();
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
  const selectMod = useCallback(
    (id: string) => {
      selectionAnchor.current = id;
      setSelection((current) => {
        const ids = new Set(
          current?.profileId === activeProfileId ? current.ids : [],
        );
        if (ids.has(id)) ids.delete(id);
        else ids.add(id);
        return { profileId: activeProfileId, ids };
      });
    },
    [activeProfileId],
  );
  const toggleSelection = (id: string, extend: boolean) => {
    const anchorIndex = visibleMods.findIndex(
      (mod) => mod.remoteId === selectionAnchor.current,
    );
    const targetIndex = visibleMods.findIndex((mod) => mod.remoteId === id);
    const range =
      extend && selecting && anchorIndex !== -1 && targetIndex !== -1
        ? visibleMods
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
  };
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
                      showTimePeriodControl={false}
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
                      onSelectMod={selectMod}
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
                      onSelectMod={selectMod}
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
                      onSelectMod={selectMod}
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
