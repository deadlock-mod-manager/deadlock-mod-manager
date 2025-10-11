import { Alert, AlertDescription } from "@deadlock-mods/ui/components/alert";
import { Button } from "@deadlock-mods/ui/components/button";
import { Card, CardFooter } from "@deadlock-mods/ui/components/card";
import { toast } from "@deadlock-mods/ui/components/sonner";
import { ArrowLeft, Trash } from "@deadlock-mods/ui/icons";
import { Warning } from "@phosphor-icons/react";
import { open } from "@tauri-apps/plugin-shell";
import { useCallback, useRef, useState } from "react";
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
import { VpkReplacementSection } from "@/components/mod-detail/vpk-replacement-section";
import { OutdatedModWarning } from "@/components/mod-management/outdated-mod-warning";
import { ReportButton } from "@/components/reports/report-button";
import { ReportCounter } from "@/components/reports/report-counter";
import ErrorBoundary from "@/components/shared/error-boundary";
import { useMod } from "@/hooks/use-mod";
import { useModDownloads } from "@/hooks/use-mod-downloads";
import { useNSFWBlur } from "@/hooks/use-nsfw-blur";
import { useScrollBackButton } from "@/hooks/use-scroll-back-button";
import useUninstall from "@/hooks/use-uninstall";
import { usePersistedStore } from "@/lib/store";
import { isModOutdated } from "@/lib/utils";
import { type ModDownloadItem, ModStatus } from "@/types/mods";

const Mod = () => {
  const params = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data: mod, error, isLoading } = useMod(params.id);

  const handleBackClick = useCallback(() => {
    navigate("/mods");
  }, [navigate]);

  useScrollBackButton({
    threshold: 100,
    enabled: true,
    scrollContainerRef,
    onBackClick: handleBackClick,
  });

  const { availableFiles: rawAvailableFiles } = useModDownloads({
    remoteId: params.id,
    isDownloadable: mod?.downloadable,
    enabled: !!params.id && !params.id?.includes("local"),
  });

  const availableFiles = rawAvailableFiles as unknown as ModDownloadItem[];

  const { localMods, developerMode } = usePersistedStore();
  const localMod = localMods.find((m) => m.remoteId === mod?.remoteId);

  const { shouldBlur, handleNSFWToggle, nsfwSettings } = useNSFWBlur(mod);

  const isInstalled = localMod?.status === ModStatus.Installed;
  const hasImages = mod?.images && mod.images.length > 0;
  const hasHero = !!mod?.hero || !!mod?.isAudio;
  const [deleting, setDeleting] = useState(false);
  const { uninstall } = useUninstall();

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
        <div className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin w-full overflow-y-auto overflow-x-hidden px-4'>
          <div className='container mx-auto max-w-6xl space-y-6 py-6'>
            <div className='mb-4 flex items-center justify-between'>
              <Button
                className='flex items-center gap-1'
                onClick={() => navigate("/mods")}
                size='sm'
                variant='ghost'>
                <ArrowLeft className='h-4 w-4' />
                Back to Mods
              </Button>
            </div>

            <Alert>
              <Warning className='h-6 w-6' />
              <AlertDescription className='flex flex-grow flex-row items-center justify-between gap-2'>
                <div className='flex flex-col gap-2'>
                  <p>{t("errors.genericMessage")}</p>
                  <pre className='text-sm'>
                    {t("errors.errorCode")}{" "}
                    {(error as Error)?.message ?? "Unknown error occurred"}
                  </pre>
                </div>
                <div className='flex flex-col items-center justify-center gap-2'>
                  <Button onClick={() => window.location.reload()}>
                    {t("errors.tryAgain")}
                  </Button>
                  <Button onClick={() => navigate("/mods")} variant='ghost'>
                    Go Back Home
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
        className='scrollbar-thumb-primary scrollbar-track-secondary scrollbar-thin w-full overflow-y-auto overflow-x-hidden px-4'>
        <div className='container mx-auto max-w-6xl space-y-6 py-6'>
          <div className='mb-4 flex items-center justify-between'>
            <Button
              className='flex items-center gap-1'
              onClick={() => navigate("/mods")}
              size='sm'
              variant='ghost'>
              <ArrowLeft className='h-4 w-4' />
              Back to Mods
            </Button>
          </div>
          {isModOutdated(mod) && (
            <div className='mb-4'>
              <OutdatedModWarning variant='alert' />
            </div>
          )}

          <Card className='overflow-hidde space-y-4'>
            <ModHero mod={mod} shouldBlur={shouldBlur} />
            <ModInfo hasHero={hasHero} mod={mod} />

            <CardFooter className='z-20 flex flex-row items-start justify-between bg-card'>
              <div className='flex flex-col gap-2'>
                {mod.remoteUrl && (
                  <Button
                    className='px-0'
                    onClick={async () => {
                      try {
                        await open(mod.remoteUrl);
                      } catch (_error) {
                        toast.error("Failed to open forum post");
                      }
                    }}
                    variant='link'>
                    View original forum post
                  </Button>
                )}
              </div>

              <div className='flex items-center gap-2'>
                <ReportButton mod={mod} />
                <ModButton remoteMod={mod} variant='default' />
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

          <ReportCounter modId={mod.id} variant='default' />

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
      </div>
    </ErrorBoundary>
  );
};

export default Mod;
