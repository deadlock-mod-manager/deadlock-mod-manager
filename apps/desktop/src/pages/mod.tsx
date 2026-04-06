import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardFooter } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowLeft, RefreshCw, Trash } from "@deadlock-mods/ui/icons";
import { Warning } from "@phosphor-icons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import ModButton from "@/components/mod-browsing/mod-button";
import { InstalledFilesDisplay } from "@/components/mod-detail/installed-files-display";
import { ModAudioPreview } from "@/components/mod-detail/mod-audio-preview";
import { ModDescription } from "@/components/mod-detail/mod-description";
import { ModFiles } from "@/components/mod-detail/mod-files";
import { ModGallery } from "@/components/mod-detail/mod-gallery";
import { ModHero } from "@/components/mod-detail/mod-hero";
import { ModInfo } from "@/components/mod-detail/mod-info";
import { MapHowToPlay } from "@/components/mod-detail/map-how-to-play";
import { VpkReplacementSection } from "@/components/mod-detail/vpk-replacement-section";
import { ObsoleteModWarning } from "@/components/mod-management/obsolete-mod-warning";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { StaleModWarning } from "@/components/mod-management/stale-mod-warning";
import { BatchUpdateDialog } from "@/components/my-mods/batch-update-dialog";
import { BrokenModButton } from "@/components/reports/report-button";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useFeatureFlag } from "@/hooks/use-feature-flags";
import { useMod } from "@/hooks/use-mod";
import { useModDownloads } from "@/hooks/use-mod-downloads";
import { useReportCounts } from "@/hooks/use-report-counts";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useScrollBackButton } from "@/hooks/use-scroll-back-button";
import useUninstall from "@/hooks/use-uninstall";
import { usePersistedStore } from "@/lib/store";
import { useCheckUpdates } from "@/hooks/use-check-updates";
import { isModOutdated, isModStale } from "@/lib/utils";
import { ModStatus } from "@/types/mods";

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isEnabled: isCustomMapsEnabled } = useFeatureFlag(
    "custom-maps",
    false,
  );
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data: mod, error, isLoading } = useMod(params.id);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/mods");
    }
  }, [navigate]);

  const handleBackClick = useCallback(() => {
    goBack();
  }, [goBack]);

  useScrollBackButton({
    threshold: 100,
    enabled: true,
    scrollContainerRef,
    onBackClick: handleBackClick,
  });

  const { availableFiles } = useModDownloads({
    remoteId: params.id,
    isDownloadable: mod?.downloadable,
    enabled: !!params.id && !params.id?.includes("local"),
  });

  const localMods = usePersistedStore((state) => state.localMods);
  const developerMode = usePersistedStore((state) => state.developerMode);
  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const { updatableMods } = useCheckUpdates();
  const hasUpdate = updatableMods.some(
    (update) => update.mod.remoteId === mod?.remoteId,
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
  const [deleting, setDeleting] = useState(false);
  const { uninstall } = useUninstall();

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

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
      toast.error(`Failed to remove mod: ${error}`);
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
                {t("modDetail.backToMods")}
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
    return null;
  }

  return (
    <ErrorBoundary>
      <div
        ref={scrollContainerRef}
        className='w-full overflow-y-auto overflow-x-hidden px-4 will-change-transform'>
        <div className='container mx-auto max-w-6xl space-y-6 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <Button
              className='flex items-center gap-1'
              onClick={goBack}
              size='sm'
              variant='ghost'>
              <ArrowLeft className='h-4 w-4' />
              Back to Mods
            </Button>
          </div>
          {mod.isObsolete && (
            <div className='mb-4'>
              <ObsoleteModWarning variant='alert' />
            </div>
          )}
          {isModOutdated(mod) && !staleResult && (
            <div className='mb-4'>
              <OutdatedModWarning variant='alert' />
            </div>
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
            <ModHero mod={mod} shouldBlur={shouldBlur} />
            <ModInfo hasHero={hasHero} mod={mod} />
            <CardFooter className='z-20 flex flex-row items-start justify-between bg-card'>
              <div className='flex flex-col gap-2'>
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
              </div>

              <div className='flex items-center gap-2'>
                <BrokenModButton
                  mod={mod}
                  localMod={localMod}
                  hasUpdate={hasUpdate}
                  onTriggerUpdate={() => setUpdateDialogOpen(true)}
                />
                <ModButton remoteMod={mod} variant='default' />
                {hasUpdate && (
                  <Button
                    icon={<RefreshCw className='h-4 w-4' />}
                    onClick={() => setUpdateDialogOpen(true)}
                    size='lg'
                    variant='default'>
                    {t("modDetail.updateMod")}
                  </Button>
                )}
                {isInstalled && !hasUpdate && availableFiles?.length > 0 && (
                  <Button
                    icon={<RefreshCw className='h-4 w-4' />}
                    onClick={forceUpdate}
                    size='lg'
                    variant='outline'>
                    {t("modDetail.forceUpdate")}
                  </Button>
                )}
                {!!localMod?.status && (
                  <Button
                    icon={<Trash className='h-4 w-4' />}
                    isLoading={deleting}
                    onClick={deleteMod}
                    size='lg'
                    variant='destructive'>
                    Delete Mod
                  </Button>
                )}
              </div>
            </CardFooter>
          </Card>
          {mod.isMap && isCustomMapsEnabled && (
            <MapHowToPlay
              mapName={mod.metadata?.mapName}
              isInstalled={isInstalled}
            />
          )}

          {mod.description && <ModDescription description={mod.description} />}

          {developerMode && localMod && (
            <VpkReplacementSection mod={localMod} />
          )}

          {isInstalled && localMod?.installedFileTree && (
            <InstalledFilesDisplay
              fileTree={localMod.installedFileTree}
              modName={mod.name}
            />
          )}

          <ModFiles
            files={availableFiles}
            isDownloadable={!!mod.downloadable}
          />

          {mod.audioUrl && (
            <ModAudioPreview audioUrl={mod.audioUrl} isAudio={!!mod.isAudio} />
          )}

          {!mod.isAudio && hasImages && mod.images && (
            <ModGallery
              images={mod.images}
              nsfwSettings={nsfwSettings}
              onNSFWToggle={(visible) => handleNSFWToggle(visible)}
              shouldBlur={shouldBlur}
            />
          )}
        </div>

        <BatchUpdateDialog
          isSingleMod={true}
          onOpenChange={setUpdateDialogOpen}
          open={updateDialogOpen}
          updates={effectiveUpdateData}
        />
      </div>
    </ErrorBoundary>
  );
};

export default Mod;
