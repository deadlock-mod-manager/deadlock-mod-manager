import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardFooter } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@deadlock-mods/ui/components/tabs";
import { ArrowLeft, Settings, Trash } from "@deadlock-mods/ui/icons";
import {
  ChatCircleIcon,
  ClockCounterClockwiseIcon,
  CubeIcon,
  FilesIcon,
  InfoIcon,
  Warning,
} from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import FavoriteButton from "@/components/mod-browsing/favorite-button";
import ModButton from "@/components/mod-browsing/mod-button";
import { InstalledVpksSection } from "@/components/mod-detail/installed-vpks-section";
import { ModAudioPreview } from "@/components/mod-detail/mod-audio-preview";
import { ModChangelog } from "@/components/mod-detail/mod-changelog";
import { ModCommissionButton } from "@/components/mod-detail/mod-commission-button";
import { ModComments } from "@/components/mod-detail/mod-comments";
import { ModDependencies } from "@/components/mod-detail/mod-dependencies";
import { ModDescription } from "@/components/mod-detail/mod-description";
import { ModFiles } from "@/components/mod-detail/mod-files";
import { ModModelPreview } from "@/components/mod-detail/mod-model-preview";
import { ModGallery } from "@/components/mod-detail/mod-gallery";
import { ModHero } from "@/components/mod-detail/mod-hero";
import { ModInfo } from "@/components/mod-detail/mod-info";
import { MapHowToPlay } from "@/components/mod-detail/map-how-to-play";
import { SupportAuthor } from "@/components/mod-detail/support-author";
import { VpkReplacementSection } from "@/components/mod-detail/vpk-replacement-section";
import { ModPageSkeleton } from "@/components/mod-detail/mod-page-skeleton";
import { ModOptionsDialog } from "@/components/mod-management/mod-options-dialog";
import { ModHealthAlert } from "@/components/mod-health/mod-health-alert";
import { ObsoleteModWarning } from "@/components/mod-management/obsolete-mod-warning";
import { ConfigListingNotice } from "@/components/mod-browsing/config-listing";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { ReinstallModButton } from "@/components/mod-management/reinstall-mod-button";
import { StaleModWarning } from "@/components/mod-management/stale-mod-warning";
import { BatchUpdateDialog } from "@/components/my-mods/batch-update-dialog";
import { UpdateButton } from "@/components/my-mods/update-button";
import { BrokenModButton } from "@/components/reports/report-button";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useConfigListing } from "@/hooks/performance/use-config-listing";
import { useExperimentalFeature } from "@/hooks/use-experimental-feature";
import { useMod } from "@/hooks/use-mod";
import { useModDetailNavigation } from "@/hooks/use-mod-detail-navigation";
import { useResolvedDependencies } from "@/hooks/use-mod-dependencies";
import {
  useActiveProfileFolder,
  useModHealthReport,
} from "@/hooks/use-mod-health";
import { useModOptions } from "@/hooks/use-mod-options";
import { useModDownloads } from "@/hooks/use-mod-downloads";
import { useReportCounts } from "@/hooks/use-report-counts";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useScrollBackButton } from "@/hooks/use-scroll-back-button";
import useUninstall from "@/hooks/use-uninstall";
import { getErrorMessage } from "@/lib/errors";
import { isLocalMod } from "@/lib/mods/installed-helpers";
import { getUpdatePercent } from "@/lib/mods/batch-update-progress";
import { healthByModId, showsDateOutdatedWarning } from "@/lib/mods/mod-health";
import { usePersistedStore } from "@/lib/store";
import { findLocalMod } from "@/lib/store/selectors";
import { useCheckUpdates, useModHasUpdate } from "@/hooks/use-check-updates";
import { isModOutdated, isModStale } from "@/lib/utils";
import { ModStatus } from "@/types/mods";
import { NetworkDiagnosticsButton } from "@/components/shared/network-diagnostics-dialog";

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { collection, backLabel, goBack, analyticsEntryPoint } =
    useModDetailNavigation();
  const isCustomMapsEnabled = useExperimentalFeature("custom-maps");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [selectedTab, setSelectedTab] = useState({
    modId: "",
    tab: "overview",
  });

  const { data: mod, error, isLoading } = useMod(params.id);

  const isModPageReady = !isLoading && !!mod;

  useScrollBackButton({
    threshold: 100,
    enabled: isModPageReady,
    scrollContainerRef,
    sentinelRef: backButtonRef,
    onBackClick: goBack,
  });

  const isGameBananaMod = !!params.id && !params.id.includes("local");
  const configListingKind = useConfigListing(mod);
  const {
    availableFiles,
    isSuccess: filesLoaded,
    errorUpdateCount: filesErrorCount,
    isFetching: isFetchingFiles,
    refetch: refetchFiles,
  } = useModDownloads({
    remoteId: params.id,
    isDownloadable: mod?.downloadable,
    enabled: isGameBananaMod,
  });
  // Retrying resets a failed query to pending, so keep the failure until it loads.
  const filesLoadFailed = !filesLoaded && filesErrorCount > 0;

  const developerMode = usePersistedStore((state) => state.developerMode);
  const setModDownloads = usePersistedStore((state) => state.setModDownloads);
  const localMod = usePersistedStore((state) =>
    findLocalMod(state.localMods, mod?.remoteId),
  );
  const resolvedDependencies = useResolvedDependencies(
    mod?.dependencies ?? undefined,
  );

  useEffect(() => {
    if (
      localMod &&
      availableFiles.length > 0 &&
      (!localMod.downloads || localMod.downloads.length === 0)
    ) {
      setModDownloads(localMod.remoteId, availableFiles);
    }
  }, [localMod, availableFiles, setModDownloads]);

  const profileFolder = useActiveProfileFolder();
  const healthReport = useModHealthReport(profileFolder);
  const health = localMod
    ? healthByModId(healthReport.data).get(localMod.remoteId)
    : undefined;
  const { updatableMods } = useCheckUpdates();
  const hasUpdate = useModHasUpdate(localMod);
  const updatePercent = usePersistedStore((state) =>
    mod?.remoteId
      ? getUpdatePercent(state.batchUpdateProgress, mod.remoteId)
      : undefined,
  );

  const { data: reportCounts } = useReportCounts(
    mod?.isMap ? "" : (mod?.id ?? ""),
  );
  const staleResult =
    mod && !mod.isMap && reportCounts ? isModStale(mod, reportCounts) : null;

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const isInstalled = localMod?.status === ModStatus.Installed;
  const hasImages = mod?.images && mod.images.length > 0;
  const hasHero = !!mod?.hero || hasImages || !!mod?.isAudio;
  const canPreviewModel = !mod?.isAudio && !mod?.isMap && !shouldBlur;
  const activeTab =
    selectedTab.modId === mod?.remoteId ? selectedTab.tab : "overview";
  const selectTab = (tab: string) =>
    setSelectedTab({ modId: mod?.remoteId ?? "", tab });
  const openModelPreview = () => {
    selectTab("3d");
    tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const [deleting, setDeleting] = useState(false);
  const { uninstall } = useUninstall();

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  const downloadableFileCount = mod?.downloadable ? availableFiles.length : 0;
  const installedVpks = isInstalled ? localMod?.installedVpks : undefined;
  const hasFilesTab =
    downloadableFileCount > 0 ||
    (!!mod?.downloadable && filesLoadFailed) ||
    !!installedVpks?.length ||
    (developerMode && !!localMod);

  const modOptions = useModOptions(localMod ?? null);

  const forceUpdate = () => {
    if (!mod || !availableFiles?.length) return;
    setUpdateDialogOpen(true);
  };

  const forceUpdateData = useMemo(
    () =>
      mod && availableFiles?.length ? [{ mod, downloads: availableFiles }] : [],
    [mod, availableFiles],
  );

  const currentModUpdate = useMemo(
    () =>
      updatableMods.filter((update) => update.mod.remoteId === mod?.remoteId),
    [updatableMods, mod?.remoteId],
  );

  const effectiveUpdateData = useMemo(
    () => (currentModUpdate.length > 0 ? currentModUpdate : forceUpdateData),
    [currentModUpdate, forceUpdateData],
  );

  const deleteMod = async () => {
    if (!localMod) {
      return;
    }

    try {
      setDeleting(true);
      await uninstall(localMod, true);
    } catch (error) {
      toast.error(`Failed to remove mod: ${getErrorMessage(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  if (error && !isLoading) {
    return (
      <ErrorBoundary>
        <div className='w-full overflow-y-auto overflow-x-hidden px-4'>
          <div className='container mx-auto max-w-6xl space-y-6 py-6'>
            <div className='mb-4 flex items-center justify-between'>
              <Button
                className='flex items-center gap-1'
                onClick={goBack}
                size='sm'
                variant='ghost'>
                <ArrowLeft className='h-4 w-4' />
                <span className='max-w-96 truncate' title={backLabel}>
                  {backLabel}
                </span>
              </Button>
            </div>

            <Alert>
              <Warning className='h-6 w-6' />
              <AlertDescription className='flex flex-grow flex-row items-center justify-between gap-2'>
                <div className='flex flex-col gap-2'>
                  <p>{t("errors.genericMessage")}</p>
                  <pre className='text-sm'>
                    {t("errors.errorCode")}{" "}
                    {(error as Error)?.message ?? t("errors.unknownError")}
                  </pre>
                </div>
                <div className='flex flex-col items-center justify-center gap-2'>
                  <Button onClick={() => window.location.reload()}>
                    {t("errors.tryAgain")}
                  </Button>
                  <NetworkDiagnosticsButton size='sm' />
                  <Button onClick={goBack} variant='ghost'>
                    {t("modDetail.goBackHome")}
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </ErrorBoundary>
    );
  }

  if (isLoading || !mod) {
    return (
      <ErrorBoundary>
        <ModPageSkeleton />
      </ErrorBoundary>
    );
  }

  if (nsfwSettings.hideNSFW && mod.isNSFW) {
    return (
      <Alert>
        <AlertDescription>{t("privacy.hideNSFWContent")}</AlertDescription>
        <Button
          onClick={() =>
            navigate("/settings", { state: { activeTab: "privacy" } })
          }
          variant='outline'>
          {t("navigation.settings")}
        </Button>
      </Alert>
    );
  }

  return (
    <ErrorBoundary>
      <div
        ref={scrollContainerRef}
        className='w-full overflow-y-auto overflow-x-hidden px-4 will-change-transform'>
        <div className='container mx-auto max-w-6xl space-y-6 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <Button
              ref={backButtonRef}
              className='flex items-center gap-1'
              onClick={goBack}
              size='sm'
              variant='ghost'>
              <ArrowLeft className='h-4 w-4' />
              <span className='max-w-96 truncate' title={backLabel}>
                {backLabel}
              </span>
            </Button>
          </div>
          {mod.isObsolete && (
            <div className='mb-4'>
              <ObsoleteModWarning variant='alert' />
            </div>
          )}
          {configListingKind && isGameBananaMod && (
            <div className='mb-4'>
              <ConfigListingNotice
                listing={configListingKind}
                remoteId={mod.remoteId}
              />
            </div>
          )}
          {showsDateOutdatedWarning(
            isModOutdated(mod) && configListingKind !== "confirmed",
            health,
          ) &&
            !staleResult && (
              <div className='mb-4'>
                <OutdatedModWarning variant='alert' />
              </div>
            )}
          {localMod && (
            <ModHealthAlert
              className='mb-4'
              mod={localMod}
              health={health}
              isOutdated={isModOutdated(mod)}
            />
          )}
          {staleResult && (
            <div className='mb-4'>
              <StaleModWarning
                variant='alert'
                openReportCount={staleResult.openReportCount}
                lastUpdatedAt={staleResult.lastUpdatedAt}
              />
            </div>
          )}

          <Card className='overflow-hidden space-y-4 shadow-none [contain:layout_style_paint]'>
            <ModHero
              mod={mod}
              shouldBlur={shouldBlur}
              actions={
                <BrokenModButton
                  mod={mod}
                  localMod={localMod}
                  hasUpdate={hasUpdate}
                  onTriggerUpdate={() => setUpdateDialogOpen(true)}
                  variant='hero'
                />
              }
              cornerAction={
                canPreviewModel && (
                  <Button
                    className='gap-1.5 rounded-full border border-white/15 bg-black/40 text-white shadow-lg backdrop-blur-md hover:bg-black/60 hover:text-white'
                    onClick={openModelPreview}
                    size='sm'
                    variant='ghost'>
                    <CubeIcon className='size-4' />
                    {t("modDetail.viewIn3d")}
                  </Button>
                )
              }
            />
            <ModInfo
              hasHero={hasHero}
              mod={mod}
              activeArchiveNames={modOptions.activeArchiveNames}
              collection={collection}
              totalDownloads={modOptions.downloads.length}
            />
            {mod.metadata?.donationLinks &&
              mod.metadata.donationLinks.length > 0 && (
                <SupportAuthor
                  donationLinks={mod.metadata.donationLinks}
                  isInstalled={isInstalled}
                />
              )}
            <CardFooter className='z-20 flex items-center justify-between gap-2 border-t border-border/40 bg-card px-6 py-3'>
              {mod.remoteUrl && (
                <Button
                  className='px-0'
                  onClick={async () => {
                    try {
                      await openUrl(mod.remoteUrl);
                    } catch (_error) {
                      toast.error(t("notifications.failedToOpenForumPost"));
                    }
                  }}
                  variant='link'>
                  {t("modDetail.viewOriginalPost")}
                </Button>
              )}
              <div className='flex items-center gap-2'>
                {modOptions.showButton && (
                  <Button
                    icon={<Settings className='h-4 w-4' />}
                    onClick={modOptions.open}
                    size='default'
                    variant='outline'>
                    {t("modOptions.openTooltip")}
                  </Button>
                )}
                {mod.modAuthorId && (
                  <ModCommissionButton authorId={mod.modAuthorId} />
                )}
                <FavoriteButton remoteId={mod.remoteId} variant='inline' />
                {hasUpdate && (
                  <UpdateButton
                    onClick={() => setUpdateDialogOpen(true)}
                    size='default'
                    updatePercent={updatePercent}
                    variant='default'>
                    {t("modDetail.updateMod")}
                  </UpdateButton>
                )}
                {isInstalled && !hasUpdate && availableFiles?.length > 0 && (
                  <UpdateButton
                    onClick={forceUpdate}
                    size='default'
                    updatePercent={updatePercent}
                    variant='outline'>
                    {t("modDetail.forceUpdate")}
                  </UpdateButton>
                )}
                {localMod && !isLocalMod(localMod) && (
                  <ReinstallModButton mod={localMod} variant='default' />
                )}
                <ModButton
                  remoteMod={mod}
                  variant='default'
                  analyticsEntryPoint={analyticsEntryPoint}
                />
                {!!localMod?.status && (
                  <Button
                    icon={<Trash className='h-4 w-4' />}
                    isLoading={deleting}
                    onClick={deleteMod}
                    size='default'
                    variant='destructive'>
                    {t("mods.deleteMod")}
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
          <ModDependencies
            dependencies={resolvedDependencies}
            modId={mod.remoteId}
          />

          <Tabs
            className='scroll-mt-4'
            onValueChange={selectTab}
            ref={tabsRef}
            value={activeTab}>
            <TabsList>
              <TabsTrigger className='gap-1.5' value='overview'>
                <InfoIcon className='size-4' />
                {t("modDetail.tabs.overview")}
              </TabsTrigger>
              {canPreviewModel && (
                <TabsTrigger className='gap-1.5' value='3d'>
                  <CubeIcon className='size-4' />
                  {t("modDetail.tabs.model")}
                </TabsTrigger>
              )}
              {isGameBananaMod && (
                <>
                  <TabsTrigger className='gap-1.5' value='changelog'>
                    <ClockCounterClockwiseIcon className='size-4' />
                    {t("modDetail.tabs.changelog")}
                    {hasUpdate && (
                      <span
                        aria-label={t("modDetail.tabs.updateAvailable")}
                        className='size-1.5 rounded-full bg-primary'
                        role='img'
                      />
                    )}
                  </TabsTrigger>
                  <TabsTrigger className='gap-1.5' value='comments'>
                    <ChatCircleIcon className='size-4' />
                    {t("modDetail.tabs.comments")}
                  </TabsTrigger>
                </>
              )}
              {hasFilesTab && (
                <TabsTrigger className='gap-1.5' value='files'>
                  <FilesIcon className='size-4' />
                  {t("modDetail.tabs.files")}
                  {downloadableFileCount > 0 && (
                    <span className='text-muted-foreground text-xs tabular-nums'>
                      {downloadableFileCount}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent className='mt-4 space-y-4' value='overview'>
              {mod.isMap && isCustomMapsEnabled && (
                <MapHowToPlay
                  mapName={mod.metadata?.mapName}
                  isInstalled={isInstalled}
                />
              )}

              {mod.description && (
                <ModDescription description={mod.description} />
              )}

              {mod.audioUrl && (
                <ModAudioPreview
                  audioUrl={mod.audioUrl}
                  isAudio={!!mod.isAudio}
                />
              )}

              {!mod.isAudio && hasImages && mod.images && (
                <ModGallery
                  images={mod.images}
                  nsfwSettings={nsfwSettings}
                  onNSFWToggle={(visible) => handleNSFWToggle(visible)}
                  shouldBlur={shouldBlur}
                />
              )}
            </TabsContent>

            {canPreviewModel && (
              <TabsContent className='mt-4' value='3d'>
                <ModModelPreview mod={mod} localMod={localMod} />
              </TabsContent>
            )}

            {isGameBananaMod && (
              <>
                <TabsContent className='mt-4' value='changelog'>
                  <ModChangelog
                    installedAt={
                      isInstalled && localMod?.downloadedAt
                        ? new Date(localMod.downloadedAt)
                        : undefined
                    }
                    remoteId={mod.remoteId}
                  />
                </TabsContent>
                <TabsContent className='mt-4' value='comments'>
                  <ModComments
                    remoteId={mod.remoteId}
                    remoteUrl={mod.remoteUrl}
                  />
                </TabsContent>
              </>
            )}

            {hasFilesTab && (
              <TabsContent className='mt-4 space-y-4' value='files'>
                <ModFiles
                  files={availableFiles}
                  isDownloadable={!!mod.downloadable}
                  loadFailed={filesLoadFailed}
                  isRetrying={isFetchingFiles}
                  onRetry={() => refetchFiles()}
                />

                {!!installedVpks?.length && (
                  <InstalledVpksSection vpks={installedVpks} />
                )}

                {developerMode && localMod && (
                  <VpkReplacementSection mod={localMod} />
                )}
              </TabsContent>
            )}
          </Tabs>
        </div>

        <BatchUpdateDialog
          isSingleMod={true}
          onOpenChange={setUpdateDialogOpen}
          open={updateDialogOpen}
          updates={effectiveUpdateData}
        />
        {modOptions.showButton && localMod && (
          <ModOptionsDialog
            isOpen={modOptions.isOpen}
            onOpenChange={(open) =>
              open ? modOptions.open() : modOptions.close()
            }
            isSaving={modOptions.isSaving}
            onCancelApply={modOptions.cancelApply}
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
      </div>
    </ErrorBoundary>
  );
};

export default Mod;
